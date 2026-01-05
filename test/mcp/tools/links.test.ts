/**
 * MCP link tools schema tests (gno_links, gno_backlinks, gno_similar).
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// gno_links schemas
// ─────────────────────────────────────────────────────────────────────────────

const linksInputSchema = z.object({
  ref: z.string().min(1, "Reference cannot be empty"),
  type: z.enum(["wiki", "markdown"]).optional(),
});

const linksOutputSchema = z.object({
  links: z.array(
    z.object({
      targetRef: z.string(),
      targetAnchor: z.string().optional(),
      targetCollection: z.string().optional(),
      linkType: z.enum(["wiki", "markdown"]),
      linkText: z.string().optional(),
      position: z.object({
        startLine: z.number(),
        startCol: z.number(),
      }),
    })
  ),
  meta: z.object({
    docid: z.string(),
    uri: z.string(),
    title: z.string().optional(),
    totalLinks: z.number(),
    filterType: z.enum(["wiki", "markdown"]).optional(),
  }),
});

describe("gno_links schema", () => {
  test("links input requires non-empty ref", () => {
    const result = linksInputSchema.safeParse({ ref: "" });
    expect(result.success).toBe(false);
  });

  test("links input accepts valid ref", () => {
    const result = linksInputSchema.safeParse({ ref: "notes/readme.md" });
    expect(result.success).toBe(true);
  });

  test("links input accepts docid ref", () => {
    const result = linksInputSchema.safeParse({ ref: "#abc1234" });
    expect(result.success).toBe(true);
  });

  test("links input accepts uri ref", () => {
    const result = linksInputSchema.safeParse({
      ref: "gno://notes/readme.md",
    });
    expect(result.success).toBe(true);
  });

  test("links input accepts type filter wiki", () => {
    const result = linksInputSchema.safeParse({
      ref: "notes/readme.md",
      type: "wiki",
    });
    expect(result.success).toBe(true);
  });

  test("links input accepts type filter markdown", () => {
    const result = linksInputSchema.safeParse({
      ref: "notes/readme.md",
      type: "markdown",
    });
    expect(result.success).toBe(true);
  });

  test("links input rejects invalid type", () => {
    const result = linksInputSchema.safeParse({
      ref: "notes/readme.md",
      type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  test("links output validates valid result", () => {
    const validOutput = {
      links: [
        {
          targetRef: "other-doc.md",
          targetAnchor: "section-1",
          linkType: "markdown",
          linkText: "See other doc",
          position: { startLine: 5, startCol: 10 },
        },
        {
          targetRef: "My Note",
          targetCollection: "notes",
          linkType: "wiki",
          position: { startLine: 10, startCol: 1 },
        },
      ],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        title: "README",
        totalLinks: 2,
      },
    };
    const result = linksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("links output accepts empty links array", () => {
    const validOutput = {
      links: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalLinks: 0,
      },
    };
    const result = linksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("links output accepts filterType in meta", () => {
    const validOutput = {
      links: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalLinks: 0,
        filterType: "wiki",
      },
    };
    const result = linksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gno_backlinks schemas
// ─────────────────────────────────────────────────────────────────────────────

const backlinksInputSchema = z.object({
  ref: z.string().min(1, "Reference cannot be empty"),
  collection: z.string().optional(),
});

const backlinksOutputSchema = z.object({
  backlinks: z.array(
    z.object({
      sourceDocUri: z.string(),
      sourceDocTitle: z.string().optional(),
      linkText: z.string().optional(),
      position: z.object({
        startLine: z.number(),
        startCol: z.number(),
      }),
    })
  ),
  meta: z.object({
    docid: z.string(),
    uri: z.string(),
    title: z.string().optional(),
    totalBacklinks: z.number(),
    filterCollection: z.string().optional(),
  }),
});

describe("gno_backlinks schema", () => {
  test("backlinks input requires non-empty ref", () => {
    const result = backlinksInputSchema.safeParse({ ref: "" });
    expect(result.success).toBe(false);
  });

  test("backlinks input accepts valid ref", () => {
    const result = backlinksInputSchema.safeParse({ ref: "notes/readme.md" });
    expect(result.success).toBe(true);
  });

  test("backlinks input accepts collection filter", () => {
    const result = backlinksInputSchema.safeParse({
      ref: "notes/readme.md",
      collection: "docs",
    });
    expect(result.success).toBe(true);
  });

  test("backlinks output validates valid result", () => {
    const validOutput = {
      backlinks: [
        {
          sourceDocUri: "gno://notes/index.md",
          sourceDocTitle: "Index",
          linkText: "README",
          position: { startLine: 3, startCol: 5 },
        },
        {
          sourceDocUri: "gno://notes/guide.md",
          position: { startLine: 15, startCol: 1 },
        },
      ],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        title: "README",
        totalBacklinks: 2,
      },
    };
    const result = backlinksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("backlinks output accepts empty backlinks array", () => {
    const validOutput = {
      backlinks: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalBacklinks: 0,
      },
    };
    const result = backlinksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("backlinks output accepts filterCollection in meta", () => {
    const validOutput = {
      backlinks: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalBacklinks: 0,
        filterCollection: "docs",
      },
    };
    const result = backlinksOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gno_similar schemas
// ─────────────────────────────────────────────────────────────────────────────

const similarInputSchema = z.object({
  ref: z.string().min(1, "Reference cannot be empty"),
  limit: z.number().int().min(1).max(50).default(5),
  threshold: z.number().min(0).max(1).optional(),
  crossCollection: z.boolean().default(false),
});

const similarOutputSchema = z.object({
  similar: z.array(
    z.object({
      docid: z.string(),
      uri: z.string(),
      title: z.string().optional(),
      score: z.number(),
      absPath: z.string().optional(),
    })
  ),
  meta: z.object({
    docid: z.string(),
    uri: z.string(),
    title: z.string().optional(),
    totalSimilar: z.number(),
    threshold: z.number().optional(),
    crossCollection: z.boolean(),
  }),
});

describe("gno_similar schema", () => {
  test("similar input requires non-empty ref", () => {
    const result = similarInputSchema.safeParse({ ref: "" });
    expect(result.success).toBe(false);
  });

  test("similar input accepts valid ref", () => {
    const result = similarInputSchema.safeParse({ ref: "notes/readme.md" });
    expect(result.success).toBe(true);
  });

  test("similar input defaults limit to 5", () => {
    const result = similarInputSchema.safeParse({ ref: "notes/readme.md" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(5);
    }
  });

  test("similar input accepts custom limit", () => {
    const result = similarInputSchema.safeParse({
      ref: "notes/readme.md",
      limit: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  test("similar input rejects limit > 50", () => {
    const result = similarInputSchema.safeParse({
      ref: "notes/readme.md",
      limit: 51,
    });
    expect(result.success).toBe(false);
  });

  test("similar input accepts threshold", () => {
    const result = similarInputSchema.safeParse({
      ref: "notes/readme.md",
      threshold: 0.7,
    });
    expect(result.success).toBe(true);
  });

  test("similar input rejects threshold > 1", () => {
    const result = similarInputSchema.safeParse({
      ref: "notes/readme.md",
      threshold: 1.5,
    });
    expect(result.success).toBe(false);
  });

  test("similar input defaults crossCollection to false", () => {
    const result = similarInputSchema.safeParse({ ref: "notes/readme.md" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crossCollection).toBe(false);
    }
  });

  test("similar input accepts crossCollection true", () => {
    const result = similarInputSchema.safeParse({
      ref: "notes/readme.md",
      crossCollection: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.crossCollection).toBe(true);
    }
  });

  test("similar output validates valid result", () => {
    const validOutput = {
      similar: [
        {
          docid: "#def5678",
          uri: "gno://notes/similar-doc.md",
          title: "Similar Doc",
          score: 0.85,
          absPath: "/path/to/notes/similar-doc.md",
        },
        {
          docid: "#ghi9012",
          uri: "gno://notes/another.md",
          score: 0.72,
        },
      ],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        title: "README",
        totalSimilar: 2,
        crossCollection: false,
      },
    };
    const result = similarOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("similar output accepts empty similar array", () => {
    const validOutput = {
      similar: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalSimilar: 0,
        crossCollection: false,
      },
    };
    const result = similarOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("similar output accepts threshold in meta", () => {
    const validOutput = {
      similar: [],
      meta: {
        docid: "#abc1234",
        uri: "gno://notes/readme.md",
        totalSimilar: 0,
        threshold: 0.8,
        crossCollection: true,
      },
    };
    const result = similarOutputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });
});
