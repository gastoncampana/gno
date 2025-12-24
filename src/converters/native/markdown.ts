/**
 * Native Markdown converter (passthrough).
 * Simply reads .md files and extracts title from first heading.
 */

import type { Converter, ConvertInput, ConvertResult } from '../types';

const CONVERTER_ID = 'native/markdown' as const;
const CONVERTER_VERSION = '1.0.0';

/** UTF-8 BOM character */
const BOM = '\uFEFF';

/** Regex to match first # heading in markdown */
const FIRST_HEADING_PATTERN = /^\s*#\s+(.+)/m;

/**
 * Extract title from first # heading in markdown.
 * Returns undefined if no heading found.
 */
function extractFirstHeading(markdown: string): string | undefined {
  const match = markdown.match(FIRST_HEADING_PATTERN);
  return match?.[1]?.trim();
}

export const markdownConverter: Converter = {
  id: CONVERTER_ID,
  version: CONVERTER_VERSION,

  canHandle(mime: string, ext: string): boolean {
    return mime === 'text/markdown' || ext === '.md';
  },

  convert(input: ConvertInput): Promise<ConvertResult> {
    // Decode bytes to string (assumes UTF-8)
    let text = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);

    // Strip BOM if present (ensures consistent hashes)
    if (text.startsWith(BOM)) {
      text = text.slice(1);
    }

    // Extract title from first heading
    const title = extractFirstHeading(text);

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
