import { Result } from 'neverthrow';

export type DownloadError =
    | { type: 'DOM_ELEMENT_NOT_FOUND'; message: string }
    | { type: 'MASTER_URL_NOT_FOUND'; message: string }
    | { type: 'FETCH_ERROR'; message: string; cause: unknown }
    | { type: 'FFMPEG_ERROR'; message: string; cause: unknown }
    | { type: 'UNKNOWN_ERROR'; message: string; cause: unknown }
    | { type: 'ABORT_ERROR'; message: string };

export interface StreamInfo {
    resolution: string;
    bandwidth: number;
    url: string;
}

export interface VideoAudioStreams {
    video: StreamInfo;
    audio: StreamInfo;
}

export type DownloadResult<T> = Result<T, DownloadError>;
