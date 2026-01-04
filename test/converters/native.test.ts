/**
 * Tests for native converters (markdown and plaintext).
 */

import { describe, expect, test } from "bun:test";

import type { ConvertInput } from "../../src/converters/types";

import { markdownConverter } from "../../src/converters/native/markdown";
import { plaintextConverter } from "../../src/converters/native/plaintext";
import { DEFAULT_LIMITS } from "../../src/converters/types";

function makeInput(overrides: Partial<ConvertInput>): ConvertInput {
  return {
    sourcePath: "/test/file.md",
    relativePath: "file.md",
    collection: "test",
    bytes: new Uint8Array(0),
    mime: "text/markdown",
    ext: ".md",
    limits: DEFAULT_LIMITS,
    ...overrides,
  };
}

describe("markdownConverter", () => {
  test("id and version", () => {
    expect(markdownConverter.id).toBe("native/markdown");
    expect(markdownConverter.version).toBe("1.0.0");
  });

  test("canHandle recognizes markdown MIME", () => {
    expect(markdownConverter.canHandle("text/markdown", ".md")).toBe(true);
    expect(markdownConverter.canHandle("text/plain", ".md")).toBe(true);
    expect(markdownConverter.canHandle("text/plain", ".txt")).toBe(false);
  });

  test("converts markdown content", async () => {
    const content = "# Hello World\n\nThis is content.";
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
    });

    const result = await markdownConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(content);
      expect(result.value.title).toBe("Hello World");
      expect(result.value.meta.converterId).toBe("native/markdown");
    }
  });

  test("extracts title from first heading", async () => {
    const content = "Some text\n\n# The Title\n\nMore text";
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
    });

    const result = await markdownConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("The Title");
    }
  });

  test("falls back to filename when no heading", async () => {
    const content = "No headings here.";
    const input = makeInput({
      bytes: new TextEncoder().encode(content),
      relativePath: "my-document.md",
    });

    const result = await markdownConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("my-document");
    }
  });
});

describe("plaintextConverter", () => {
  test("id and version", () => {
    expect(plaintextConverter.id).toBe("native/plaintext");
    expect(plaintextConverter.version).toBe("1.0.0");
  });

  test("canHandle recognizes plaintext", () => {
    expect(plaintextConverter.canHandle("text/plain", ".txt")).toBe(true);
    expect(plaintextConverter.canHandle("text/markdown", ".txt")).toBe(true);
    expect(plaintextConverter.canHandle("text/markdown", ".md")).toBe(false);
  });

  test("converts plaintext content", async () => {
    const content = "Hello World\n\nThis is plain text.";
    const input = makeInput({
      sourcePath: "/test/file.txt",
      relativePath: "file.txt",
      bytes: new TextEncoder().encode(content),
      mime: "text/plain",
      ext: ".txt",
    });

    const result = await plaintextConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(content);
      expect(result.value.title).toBe("file");
      expect(result.value.meta.converterId).toBe("native/plaintext");
    }
  });

  test("strips UTF-8 BOM", async () => {
    const bom = "\uFEFF";
    const content = "Hello World";
    const input = makeInput({
      sourcePath: "/test/file.txt",
      relativePath: "file.txt",
      bytes: new TextEncoder().encode(bom + content),
      mime: "text/plain",
      ext: ".txt",
    });

    const result = await plaintextConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.markdown).toBe(content);
      expect(result.value.markdown.startsWith("\uFEFF")).toBe(false);
    }
  });

  test("derives title from filename", async () => {
    const input = makeInput({
      sourcePath: "/test/my-document.txt",
      relativePath: "nested/my-document.txt",
      bytes: new TextEncoder().encode("content"),
      mime: "text/plain",
      ext: ".txt",
    });

    const result = await plaintextConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("my-document");
    }
  });

  test("handles invalid UTF-8 with replacement", async () => {
    // Invalid UTF-8 sequence
    const invalidBytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0xff]);
    const input = makeInput({
      sourcePath: "/test/file.txt",
      relativePath: "file.txt",
      bytes: invalidBytes,
      mime: "text/plain",
      ext: ".txt",
    });

    const result = await plaintextConverter.convert(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Invalid byte should be replaced with U+FFFD
      expect(result.value.markdown).toContain("Hello");
      expect(result.value.markdown).toContain("\uFFFD");
    }
  });
});
