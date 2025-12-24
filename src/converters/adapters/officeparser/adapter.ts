/**
 * officeparser adapter for PPTX conversion.
 * Uses parseOfficeAsync() with Buffer for in-memory extraction.
 */

import { basename } from 'node:path'; // OK: no Bun path utils
import { parseOfficeAsync } from 'officeparser';
import { adapterError, corruptError, tooLargeError } from '../../errors';
import type {
  Converter,
  ConvertInput,
  ConvertResult,
  ConvertWarning,
} from '../../types';

const CONVERTER_ID = 'adapter/officeparser' as const;
const CONVERTER_VERSION = '5.2.0';

/** Supported MIME type */
const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Derive title from filename (without extension).
 */
function extractTitleFromFilename(relativePath: string): string {
  const filename = basename(relativePath);
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

/**
 * Format extracted PPTX text as Markdown.
 */
function formatPptxAsMarkdown(text: string, relativePath: string): string {
  const title = extractTitleFromFilename(relativePath);
  return `# ${title}\n\n${text}`;
}

export const officeparserAdapter: Converter = {
  id: CONVERTER_ID,
  version: CONVERTER_VERSION,

  canHandle(mime: string, ext: string): boolean {
    return ext === '.pptx' || mime === PPTX_MIME;
  },

  async convert(input: ConvertInput): Promise<ConvertResult> {
    // Size check (defense in depth; EPIC 5 does stat-based pre-check)
    if (input.bytes.length > input.limits.maxBytes) {
      return { ok: false, error: tooLargeError(input, CONVERTER_ID) };
    }

    try {
      // officeparser accepts Buffer
      const buffer = Buffer.from(input.bytes);
      const text = await parseOfficeAsync(buffer, {
        newlineDelimiter: '\n',
        ignoreNotes: false, // Include speaker notes
      });

      if (!text || text.trim().length === 0) {
        return {
          ok: false,
          error: corruptError(input, CONVERTER_ID, 'Empty extraction result'),
        };
      }

      // Convert plain text to Markdown structure
      const markdown = formatPptxAsMarkdown(text, input.relativePath);

      // NOTE: Do NOT canonicalize here - pipeline.ts handles all normalization
      const warnings: ConvertWarning[] = [];
      if (markdown.length < 10 && input.bytes.length > 1000) {
        warnings.push({ code: 'LOSSY', message: 'Suspiciously short output' });
      }

      return {
        ok: true,
        value: {
          markdown,
          title: extractTitleFromFilename(input.relativePath),
          meta: {
            converterId: CONVERTER_ID,
            converterVersion: CONVERTER_VERSION,
            sourceMime: input.mime,
            warnings: warnings.length > 0 ? warnings : undefined,
          },
        },
      };
    } catch (err) {
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
