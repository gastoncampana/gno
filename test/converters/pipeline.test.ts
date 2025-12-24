/**
 * Tests for conversion pipeline (integration).
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  ConversionPipeline,
  getDefaultPipeline,
  resetDefaultPipeline,
} from '../../src/converters/pipeline';
import type { ConvertInput } from '../../src/converters/types';
import { DEFAULT_LIMITS } from '../../src/converters/types';

/** Pattern to validate 64-char hex SHA-256 hash */
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

const FIXTURES_DIR = join(import.meta.dir, '../fixtures/conversion');

function makeInput(overrides: Partial<ConvertInput>): ConvertInput {
  return {
    sourcePath: '/test/file.md',
    relativePath: 'file.md',
    collection: 'test',
    bytes: new Uint8Array(0),
    mime: 'text/markdown',
    ext: '.md',
    limits: DEFAULT_LIMITS,
    ...overrides,
  };
}

describe('ConversionPipeline', () => {
  beforeEach(() => {
    resetDefaultPipeline();
  });

  test('converts markdown and returns ConversionArtifact', async () => {
    const content = '# Test Document\n\nSome content.';
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
    });

    const pipeline = new ConversionPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe('# Test Document\n\nSome content.\n');
      expect(result.value.mirrorHash).toMatch(HEX_64_PATTERN);
      expect(result.value.title).toBe('Test Document');
      expect(result.value.meta.converterId).toBe('native/markdown');
    }
  });

  test('canonicalizes output', async () => {
    // Input with CRLF and trailing spaces
    const content = '# Test\r\n\r\nContent   \r\n';
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
    });

    const pipeline = new ConversionPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should be canonicalized (LF, no trailing spaces, single final newline)
      expect(result.value.markdown).toBe('# Test\n\nContent\n');
    }
  });

  test('computes deterministic mirrorHash', async () => {
    const content = '# Determinism Test\n';
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
    });

    const pipeline = new ConversionPipeline();
    const result1 = await pipeline.convert(input);
    const result2 = await pipeline.convert(input);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result1.value.mirrorHash).toBe(result2.value.mirrorHash);
    }
  });

  test('passes through errors from registry', async () => {
    const input = makeInput({
      mime: 'unknown/type',
      ext: '.unknown',
    });

    const pipeline = new ConversionPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNSUPPORTED');
    }
  });

  test('listConverters returns all registered converters', async () => {
    const pipeline = new ConversionPipeline();
    const converters = await pipeline.listConverters();

    expect(converters).toContain('native/markdown');
    expect(converters).toContain('native/plaintext');
    expect(converters).toContain('adapter/markitdown-ts');
    expect(converters).toContain('adapter/officeparser');
  });
});

describe('getDefaultPipeline', () => {
  beforeEach(() => {
    resetDefaultPipeline();
  });

  test('returns singleton instance', () => {
    const pipeline1 = getDefaultPipeline();
    const pipeline2 = getDefaultPipeline();
    expect(pipeline1).toBe(pipeline2);
  });
});

describe('Golden fixture tests', () => {
  test('MD: sample.md matches expected output', async () => {
    const inputPath = join(FIXTURES_DIR, 'md/sample.md');
    const expectedPath = join(FIXTURES_DIR, 'md/sample.expected.md');

    const bytes = await Bun.file(inputPath).bytes();
    const expected = await Bun.file(expectedPath).text();

    const input = makeInput({
      sourcePath: inputPath,
      relativePath: 'sample.md',
      bytes: new Uint8Array(bytes),
      mime: 'text/markdown',
      ext: '.md',
    });

    const pipeline = getDefaultPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(expected);
      expect(result.value.title).toBe('Sample Document');
    }
  });

  test('TXT: plain.txt matches expected output', async () => {
    const inputPath = join(FIXTURES_DIR, 'txt/plain.txt');
    const expectedPath = join(FIXTURES_DIR, 'txt/plain.expected.md');

    const bytes = await Bun.file(inputPath).bytes();
    const expected = await Bun.file(expectedPath).text();

    const input = makeInput({
      sourcePath: inputPath,
      relativePath: 'plain.txt',
      bytes: new Uint8Array(bytes),
      mime: 'text/plain',
      ext: '.txt',
    });

    const pipeline = getDefaultPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(expected);
      expect(result.value.title).toBe('plain');
    }
  });

  test('Unicode edge case: NFC normalization', async () => {
    const inputPath = join(FIXTURES_DIR, 'edge-cases/unicode.txt');
    const expectedPath = join(FIXTURES_DIR, 'edge-cases/unicode.expected.md');

    const bytes = await Bun.file(inputPath).bytes();
    const expected = await Bun.file(expectedPath).text();

    const input = makeInput({
      sourcePath: inputPath,
      relativePath: 'unicode.txt',
      bytes: new Uint8Array(bytes),
      mime: 'text/plain',
      ext: '.txt',
    });

    const pipeline = getDefaultPipeline();
    const result = await pipeline.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(expected);
    }
  });
});
