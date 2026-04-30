import { ok, err } from 'neverthrow';
import { StreamInfo, VideoAudioStreams, DownloadResult } from './types';

interface MasterUrlOptions {
  minStartTime?: number;
}

interface WatchApiResponse {
  data?: {
    response?: {
      client?: {
        watchTrackId?: string;
      };
      media?: {
        domand?: {
          accessRightKey?: string;
          videos?: DomandVideo[];
          audios?: DomandAudio[];
        };
      };
    };
  };
}

interface DomandVideo {
  id?: string;
  isAvailable?: boolean;
  qualityLevel?: number;
}

interface DomandAudio {
  id?: string;
  isAvailable?: boolean;
  qualityLevel?: number;
}

interface AccessRightResponse {
  data?: {
    contentUrl?: string;
  };
}

const PLAYER_AREA_SELECTOR = '.grid-area_\\[player\\]';

function isMasterPlaylistUrl(url: string): boolean {
  return url.includes('.m3u8') && url.includes('playlists/variants/');
}

function isMediaPlaylistUrl(url: string): boolean {
  return url.includes('playlists/media/');
}

function getRecentResourceEntries(minStartTime = 0): PerformanceEntry[] {
  const entries: PerformanceEntry[] = [];

  for (const entry of performance.getEntriesByType('resource')) {
    if (entry.startTime < minStartTime) {
      continue;
    }

    const insertIndex = entries.findIndex((current) => current.startTime < entry.startTime);
    if (insertIndex === -1) {
      entries.push(entry);
    } else {
      entries.splice(insertIndex, 0, entry);
    }
  }

  return entries;
}

function extractMasterUrlFromText(text: string): string | null {
  const parts = text.split('(');
  if (parts.length < 2) {
    return null;
  }

  const url = parts[1].replace(/\)$/, '').trim();
  if (
    url.startsWith('https://') &&
    (url.includes('.m3u8') || url.includes('delivery.domand.nicovideo.jp'))
  ) {
    return url;
  }

  return null;
}

function resolvePlaylistUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function findMasterUrlInElements(elements: Iterable<Element>): string | null {
  const targetText = '動画の初期化処理が完了しました';
  const regex = /(動画の初期化処理が完了しました).*/;
  const elementList = Array.from(elements);

  for (let i = elementList.length - 1; i >= 0; i--) {
    const element = elementList[i];
    const text = (element as HTMLElement).innerText;
    if (text && text.includes(targetText)) {
      const match = text.match(regex);
      if (match) {
        const url = extractMasterUrlFromText(text);
        if (url) {
          return url;
        }
      }
    }
  }

  return null;
}

function createDomandOutputs(videos: DomandVideo[], audios: DomandAudio[]): string[][] {
  const availableVideos = videos
    .filter((video): video is DomandVideo & { id: string } =>
      Boolean(video.id && video.isAvailable),
    )
    .sort((a, b) => (b.qualityLevel ?? 0) - (a.qualityLevel ?? 0));
  const availableAudios = audios
    .filter((audio): audio is DomandAudio & { id: string } =>
      Boolean(audio.id && audio.isAvailable),
    )
    .sort((a, b) => (b.qualityLevel ?? 0) - (a.qualityLevel ?? 0));

  const outputs: string[][] = [];
  for (const video of availableVideos) {
    for (const audio of availableAudios) {
      outputs.push([video.id, audio.id]);
    }
  }

  return outputs;
}

/**
 * Requests a fresh master playlist for the current video through Niconico's
 * watch/access-rights API. This avoids stale HLS URLs left in performance logs
 * after SPA navigation.
 */
export async function getMasterUrlFromWatchApi(videoId: string): Promise<DownloadResult<string>> {
  try {
    const encodedVideoId = encodeURIComponent(videoId);
    const watchResponse = await fetch(
      `https://www.nicovideo.jp/watch/${encodedVideoId}?responseType=json`,
      { credentials: 'include' },
    );

    if (!watchResponse.ok) {
      return err({
        type: 'FETCH_ERROR',
        message: `Failed to fetch watch data: ${watchResponse.status} ${watchResponse.statusText}`,
        cause: watchResponse,
      });
    }

    const watchData = (await watchResponse.json()) as WatchApiResponse;
    const response = watchData.data?.response;
    const domand = response?.media?.domand;
    const accessRightKey = domand?.accessRightKey;
    const watchTrackId = response?.client?.watchTrackId;
    const outputs = createDomandOutputs(domand?.videos ?? [], domand?.audios ?? []);

    if (!accessRightKey || !watchTrackId || outputs.length === 0) {
      return err({
        type: 'MASTER_URL_NOT_FOUND',
        message: 'Current video access rights data not found',
      });
    }

    const accessRightResponse = await fetch(
      `https://nvapi.nicovideo.jp/v1/watch/${encodedVideoId}/access-rights/hls?actionTrackId=${encodeURIComponent(
        watchTrackId,
      )}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          accept: 'application/json;charset=utf-8',
          'content-type': 'application/json',
          'x-access-right-key': accessRightKey,
          'x-frontend-id': '6',
          'x-frontend-version': '0',
          'x-niconico-language': 'ja-jp',
          'x-request-with': 'nicovideo',
        },
        body: JSON.stringify({ outputs }),
      },
    );

    if (!accessRightResponse.ok) {
      return err({
        type: 'FETCH_ERROR',
        message: `Failed to fetch access rights: ${accessRightResponse.status} ${accessRightResponse.statusText}`,
        cause: accessRightResponse,
      });
    }

    const accessRightData = (await accessRightResponse.json()) as AccessRightResponse;
    const contentUrl = accessRightData.data?.contentUrl;
    if (!contentUrl) {
      return err({
        type: 'MASTER_URL_NOT_FOUND',
        message: 'Current video master URL not found in access rights response',
      });
    }

    return ok(contentUrl);
  } catch (e) {
    return err({
      type: 'FETCH_ERROR',
      message: 'Exception during current master URL fetch',
      cause: e,
    });
  }
}

/**
 * Scans the DOM for the Master M3U8 URL from system messages.
 * Mimics nico_downloader's MasterURLGet logic but searches by text content
 * to be robust against class name changes.
 */
export function getMasterUrl(options: MasterUrlOptions = {}): DownloadResult<string> {
  // 1. Try to get from Performance API (Most reliable for modern Niconico/Domand)
  const resources = getRecentResourceEntries(options.minStartTime);
  // Look for master playlist.
  // Domand URL patterns often include 'playlists/variants/' for master.
  // Exclude 'playlists/media/' which are individual streams.
  const masterEntry = resources.find((entry) => isMasterPlaylistUrl(entry.name));

  if (masterEntry) {
    return ok(masterEntry.name);
  }

  // Fallback: Check for other m3u8 if strict variant check fails (older videos?)
  const anyM3u8 = resources.find(
    (entry) => entry.name.includes('.m3u8') && !isMediaPlaylistUrl(entry.name),
  );

  if (anyM3u8) {
    return ok(anyM3u8.name);
  }

  // 2. Fallback to DOM scraping in the current player area.
  // Global system-message searches can pick a stale URL left behind after SPA navigation.
  const playerArea = document.querySelector(PLAYER_AREA_SELECTOR);
  if (!playerArea) {
    return err({
      type: 'MASTER_URL_NOT_FOUND',
      message: 'Master URL not found in network logs or system messages',
    });
  }

  const systemMessageUrl = findMasterUrlInElements(playerArea.querySelectorAll('.c_monotone.L80'));
  if (systemMessageUrl) {
    return ok(systemMessageUrl);
  }

  const candidates = playerArea.querySelectorAll('div, span, li, p');
  const candidateUrl = findMasterUrlInElements(candidates);
  if (candidateUrl) {
    return ok(candidateUrl);
  }

  return err({
    type: 'MASTER_URL_NOT_FOUND',
    message: 'Master URL not found in network logs or system messages',
  });
}

/**
 * Fetches and parses the Master Playlist to find the best video and audio streams.
 */
export async function getVariantStreams(
  masterUrl: string,
): Promise<DownloadResult<VideoAudioStreams>> {
  try {
    const response = await fetch(masterUrl, { credentials: 'include' });
    if (!response.ok) {
      return err({
        type: 'FETCH_ERROR',
        message: `Failed to fetch master playlist: ${response.status} ${response.statusText}`,
        cause: response,
      });
    }
    const text = await response.text();

    // Parse M3U8
    const lines = text.split('\n');
    const videos: StreamInfo[] = [];
    const audios: StreamInfo[] = [];

    // Simple parser
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Video Stream
        const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;

        const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
        const resolution = resolutionMatch ? resolutionMatch[1] : 'unknown';

        // formatting
        // URL is on the next line
        if (i + 1 < lines.length) {
          const url = resolvePlaylistUrl(lines[i + 1].trim(), masterUrl);
          videos.push({ bandwidth, resolution, url });
        }
      } else if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO')) {
        // Audio Stream
        // Format: #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="https://..."
        const uriMatch = line.match(/URI="(.*?)"/);
        if (uriMatch) {
          const url = resolvePlaylistUrl(uriMatch[1], masterUrl);
          // Audio usually doesn't have bandwidth in the tag itself, but we prefer higher quality if multiple?
          // Usually there is only one or separate tracks. We'll collect all.
          audios.push({ bandwidth: 0, resolution: 'audio', url });
        }
      }
    }

    if (videos.length === 0) {
      return err({
        type: 'UNKNOWN_ERROR',
        message: 'No video streams found in master playlist',
        cause: text,
      });
    }

    // Select best video (highest bandwidth)
    videos.sort((a, b) => b.bandwidth - a.bandwidth);
    const bestVideo = videos[0];

    // Select Audio
    // If no explicit audio media tag, sometimes it's muxed?
    // But Domand usually separates them.
    // If we have EXT-X-MEDIA, use it.
    let bestAudio: StreamInfo;
    if (audios.length > 0) {
      // Just take the first one or try to find one that matches video group logic?
      // For simplicity and matching nico_downloader (which takes the first EXT-X-MEDIA), we take the first one.
      bestAudio = audios[0];
    } else {
      // Fallback: If no audio tag, maybe it's in the video stream (rare for HLS H.264+AAC separate)
      // Or maybe we failed to parse.
      // We will assume separate audio is required as per 'merge' requirement.
      return err({
        type: 'UNKNOWN_ERROR',
        message: 'No audio streams found in master playlist',
        cause: text,
      });
    }

    return ok({ video: bestVideo, audio: bestAudio });
  } catch (e) {
    return err({ type: 'FETCH_ERROR', message: 'Exception during playlist fetch/parse', cause: e });
  }
}
