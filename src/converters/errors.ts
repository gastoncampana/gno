/**
 * Converter error types and helpers.
 * PRD §8.3 - Error model
 */

import type { ConvertError, ConvertErrorCode, ConvertInput } from './types';

type ConvertErrorOpts = Omit<ConvertError, 'code'>;

/**
 * Create a ConvertError with the given code and options.
 */
export function convertError(
  code: ConvertErrorCode,
  opts: ConvertErrorOpts
): ConvertError {
  return { code, ...opts };
}

/**
 * Check if an error code indicates a retryable failure.
 */
export function isRetryable(code: ConvertErrorCode): boolean {
  return ['TIMEOUT', 'IO', 'ADAPTER_FAILURE'].includes(code);
}

/**
 * Create a standard error result for unsupported file types.
 */
export function unsupportedError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext'>,
  converterId = 'registry'
): ConvertError {
  return convertError('UNSUPPORTED', {
    message: `No converter for ${input.mime} (${input.ext})`,
    retryable: false,
    fatal: false,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
  });
}

/**
 * Create an error for files exceeding size limits.
 */
export function tooLargeError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext' | 'bytes' | 'limits'>,
  converterId: string
): ConvertError {
  return convertError('TOO_LARGE', {
    message: `File size ${input.bytes.length} exceeds limit ${input.limits.maxBytes}`,
    retryable: false,
    fatal: false,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
    details: {
      size: input.bytes.length,
      limit: input.limits.maxBytes,
    },
  });
}

/**
 * Create an error for conversion timeouts.
 */
export function timeoutError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext' | 'limits'>,
  converterId: string
): ConvertError {
  return convertError('TIMEOUT', {
    message: `Conversion timed out after ${input.limits.timeoutMs}ms`,
    retryable: true,
    fatal: false,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
    details: {
      timeoutMs: input.limits.timeoutMs,
    },
  });
}

/**
 * Create an error for corrupt or invalid files.
 */
export function corruptError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext'>,
  converterId: string,
  message: string,
  cause?: unknown
): ConvertError {
  return convertError('CORRUPT', {
    message,
    retryable: false,
    fatal: false,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
    cause,
  });
}

/**
 * Create an error for adapter-level failures.
 */
export function adapterError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext'>,
  converterId: string,
  message: string,
  cause?: unknown
): ConvertError {
  return convertError('ADAPTER_FAILURE', {
    message,
    retryable: true,
    fatal: false,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
    cause,
  });
}

/**
 * Create an error for internal pipeline failures.
 */
export function internalError(
  input: Pick<ConvertInput, 'sourcePath' | 'mime' | 'ext'>,
  converterId: string,
  message: string,
  cause?: unknown
): ConvertError {
  return convertError('INTERNAL', {
    message,
    retryable: false,
    fatal: true,
    converterId,
    sourcePath: input.sourcePath,
    mime: input.mime,
    ext: input.ext,
    cause,
  });
}
