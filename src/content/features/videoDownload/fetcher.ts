import { ok, err } from 'neverthrow';
import { DownloadResult } from './types';

/**
 * Segment data structure for M3U8-based muxing
 * Uses original filenames extracted from URLs (like nico_downloader)
 */
export interface SegmentInfo {
    name: string;     // Original filename from URL
    data: Uint8Array; // Segment data
}

export interface PlaylistData {
    playlist: string;       // M3U8 with URLs replaced to local filenames
    segments: SegmentInfo[]; // Individual segment files with original names
}

/**
 * Extract filename from URL (like nico_downloader's MakeTSFilename)
 * Removes domain, path, and query parameters
 */
function extractFilename(url: string): string {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        // Get last segment of path
        const parts = pathname.split('/');
        return parts[parts.length - 1] || 'segment.ts';
    } catch {
        // Fallback for relative URLs
        const parts = url.split('/');
        const lastPart = parts[parts.length - 1];
        // Remove query string
        return lastPart.split('?')[0] || 'segment.ts';
    }
}

/**
 * Replace URLs in M3U8 content with local filenames (like nico_downloader's ReplaceURLToM3u8s)
 */
function replaceUrlsInPlaylist(playlistText: string, baseUrl: string): { modifiedPlaylist: string; segmentUrls: { url: string; filename: string }[] } {
    const lines = playlistText.split('\n');
    const modifiedLines: string[] = [];
    const segmentUrls: { url: string; filename: string }[] = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // EXT-X-MAP (initialization segment)
        if (trimmed.startsWith('#EXT-X-MAP:')) {
            const uriMatch = trimmed.match(/URI="([^"]+)"/);
            if (uriMatch) {
                const uri = uriMatch[1];
                const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                const filename = extractFilename(fullUrl);
                segmentUrls.push({ url: fullUrl, filename });
                // Replace URI with local filename
                modifiedLines.push(trimmed.replace(/URI="[^"]+"/, `URI="${filename}"`));
            } else {
                modifiedLines.push(trimmed);
            }
            continue;
        }

        // EXT-X-KEY (encryption key)
        if (trimmed.startsWith('#EXT-X-KEY:')) {
            const uriMatch = trimmed.match(/URI="([^"]+)"/);
            if (uriMatch) {
                const uri = uriMatch[1];
                const fullUrl = uri.startsWith('http') ? uri : baseUrl + uri;
                const filename = extractFilename(fullUrl);
                segmentUrls.push({ url: fullUrl, filename });
                modifiedLines.push(trimmed.replace(/URI="[^"]+"/, `URI="${filename}"`));
            } else {
                modifiedLines.push(trimmed);
            }
            continue;
        }

        // Regular segment (non-# lines)
        if (trimmed && !trimmed.startsWith('#')) {
            const fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
            const filename = extractFilename(fullUrl);
            segmentUrls.push({ url: fullUrl, filename });
            modifiedLines.push(filename);
            continue;
        }

        // Copy other lines as-is (tags like #EXTINF)
        modifiedLines.push(trimmed);
    }

    return {
        modifiedPlaylist: modifiedLines.join('\n'),
        segmentUrls
    };
}

/**
 * Downloads all segments and returns them with original filenames
 * and a modified M3U8 playlist (like nico_downloader)
 */
export async function downloadSegmentsForMux(
    playlistUrl: string,
    _prefix: string,  // Unused now - using original filenames
    onProgress: (percent: number) => void
): Promise<DownloadResult<PlaylistData>> {
    try {
        // 1. Fetch Playlist
        const playlistResp = await fetch(playlistUrl);
        if (!playlistResp.ok) {
            return err({ type: 'FETCH_ERROR', message: `Failed to fetch media playlist`, cause: playlistResp });
        }
        const playlistText = await playlistResp.text();
        const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

        // 2. Parse and modify playlist (replace URLs with local filenames)
        const { modifiedPlaylist, segmentUrls } = replaceUrlsInPlaylist(playlistText, baseUrl);

        if (segmentUrls.length === 0) {
            return err({ type: 'UNKNOWN_ERROR', message: 'No segments found in media playlist', cause: null });
        }

        console.log(`[BetterNiconico] Found ${segmentUrls.length} segments`);

        // 3. Download Segments
        const totalSegments = segmentUrls.length;
        let completed = 0;
        const concurrency = 3;
        const segments: SegmentInfo[] = Array.from({ length: totalSegments });

        let hasError = false;
        let errorDetails: unknown = null;

        async function worker(index: number) {
            if (hasError) return;
            try {
                const { url, filename } = segmentUrls[index];
                const resp = await fetch(url, { credentials: 'include' });
                if (!resp.ok) throw new Error(`Segment fetch failed: ${resp.status}`);
                const buffer = await resp.arrayBuffer();

                segments[index] = {
                    name: filename,
                    data: new Uint8Array(buffer)
                };

                completed++;
                onProgress(completed / totalSegments);
            } catch (e) {
                hasError = true;
                errorDetails = e;
            }
        }

        const queue = segmentUrls.map((_, i) => i);

        async function runPool() {
            const promises: Promise<void>[] = [];
            while (queue.length > 0) {
                if (hasError) break;
                if (promises.length < concurrency) {
                    const idx = queue.shift();
                    if (idx !== undefined) {
                        const p = worker(idx).then(() => {
                            promises.splice(promises.indexOf(p), 1);
                        });
                        promises.push(p);
                    }
                } else {
                    await Promise.race(promises);
                }
            }
            await Promise.all(promises);
        }

        await runPool();

        if (hasError) {
            return err({ type: 'FETCH_ERROR', message: 'Failed to download segments', cause: errorDetails });
        }

        return ok({
            playlist: modifiedPlaylist,
            segments: segments.filter(s => s != null)
        });

    } catch (e) {
        return err({ type: 'FETCH_ERROR', message: 'Exception during segment download', cause: e });
    }
}

/**
 * Downloads all segments and concatenates them (legacy, for backwards compatibility)
 */
export async function downloadSegments(
    playlistUrl: string,
    onProgress: (percent: number) => void
): Promise<DownloadResult<Uint8Array>> {
    const result = await downloadSegmentsForMux(playlistUrl, '', onProgress);

    if (result.isErr()) {
        return err(result.error);
    }

    // Concatenate all segments
    const segments = result.value.segments;
    const totalLength = segments.reduce((acc, seg) => acc + seg.data.length, 0);
    const concatenated = new Uint8Array(totalLength);
    let offset = 0;
    for (const seg of segments) {
        concatenated.set(seg.data, offset);
        offset += seg.data.length;
    }

    return ok(concatenated);
}
