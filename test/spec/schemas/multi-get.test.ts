import { beforeAll, describe, expect, test } from 'bun:test';
import { assertInvalid, assertValid, loadSchema } from './validator';

describe('multi-get schema', () => {
  let schema: object;

  beforeAll(async () => {
    schema = await loadSchema('multi-get');
  });

  describe('valid inputs', () => {
    test('validates minimal response', () => {
      const response = {
        documents: [],
        meta: {
          requested: 0,
          returned: 0,
          skipped: 0,
        },
      };
      expect(assertValid(response, schema)).toBe(true);
    });

    test('validates response with documents', () => {
      const response = {
        documents: [
          {
            docid: '#abc123',
            uri: 'gno://work/doc1.md',
            content: '# Doc 1',
            source: {
              relPath: 'doc1.md',
              mime: 'text/markdown',
              ext: '.md',
            },
          },
          {
            docid: '#def456',
            uri: 'gno://work/doc2.md',
            title: 'Document 2',
            content: '# Doc 2\n\nContent here',
            totalLines: 3,
            source: {
              absPath: '/path/doc2.md',
              relPath: 'doc2.md',
              mime: 'text/markdown',
              ext: '.md',
            },
          },
        ],
        meta: {
          requested: 2,
          returned: 2,
          skipped: 0,
        },
      };
      expect(assertValid(response, schema)).toBe(true);
    });

    test('validates response with skipped documents', () => {
      const response = {
        documents: [
          {
            docid: '#abc123',
            uri: 'gno://work/small.md',
            content: 'Small file',
            source: {
              relPath: 'small.md',
              mime: 'text/markdown',
              ext: '.md',
            },
          },
        ],
        skipped: [
          {
            ref: 'gno://work/large.pdf',
            reason: 'exceeds_maxBytes',
          },
          {
            ref: '#missing',
            reason: 'not_found',
          },
        ],
        meta: {
          requested: 3,
          returned: 1,
          skipped: 2,
          maxBytes: 10_240,
        },
      };
      expect(assertValid(response, schema)).toBe(true);
    });

    test('validates truncated document', () => {
      const response = {
        documents: [
          {
            docid: '#abc123',
            uri: 'gno://work/doc.md',
            content: '# Truncated content...',
            truncated: true,
            totalLines: 1000,
            source: {
              relPath: 'doc.md',
              mime: 'text/markdown',
              ext: '.md',
            },
          },
        ],
        meta: {
          requested: 1,
          returned: 1,
          skipped: 0,
        },
      };
      expect(assertValid(response, schema)).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    test('rejects missing documents array', () => {
      const response = {
        meta: {
          requested: 0,
          returned: 0,
          skipped: 0,
        },
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });

    test('rejects missing meta', () => {
      const response = {
        documents: [],
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });

    test('rejects meta missing required fields', () => {
      const response = {
        documents: [],
        meta: {
          requested: 1,
        },
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });

    test('rejects invalid skip reason', () => {
      const response = {
        documents: [],
        skipped: [
          {
            ref: 'gno://work/doc.md',
            reason: 'unknown_reason',
          },
        ],
        meta: {
          requested: 1,
          returned: 0,
          skipped: 1,
        },
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });

    test('rejects document missing source', () => {
      const response = {
        documents: [
          {
            docid: '#abc123',
            uri: 'gno://work/doc.md',
            content: 'Content',
          },
        ],
        meta: {
          requested: 1,
          returned: 1,
          skipped: 0,
        },
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });

    test('rejects invalid docid in document', () => {
      const response = {
        documents: [
          {
            docid: 'invalid',
            uri: 'gno://work/doc.md',
            content: 'Content',
            source: {
              relPath: 'doc.md',
              mime: 'text/markdown',
              ext: '.md',
            },
          },
        ],
        meta: {
          requested: 1,
          returned: 1,
          skipped: 0,
        },
      };
      expect(assertInvalid(response, schema)).toBe(true);
    });
  });
});
