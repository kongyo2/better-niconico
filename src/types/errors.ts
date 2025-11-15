// Better Niconico Error Type Definitions
// Domain-specific error types for type-safe error handling using Result types

/**
 * Chrome Storage API related errors
 */
export type StorageError =
  | { type: 'storage_get_failed'; message: string }
  | { type: 'storage_set_failed'; message: string }
  | { type: 'storage_sync_unavailable'; message: string };

/**
 * WebGPU initialization and processing errors
 */
export type WebGPUError =
  | { type: 'webgpu_not_supported'; message: string }
  | { type: 'webgpu_adapter_unavailable'; message: string }
  | { type: 'webgpu_initialization_failed'; message: string; cause?: unknown }
  | { type: 'webgpu_render_failed'; message: string; cause?: unknown };

/**
 * Video element detection and processing errors
 */
export type VideoError =
  | { type: 'video_element_not_found'; message: string }
  | { type: 'video_not_ready'; message: string; retryCount: number }
  | { type: 'video_dimensions_invalid'; message: string; width: number; height: number }
  | { type: 'video_parent_missing'; message: string }
  | { type: 'canvas_creation_failed'; message: string };

/**
 * Page context errors
 */
export type PageError =
  | { type: 'invalid_page'; message: string; currentPath: string }
  | { type: 'dom_element_not_found'; message: string; selector: string };

/**
 * Message passing errors
 */
export type MessageError =
  | { type: 'invalid_message_action'; message: string; action: string }
  | { type: 'message_response_failed'; message: string; cause?: unknown };

/**
 * Union of all application errors
 */
export type AppError =
  | StorageError
  | WebGPUError
  | VideoError
  | PageError
  | MessageError;

/**
 * Helper function to create StorageError
 */
export function storageGetFailedError(message: string): StorageError {
  return { type: 'storage_get_failed', message };
}

export function storageSetFailedError(message: string): StorageError {
  return { type: 'storage_set_failed', message };
}

export function storageSyncUnavailableError(message: string): StorageError {
  return { type: 'storage_sync_unavailable', message };
}

/**
 * Helper function to create WebGPUError
 */
export function webgpuNotSupportedError(message: string): WebGPUError {
  return { type: 'webgpu_not_supported', message };
}

export function webgpuAdapterUnavailableError(message: string): WebGPUError {
  return { type: 'webgpu_adapter_unavailable', message };
}

export function webgpuInitializationFailedError(message: string, cause?: unknown): WebGPUError {
  return { type: 'webgpu_initialization_failed', message, cause };
}

export function webgpuRenderFailedError(message: string, cause?: unknown): WebGPUError {
  return { type: 'webgpu_render_failed', message, cause };
}

/**
 * Helper function to create VideoError
 */
export function videoElementNotFoundError(message: string): VideoError {
  return { type: 'video_element_not_found', message };
}

export function videoNotReadyError(message: string, retryCount: number): VideoError {
  return { type: 'video_not_ready', message, retryCount };
}

export function videoDimensionsInvalidError(
  message: string,
  width: number,
  height: number,
): VideoError {
  return { type: 'video_dimensions_invalid', message, width, height };
}

export function videoParentMissingError(message: string): VideoError {
  return { type: 'video_parent_missing', message };
}

export function canvasCreationFailedError(message: string): VideoError {
  return { type: 'canvas_creation_failed', message };
}

/**
 * Helper function to create PageError
 */
export function invalidPageError(message: string, currentPath: string): PageError {
  return { type: 'invalid_page', message, currentPath };
}

export function domElementNotFoundError(message: string, selector: string): PageError {
  return { type: 'dom_element_not_found', message, selector };
}

/**
 * Helper function to create MessageError
 */
export function invalidMessageActionError(message: string, action: string): MessageError {
  return { type: 'invalid_message_action', message, action };
}

export function messageResponseFailedError(message: string, cause?: unknown): MessageError {
  return { type: 'message_response_failed', message, cause };
}
