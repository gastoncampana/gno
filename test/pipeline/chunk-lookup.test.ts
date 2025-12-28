/**
 * Unit tests for createChunkLookup factory.
 * Validates first-wins semantics, caching, and missing hash behavior.
 */

import { describe, expect, test } from 'bun:test';
import { createChunkLookup } from '../../src/pipeline/chunk-lookup';
import type { ChunkRow } from '../../src/store/types';

const makeChunk = (
  mirrorHash: string,
  seq: number,
  text: string
): ChunkRow => ({
  mirrorHash,
  seq,
  pos: seq * 100,
  text,
  startLine: seq,
  endLine: seq + 10,
  language: 'typescript',
  tokenCount: text.length,
  createdAt: new Date().toISOString(),
});

describe('createChunkLookup', () => {
  test('returns chunk by hash and seq', () => {
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hash1', [
      makeChunk('hash1', 0, 'chunk 0'),
      makeChunk('hash1', 1, 'chunk 1'),
    ]);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('hash1', 0)?.text).toBe('chunk 0');
    expect(getChunk('hash1', 1)?.text).toBe('chunk 1');
  });

  test('returns undefined for missing hash', () => {
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hash1', [makeChunk('hash1', 0, 'chunk 0')]);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('nonexistent', 0)).toBeUndefined();
  });

  test('returns undefined for missing seq', () => {
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hash1', [makeChunk('hash1', 0, 'chunk 0')]);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('hash1', 99)).toBeUndefined();
  });

  test('first-wins semantics for duplicate seq', () => {
    const chunks = new Map<string, ChunkRow[]>();
    // Duplicate seq=0 - first one should win
    chunks.set('hash1', [
      makeChunk('hash1', 0, 'FIRST chunk'),
      makeChunk('hash1', 0, 'SECOND chunk'),
    ]);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('hash1', 0)?.text).toBe('FIRST chunk');
  });

  test('caches index per hash (does not rebuild on repeated access)', () => {
    const originalChunks: ChunkRow[] = [makeChunk('hash1', 0, 'original')];
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hash1', originalChunks);

    const getChunk = createChunkLookup(chunks);

    // First access - builds cache
    expect(getChunk('hash1', 0)?.text).toBe('original');

    // Mutate underlying array (simulates external modification)
    originalChunks.push(makeChunk('hash1', 1, 'added after'));

    // Cache should not reflect mutation
    expect(getChunk('hash1', 1)).toBeUndefined();
    // Original lookup still works
    expect(getChunk('hash1', 0)?.text).toBe('original');
  });

  test('handles empty chunks array', () => {
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hash1', []);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('hash1', 0)).toBeUndefined();
  });

  test('handles multiple hashes independently', () => {
    const chunks = new Map<string, ChunkRow[]>();
    chunks.set('hashA', [makeChunk('hashA', 0, 'chunk A')]);
    chunks.set('hashB', [makeChunk('hashB', 0, 'chunk B')]);

    const getChunk = createChunkLookup(chunks);

    expect(getChunk('hashA', 0)?.text).toBe('chunk A');
    expect(getChunk('hashB', 0)?.text).toBe('chunk B');
  });
});
