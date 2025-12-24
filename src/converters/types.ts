/**
 * Converter subsystem types.
 * PRD §8.2 - Converter interfaces
 */

export type ConverterId =
  | 'native/markdown'
  | 'native/plaintext'
  | 'adapter/markitdown-ts'
  | 'adapter/officeparser'
  | string;

export type ConvertInput = {
  /** Absolute path to source file */
  sourcePath: string;
  /** Relative path within collection */
  relativePath: string;
  /** Collection name */
  collection: string;
  /** File contents */
  bytes: Uint8Array;
  /** Detected MIME type */
  mime: string;
  /** File extension (e.g., ".pdf") */
  ext: string;
  /** Conversion limits */
  limits: {
    /** Max file size in bytes (default: 100MB) */
    maxBytes: number;
    /** Conversion timeout in ms (default: 60000) */
    timeoutMs: number;
  };
};

export type ConvertWarning = {
  code:
    | 'LOSSY'
    | 'TRUNCATED'
    | 'PARTIAL'
    | 'UNSUPPORTED_FEATURE'
    | 'LOW_CONFIDENCE';
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Raw output from individual converters.
 * Note: markdown is NOT canonical - pipeline.ts handles normalization.
 */
export type ConvertOutput = {
  /** Raw markdown (pipeline canonicalizes) */
  markdown: string;
  /** Extracted or derived title */
  title?: string;
  /** BCP-47 language hint or "und" */
  languageHint?: string;
  /** Conversion metadata */
  meta: {
    converterId: ConverterId;
    converterVersion: string;
    sourceMime: string;
    warnings?: ConvertWarning[];
  };
};

export type ConvertErrorCode =
  | 'UNSUPPORTED'
  | 'TOO_LARGE'
  | 'TIMEOUT'
  | 'CORRUPT'
  | 'PERMISSION'
  | 'IO'
  | 'ADAPTER_FAILURE'
  | 'INTERNAL';

export type ConvertError = {
  code: ConvertErrorCode;
  message: string;
  retryable: boolean;
  fatal: boolean;
  converterId: string;
  sourcePath: string;
  mime: string;
  ext: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export type ConvertResult =
  | { ok: true; value: ConvertOutput }
  | { ok: false; error: ConvertError };

export type Converter = {
  readonly id: ConverterId;
  readonly version: string;
  canHandle(mime: string, ext: string): boolean;
  convert(input: ConvertInput): Promise<ConvertResult>;
};

/**
 * Pipeline output after canonicalization and hash computation.
 * This is what consumers receive from the conversion pipeline.
 */
export type ConversionArtifact = {
  /** Canonical markdown after pipeline normalization */
  markdown: string;
  /** SHA-256 hex of canonical markdown - content-addressed key */
  mirrorHash: string;
  /** Title from conversion (or derived from filename) */
  title?: string;
  /** Language hint from conversion */
  languageHint?: string;
  /** Conversion metadata */
  meta: ConvertOutput['meta'];
};

export type PipelineResult =
  | { ok: true; value: ConversionArtifact }
  | { ok: false; error: ConvertError };

/** Default conversion limits */
export const DEFAULT_LIMITS = {
  maxBytes: 100 * 1024 * 1024, // 100MB
  timeoutMs: 60_000, // 60 seconds
} as const;
