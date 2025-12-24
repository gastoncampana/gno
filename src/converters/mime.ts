/**
 * MIME type detection with magic byte sniffing and extension mapping.
 * PRD §8.5 - MIME detection strategy
 */

import { extname } from 'node:path'; // OK: no Bun path utils

export type MimeDetection = {
  mime: string;
  ext: string;
  confidence: 'high' | 'medium' | 'low';
  via: 'sniff' | 'ext' | 'fallback';
};

export type MimeDetector = {
  detect(path: string, bytes: Uint8Array): MimeDetection;
};

/** Extension to MIME type mapping (PRD §8.5) */
const EXTENSION_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** OOXML extension to MIME mapping */
const OOXML_MAP: Record<string, string> = {
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** PDF magic bytes: %PDF- */
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

/** ZIP/OOXML magic bytes: PK\x03\x04 */
const ZIP_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

/**
 * Check if bytes start with the given prefix.
 */
function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Sniff MIME type from magic bytes.
 * Returns detected MIME or undefined if no match.
 */
function sniffMagicBytes(bytes: Uint8Array, ext: string): string | undefined {
  // PDF detection
  if (startsWith(bytes, PDF_MAGIC)) {
    return 'application/pdf';
  }

  // ZIP/OOXML detection - use extension to distinguish
  if (startsWith(bytes, ZIP_MAGIC)) {
    const ooxmlMime = OOXML_MAP[ext];
    if (ooxmlMime) {
      return ooxmlMime;
    }
    // Generic ZIP (not OOXML)
    return 'application/zip';
  }

  return;
}

/**
 * Default MIME detector implementation.
 * Detection priority:
 * 1. Magic bytes (sniff) → high confidence
 * 2. Extension map → medium confidence
 * 3. Fallback application/octet-stream → low confidence
 */
export class DefaultMimeDetector implements MimeDetector {
  detect(path: string, bytes: Uint8Array): MimeDetection {
    const ext = extname(path).toLowerCase();

    // 1. Try magic byte sniffing (first 512 bytes sufficient)
    const sniffBytes = bytes.slice(0, 512);
    const sniffed = sniffMagicBytes(sniffBytes, ext);
    if (sniffed) {
      return {
        mime: sniffed,
        ext,
        confidence: 'high',
        via: 'sniff',
      };
    }

    // 2. Try extension mapping
    const extMime = EXTENSION_MAP[ext];
    if (extMime) {
      return {
        mime: extMime,
        ext,
        confidence: 'medium',
        via: 'ext',
      };
    }

    // 3. Fallback
    return {
      mime: 'application/octet-stream',
      ext,
      confidence: 'low',
      via: 'fallback',
    };
  }
}

/** Singleton default detector */
let defaultDetector: MimeDetector | null = null;

export function getDefaultMimeDetector(): MimeDetector {
  if (!defaultDetector) {
    defaultDetector = new DefaultMimeDetector();
  }
  return defaultDetector;
}

/** Supported extensions for conversion */
export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_MAP);

/** Check if extension is supported for conversion */
export function isSupportedExtension(ext: string): boolean {
  return ext.toLowerCase() in EXTENSION_MAP;
}
