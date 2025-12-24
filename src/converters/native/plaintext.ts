/**
 * Native plaintext converter.
 * Converts .txt files to markdown (passthrough as paragraphs).
 */

import { basename } from 'node:path'; // OK: no Bun path utils
import type { Converter, ConvertInput, ConvertResult } from '../types';

const CONVERTER_ID = 'native/plaintext' as const;
const CONVERTER_VERSION = '1.0.0';

/** UTF-8 BOM character */
const BOM = '\uFEFF';

/**
 * Derive title from filename (without extension).
 */
function extractTitleFromFilename(relativePath: string): string {
  const filename = basename(relativePath);
  // Remove extension
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

export const plaintextConverter: Converter = {
  id: CONVERTER_ID,
  version: CONVERTER_VERSION,

  canHandle(mime: string, ext: string): boolean {
    return mime === 'text/plain' || ext === '.txt';
  },

  convert(input: ConvertInput): Promise<ConvertResult> {
    // Decode as UTF-8 with replacement for invalid bytes (deterministic)
    const decoder = new TextDecoder('utf-8', {
      fatal: false, // Don't throw on invalid bytes
      ignoreBOM: false, // We'll strip manually for determinism
    });

    let text = decoder.decode(input.bytes);

    // Strip BOM if present (ensures consistent hashes)
    if (text.startsWith(BOM)) {
      text = text.slice(1);
    }

    // Derive title from filename
    const title = extractTitleFromFilename(input.relativePath);

    // Pass through as paragraphs (no code fence wrapping - better for search)
    // NOTE: Do NOT canonicalize here - pipeline.ts handles all normalization
    return Promise.resolve({
      ok: true,
      value: {
        markdown: text,
        title,
        meta: {
          converterId: CONVERTER_ID,
          converterVersion: CONVERTER_VERSION,
          sourceMime: input.mime,
        },
      },
    });
  },
};
