/**
 * Conversion pipeline - single entry point for all document conversions.
 * PRD §8.4 - Canonical Markdown conventions
 *
 * The pipeline:
 * 1. Delegates to the registry to find and invoke the appropriate converter
 * 2. Canonicalizes the raw markdown output (centralized, not per-converter)
 * 3. Computes mirrorHash from canonical markdown
 * 4. Returns ConversionArtifact (not ConvertOutput)
 *
 * CRITICAL: Canonicalization is ONLY done here, not in individual converters.
 */

import { canonicalize, mirrorHash } from './canonicalize';
import { internalError } from './errors';
import { type ConverterRegistry, createDefaultRegistry } from './registry';
import type { ConversionArtifact, ConvertInput, PipelineResult } from './types';

export class ConversionPipeline {
  private registry: ConverterRegistry | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Create a pipeline with default registry.
   * Registry is lazily initialized on first use.
   */
  constructor(registry?: ConverterRegistry) {
    if (registry) {
      this.registry = registry;
    }
  }

  /**
   * Ensure registry is initialized.
   */
  private async ensureRegistry(): Promise<ConverterRegistry> {
    if (this.registry) {
      return this.registry;
    }

    if (!this.initPromise) {
      this.initPromise = createDefaultRegistry().then((r) => {
        this.registry = r;
      });
    }
    await this.initPromise;
    // Safe: after await, this.registry is always set
    return this.registry as unknown as ConverterRegistry;
  }

  /**
   * Convert a file through the pipeline.
   * Returns ConversionArtifact with canonical markdown and mirrorHash.
   */
  async convert(input: ConvertInput): Promise<PipelineResult> {
    let registry: ConverterRegistry;
    try {
      registry = await this.ensureRegistry();
    } catch (cause) {
      return {
        ok: false,
        error: internalError(
          input,
          'pipeline',
          'Failed to initialize converter registry',
          cause
        ),
      };
    }

    // 1. Delegate to registry (finds converter + invokes)
    const result = await registry.convert(input);

    if (!result.ok) {
      return result; // Pass through error
    }

    // 2. Canonicalize the raw markdown output
    const canonical = canonicalize(result.value.markdown);

    // 3. Compute content-addressed hash
    const hash = mirrorHash(canonical);

    // 4. Return artifact with all pipeline-computed fields
    const artifact: ConversionArtifact = {
      markdown: canonical,
      mirrorHash: hash,
      title: result.value.title,
      languageHint: result.value.languageHint,
      meta: result.value.meta,
    };

    return { ok: true, value: artifact };
  }

  /**
   * List available converters.
   */
  async listConverters(): Promise<string[]> {
    const registry = await this.ensureRegistry();
    return registry.listConverters();
  }
}

/** Singleton for simple usage */
let defaultPipeline: ConversionPipeline | null = null;

export function getDefaultPipeline(): ConversionPipeline {
  if (!defaultPipeline) {
    defaultPipeline = new ConversionPipeline();
  }
  return defaultPipeline;
}

/** Reset singleton (for testing) */
export function resetDefaultPipeline(): void {
  defaultPipeline = null;
}
