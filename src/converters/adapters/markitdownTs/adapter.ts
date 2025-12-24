/**
 * markitdown-ts adapter for PDF, DOCX, XLSX conversion.
 * Uses convertBuffer() with bytes for determinism.
 */

import { MarkItDown } from 'markitdown-ts';
import {
  adapterError,
  corruptError,
  timeoutError,
  tooLargeError,
} from '../../errors';
import type {
  Converter,
  ConvertInput,
  ConvertResult,
  ConvertWarning,
} from '../../types';

const CONVERTER_ID = 'adapter/markitdown-ts' as const;
const CONVERTER_VERSION = '0.0.8';

/** Supported extensions for this adapter */
const SUPPORTED_EXTENSIONS = ['.pdf', '.docx', '.xlsx'];

/** Supported MIME types */
const SUPPORTED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const markitdownAdapter: Converter = {
  id: CONVERTER_ID,
  version: CONVERTER_VERSION,

  canHandle(mime: string, ext: string): boolean {
    return SUPPORTED_EXTENSIONS.includes(ext) || SUPPORTED_MIMES.includes(mime);
  },

  async convert(input: ConvertInput): Promise<ConvertResult> {
    // 1. Check size limit (defense in depth; EPIC 5 does stat-based pre-check)
    if (input.bytes.length > input.limits.maxBytes) {
      return { ok: false, error: tooLargeError(input, CONVERTER_ID) };
    }

    // 2. Setup timeout promise
    // Note: markitdown-ts doesn't support AbortSignal, so underlying
    // work may continue after timeout (known limitation; process isolation future work)
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, input.limits.timeoutMs);
    });

    try {
      const converter = new MarkItDown();

      // IMPORTANT: Use convertBuffer with bytes for determinism
      // Path-based convert() could re-read a modified file
      const result = await Promise.race([
        converter.convertBuffer(Buffer.from(input.bytes), {
          file_extension: input.ext,
        }),
        timeoutPromise,
      ]);

      // Clear timeout on success
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (!result?.markdown) {
        return {
          ok: false,
          error: corruptError(input, CONVERTER_ID, 'Empty conversion result'),
        };
      }

      // Emit warnings for suspicious output
      const warnings: ConvertWarning[] = [];
      if (result.markdown.length < 10 && input.bytes.length > 1000) {
        warnings.push({ code: 'LOSSY', message: 'Suspiciously short output' });
      }

      // NOTE: Canonicalization happens in pipeline.ts, not here
      return {
        ok: true,
        value: {
          markdown: result.markdown,
          title: result.title ?? undefined,
          meta: {
            converterId: CONVERTER_ID,
            converterVersion: CONVERTER_VERSION,
            sourceMime: input.mime,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        },
      };
    } catch (err) {
      // Clear timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle timeout
      if (err instanceof Error && err.message === 'TIMEOUT') {
        return { ok: false, error: timeoutError(input, CONVERTER_ID) };
      }

      // Map adapter errors
      return {
        ok: false,
        error: adapterError(
          input,
          CONVERTER_ID,
          err instanceof Error ? err.message : 'Unknown error',
          err
        ),
      };
    }
  },
};
