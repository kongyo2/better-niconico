import { ok, err } from 'neverthrow';
import { StreamInfo, VideoAudioStreams, DownloadResult } from './types';

/**
 * Scans the DOM for the Master M3U8 URL from system messages.
 * Mimics nico_downloader's MasterURLGet logic but searches by text content
 * to be robust against class name changes.
 */
export function getMasterUrl(): DownloadResult<string> {
  // 1. Try to get from Performance API (Most reliable for modern Niconico/Domand)
  const resources = performance.getEntriesByType('resource');
  // Look for master playlist.
  // Domand URL patterns often include 'playlists/variants/' for master.
  // Exclude 'playlists/media/' which are individual streams.
  const masterEntry = resources.find(
    (r) => r.name.includes('.m3u8') && r.name.includes('playlists/variants/'),
  );

  if (masterEntry) {
    return ok(masterEntry.name);
  }

  // Fallback: Check for other m3u8 if strict variant check fails (older videos?)
  const anyM3u8 = resources.find(
    (r) => r.name.includes('.m3u8') && !r.name.includes('playlists/media/'), // Exclude media playlists
  );

  if (anyM3u8) {
    return ok(anyM3u8.name);
  }

  // 2. Fallback to DOM Scraping (Original nico_downloader logic)
  // First try the specific SystemMessageContainer class from nico_downloader
  const systemMessages = document.querySelectorAll('.c_monotone.L80');
  const targetText = '動画の初期化処理が完了しました';
  const regex = /(動画の初期化処理が完了しました).*/;

  for (const element of Array.from(systemMessages)) {
    const text = (element as HTMLElement).innerText;
    if (text && text.includes(targetText)) {
      const match = text.match(regex);
      if (match) {
        const parts = text.split('(');
        if (parts.length >= 2) {
          let url = parts[1];
          url = url.replace(/\)$/, '');
          if (
            url.startsWith('https://') &&
            (url.includes('.m3u8') || url.includes('delivery.domand.nicovideo.jp'))
          ) {
            return ok(url);
          }
        }
      }
    }
  }

  // Fallback: search in player area if specific selector didn't work
  const playerArea = document.querySelector('.grid-area_\\[player\\]');
  if (!playerArea) {
    return err({
      type: 'MASTER_URL_NOT_FOUND',
      message: 'Master URL not found in network logs or system messages',
    });
  }

  // Strategy: Find all elements that might contain the message.
  const candidates = playerArea.querySelectorAll('div, span, li, p');

  for (const element of Array.from(candidates)) {
    // Check if directly contains text (optimization)
    if (element.textContent && element.textContent.includes(targetText)) {
      // Check innerText to match nico_downloader's logic
      const text = (element as HTMLElement).innerText;
      const match = text.match(regex);
      if (match) {
        // Extract URL: nico_downloader does: string.replace...
        // "動画の初期化処理が完了しました (https://...)" -> "https://..."
        // We expect the format: "動画の初期化処理が完了しました (URL)"
        const parts = text.split('(');
        if (parts.length >= 2) {
          let url = parts[1];
          // Remove trailing ')'
          url = url.replace(/\)$/, '');
          // Simple validation
          if (
            url.startsWith('https://') &&
            (url.includes('.m3u8') || url.includes('delivery.domand.nicovideo.jp'))
          ) {
            return ok(url);
          }
        }
      }
    }
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
    const response = await fetch(masterUrl);
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
          const url = lines[i + 1].trim();
          videos.push({ bandwidth, resolution, url });
        }
      } else if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO')) {
        // Audio Stream
        // Format: #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Main",DEFAULT=YES,URI="https://..."
        const uriMatch = line.match(/URI="(.*?)"/);
        if (uriMatch) {
          const url = uriMatch[1];
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
