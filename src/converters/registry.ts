/**
 * Converter registry for routing files to appropriate converters.
 * PRD §8.6 - Converter registry
 */

import { unsupportedError } from './errors';
import type { Converter, ConvertInput, ConvertResult } from './types';

export class ConverterRegistry {
  private readonly converters: Converter[] = [];

  /**
   * Register a converter. Order matters - first match wins.
   */
  register(converter: Converter): void {
    this.converters.push(converter);
  }

  /**
   * Select the first converter that can handle the given MIME/ext.
   * Normalizes to lowercase for consistent matching.
   */
  select(mime: string, ext: string): Converter | undefined {
    const m = mime.toLowerCase();
    const e = ext.toLowerCase();
    return this.converters.find((c) => c.canHandle(m, e));
  }

  /**
   * List all registered converter IDs.
   */
  listConverters(): string[] {
    return this.converters.map((c) => c.id);
  }

  /**
   * Convert a file using the appropriate converter.
   */
  convert(input: ConvertInput): Promise<ConvertResult> {
    const converter = this.select(input.mime, input.ext);
    if (!converter) {
      return Promise.resolve({ ok: false, error: unsupportedError(input) });
    }
    return converter.convert(input);
  }
}

/**
 * Create the default registry with all MVP converters.
 * Priority order per PRD §8.6:
 * 1. native/markdown - handles .md
 * 2. native/plaintext - handles .txt
 * 3. adapter/markitdown-ts - handles .pdf, .docx, .xlsx
 * 4. adapter/officeparser - handles .pptx
 */
export async function createDefaultRegistry(): Promise<ConverterRegistry> {
  const registry = new ConverterRegistry();

  // Import converters dynamically to avoid circular deps
  const { markdownConverter } = await import('./native/markdown');
  const { plaintextConverter } = await import('./native/plaintext');
  const { markitdownAdapter } = await import('./adapters/markitdownTs/adapter');
  const { officeparserAdapter } = await import(
    './adapters/officeparser/adapter'
  );

  // Register in priority order
  registry.register(markdownConverter);
  registry.register(plaintextConverter);
  registry.register(markitdownAdapter);
  registry.register(officeparserAdapter);

  return registry;
}
