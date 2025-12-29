/**
 * N+1 regression test for searchBm25.
 * Ensures we use getChunksBatch, not per-hash getChunks.
 */

import { describe, expect, test } from 'bun:test';
import { searchBm25 } from '../../src/pipeline/search';
import type { ChunkRow, FtsResult, StorePort } from '../../src/store/types';

const makeChunk = (mirrorHash: string, seq: number): ChunkRow => ({
  mirrorHash,
  seq,
  pos: seq * 100,
  text: `Chunk text for ${mirrorHash} seq ${seq}`,
  startLine: seq * 10,
  endLine: seq * 10 + 9,
  language: 'markdown',
  tokenCount: 20,
  createdAt: new Date().toISOString(),
});

const makeFtsResult = (mirrorHash: string, seq: number): FtsResult => ({
  mirrorHash,
  seq,
  score: -1.0 - seq * 0.1, // BM25: more negative = better
  docid: `#doc${seq}`,
  uri: `gno://test/${mirrorHash}`,
  title: `Test Doc ${seq}`,
  collection: 'test',
  relPath: `${mirrorHash}.md`,
});

describe('searchBm25 N+1 guard', () => {
  test('uses getChunksBatch, never calls getChunks', async () => {
    // Mock store where getChunks throws to detect N+1
    const mockStore: Partial<StorePort> = {
      searchFts: async () => ({
        ok: true as const,
        value: [
          makeFtsResult('hash1', 0),
          makeFtsResult('hash2', 0),
          makeFtsResult('hash3', 0),
        ],
      }),
      getCollections: async () => ({
        ok: true as const,
        value: [
          {
            name: 'test',
            path: '/test',
            pattern: '**/*',
            include: null,
            exclude: null,
            updateCmd: null,
            languageHint: null,
            syncedAt: '',
          },
        ],
      }),
      getChunks: () => {
        throw new Error('N+1 detected: getChunks should not be called');
      },
      getChunksBatch: (hashes: string[]) => {
        const chunks = new Map<string, ChunkRow[]>();
        for (const hash of hashes) {
          chunks.set(hash, [makeChunk(hash, 0)]);
        }
        return Promise.resolve({ ok: true as const, value: chunks });
      },
    };

    const result = await searchBm25(mockStore as StorePort, 'test query');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results.length).toBe(3);
      // Verify snippets came from batch-fetched chunks
      for (const r of result.value.results) {
        expect(r.snippet).toContain('Chunk text for');
      }
    }
  });

  test('handles getChunksBatch failure gracefully', async () => {
    const mockStore: Partial<StorePort> = {
      searchFts: async () => ({
        ok: true as const,
        value: [makeFtsResult('hash1', 0)],
      }),
      getCollections: async () => ({
        ok: true as const,
        value: [],
      }),
      getChunks: () => {
        throw new Error('N+1 detected: getChunks should not be called');
      },
      getChunksBatch: async () => ({
        ok: false as const,
        error: { code: 'QUERY_FAILED' as const, message: 'DB error' },
      }),
    };

    const result = await searchBm25(mockStore as StorePort, 'test query');

    // Should still succeed with FTS snippet fallback
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.results.length).toBe(1);
    }
  });
});
