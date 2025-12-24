/**
 * Tests for markdown canonicalization.
 * PRD §8.4 - Canonical Markdown conventions
 */

import { describe, expect, test } from 'bun:test';
import { canonicalize, mirrorHash } from '../../src/converters/canonicalize';

/** Pattern to validate 64-char hex SHA-256 hash */
const HEX_64_PATTERN = /^[a-f0-9]{64}$/;

describe('canonicalize', () => {
  test('empty input returns single newline', () => {
    expect(canonicalize('')).toBe('\n');
  });

  test('normalizes CRLF to LF', () => {
    expect(canonicalize('hello\r\nworld')).toBe('hello\nworld\n');
  });

  test('normalizes lone CR to LF', () => {
    expect(canonicalize('hello\rworld')).toBe('hello\nworld\n');
  });

  test('applies NFC Unicode normalization', () => {
    // é can be composed (U+00E9) or decomposed (U+0065 + U+0301)
    const decomposed = 'cafe\u0301'; // e + combining acute
    const result = canonicalize(decomposed);
    // NFC should convert to precomposed form
    expect(result).toBe('café\n');
  });

  test('strips control characters except newline and tab', () => {
    const input = 'hello\x00\x07\x1Fworld\ttab';
    // All control chars U+0000-U+001F (except \n and \t) and U+007F are removed
    expect(canonicalize(input)).toBe('helloworld\ttab\n');
  });

  test('preserves tabs', () => {
    expect(canonicalize('hello\tworld')).toBe('hello\tworld\n');
  });

  test('preserves newlines', () => {
    expect(canonicalize('hello\nworld')).toBe('hello\nworld\n');
  });

  test('trims trailing whitespace per line', () => {
    expect(canonicalize('hello   \nworld  ')).toBe('hello\nworld\n');
  });

  test('treats whitespace-only lines as blank', () => {
    expect(canonicalize('hello\n   \nworld')).toBe('hello\n\nworld\n');
  });

  test('collapses 3+ consecutive blank lines to 1', () => {
    const input = 'hello\n\n\n\nworld';
    // Multiple blank lines collapse to single blank line
    expect(canonicalize(input)).toBe('hello\n\nworld\n');
  });

  test('collapses 2 blank lines to 1', () => {
    const input = 'hello\n\n\nworld';
    // 2 blank lines (3 newlines) becomes 1 blank line (2 newlines)
    expect(canonicalize(input)).toBe('hello\n\nworld\n');
  });

  test('ensures exactly one final newline', () => {
    expect(canonicalize('hello')).toBe('hello\n');
    expect(canonicalize('hello\n')).toBe('hello\n');
    expect(canonicalize('hello\n\n')).toBe('hello\n');
    expect(canonicalize('hello\n\n\n')).toBe('hello\n');
  });

  test('removes trailing blank lines', () => {
    const input = 'hello\nworld\n\n\n';
    expect(canonicalize(input)).toBe('hello\nworld\n');
  });

  test('handles complex document', () => {
    const input =
      '# Title\r\n\r\nParagraph 1.   \r\n\r\n\r\n\r\nParagraph 2.\r\n\r\n';
    // Multiple blank lines collapse to single blank line each
    const expected = '# Title\n\nParagraph 1.\n\nParagraph 2.\n';
    expect(canonicalize(input)).toBe(expected);
  });
});

describe('mirrorHash', () => {
  test('returns 64-character hex string', () => {
    const hash = mirrorHash('test content\n');
    expect(hash).toMatch(HEX_64_PATTERN);
  });

  test('is deterministic', () => {
    const content = '# Test Document\n\nSome content.\n';
    const hash1 = mirrorHash(content);
    const hash2 = mirrorHash(content);
    expect(hash1).toBe(hash2);
  });

  test('different content produces different hash', () => {
    const hash1 = mirrorHash('content A\n');
    const hash2 = mirrorHash('content B\n');
    expect(hash1).not.toBe(hash2);
  });

  test('produces known hash for known input', () => {
    // SHA-256 of "hello\n"
    const hash = mirrorHash('hello\n');
    expect(hash).toBe(
      '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'
    );
  });
});
