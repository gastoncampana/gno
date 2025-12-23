import { beforeAll, describe, expect, test } from 'bun:test';
import { assertInvalid, assertValid, loadSchema } from './validator';

describe('status schema', () => {
  let schema: object;

  beforeAll(async () => {
    schema = await loadSchema('status');
  });

  describe('valid inputs', () => {
    test('validates healthy status fixture', async () => {
      const fixture = await Bun.file(
        'test/fixtures/outputs/status-healthy.json'
      ).json();
      expect(assertValid(fixture, schema)).toBe(true);
    });

    test('validates minimal status', () => {
      const status = {
        indexName: 'default',
        collections: [],
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertValid(status, schema)).toBe(true);
    });

    test('validates status with single collection', () => {
      const status = {
        indexName: 'test',
        collections: [
          {
            name: 'docs',
            path: '/path/to/docs',
            documentCount: 10,
            chunkCount: 50,
            embeddedCount: 50,
          },
        ],
        totalDocuments: 10,
        totalChunks: 50,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertValid(status, schema)).toBe(true);
    });

    test('validates unhealthy status', () => {
      const status = {
        indexName: 'default',
        collections: [],
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 100,
        healthy: false,
      };
      expect(assertValid(status, schema)).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    test('rejects missing indexName', () => {
      const status = {
        collections: [],
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertInvalid(status, schema)).toBe(true);
    });

    test('rejects missing collections array', () => {
      const status = {
        indexName: 'default',
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertInvalid(status, schema)).toBe(true);
    });

    test('rejects collection missing required fields', () => {
      const status = {
        indexName: 'default',
        collections: [{ name: 'docs' }],
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertInvalid(status, schema)).toBe(true);
    });

    test('rejects negative document count', () => {
      const status = {
        indexName: 'default',
        collections: [],
        totalDocuments: -1,
        totalChunks: 0,
        embeddingBacklog: 0,
        healthy: true,
      };
      expect(assertInvalid(status, schema)).toBe(true);
    });

    test('rejects missing healthy field', () => {
      const status = {
        indexName: 'default',
        collections: [],
        totalDocuments: 0,
        totalChunks: 0,
        embeddingBacklog: 0,
      };
      expect(assertInvalid(status, schema)).toBe(true);
    });
  });
});
