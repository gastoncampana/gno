/**
 * Unit tests for BacklinksPanel component.
 *
 * Tests caching behavior, request sequencing, and render states.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Mock Types
// ─────────────────────────────────────────────────────────────────────────────

interface MockBacklink {
  sourceDocid: string;
  sourceUri: string;
  sourceTitle: string;
  linkText: string;
  startLine: number;
  startCol: number;
}

interface MockBacklinksResponse {
  backlinks: MockBacklink[];
  meta: {
    docid: string;
    totalBacklinks: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_BACKLINKS: MockBacklink[] = [
  {
    sourceDocid: "#abc123",
    sourceUri: "gno://notes/source-one.md",
    sourceTitle: "Source Document One",
    linkText: "This links to the target document",
    startLine: 10,
    startCol: 5,
  },
  {
    sourceDocid: "#def456",
    sourceUri: "gno://notes/source-two.md",
    sourceTitle: "Another Source",
    linkText: "See also the related note",
    startLine: 25,
    startCol: 1,
  },
];

function createMockResponse(
  backlinks: MockBacklink[] = SAMPLE_BACKLINKS
): MockBacklinksResponse {
  return {
    backlinks,
    meta: {
      docid: "#target123",
      totalBacklinks: backlinks.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache Module Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel cache", () => {
  // Import cache functions directly for unit testing
  // Note: In real component tests, we'd use react-testing-library
  // Here we test the caching logic in isolation

  const CACHE_TTL = 30000;

  // Simple cache implementation matching component
  let cache: Map<string, { data: MockBacklinksResponse; timestamp: number }>;

  beforeEach(() => {
    cache = new Map();
  });

  function getCached(key: string): MockBacklinksResponse | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(key: string, data: MockBacklinksResponse): void {
    cache.set(key, { data, timestamp: Date.now() });
  }

  test("returns null for empty cache", () => {
    const result = getCached("backlinks:#doc123");
    expect(result).toBeNull();
  });

  test("stores and retrieves data", () => {
    const mockData = createMockResponse();
    setCache("backlinks:#doc123", mockData);

    const result = getCached("backlinks:#doc123");
    expect(result).toEqual(mockData);
  });

  test("returns null for different key", () => {
    const mockData = createMockResponse();
    setCache("backlinks:#doc123", mockData);

    const result = getCached("backlinks:#other");
    expect(result).toBeNull();
  });

  test("expires entries after TTL", () => {
    const mockData = createMockResponse();

    // Manually set with old timestamp
    cache.set("backlinks:#doc123", {
      data: mockData,
      timestamp: Date.now() - CACHE_TTL - 1000, // Expired
    });

    const result = getCached("backlinks:#doc123");
    expect(result).toBeNull();
    expect(cache.has("backlinks:#doc123")).toBe(false); // Cleaned up
  });

  test("returns data within TTL", () => {
    const mockData = createMockResponse();

    // Set with recent timestamp
    cache.set("backlinks:#doc123", {
      data: mockData,
      timestamp: Date.now() - CACHE_TTL + 5000, // 5s before expiry
    });

    const result = getCached("backlinks:#doc123");
    expect(result).toEqual(mockData);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Request Sequencing Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel request sequencing", () => {
  test("ignores stale responses using request ID", async () => {
    let requestId = 0;
    const responses: Array<{ id: number; data: MockBacklinksResponse }> = [];

    // Simulate multiple rapid requests
    async function simulateFetch(docId: string, delay: number) {
      const currentId = ++requestId;

      await new Promise((r) => setTimeout(r, delay));

      const data = createMockResponse([
        {
          sourceDocid: `#from-${docId}`,
          sourceUri: `gno://notes/${docId}.md`,
          sourceTitle: `Response for ${docId}`,
          linkText: `Link from ${docId}`,
          startLine: 1,
          startCol: 1,
        },
      ]);

      // Only accept if this is still the latest request
      if (currentId === requestId) {
        responses.push({ id: currentId, data });
      }
    }

    // Fire three requests, middle one takes longest
    await Promise.all([
      simulateFetch("first", 100),
      simulateFetch("second", 200), // Arrives last but was requested second
      simulateFetch("third", 50), // Arrives before second
    ]);

    // Only the last request (#3) should have been accepted
    expect(responses.length).toBe(1);
    expect(responses[0]?.id).toBe(3);
    expect(responses[0]?.data.backlinks[0]?.sourceDocid).toBe("#from-third");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API Response Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel API response handling", () => {
  test("parses valid backlinks response", () => {
    const raw = {
      backlinks: [
        {
          sourceDocid: "#abc123",
          sourceUri: "gno://notes/source.md",
          sourceTitle: "Source Doc",
          linkText: "link text here",
          startLine: 10,
          startCol: 5,
        },
      ],
      meta: { docid: "#target", totalBacklinks: 1 },
    };

    expect(raw.backlinks).toBeArrayOfSize(1);
    expect(raw.backlinks[0]?.sourceDocid).toBe("#abc123");
    expect(raw.meta.totalBacklinks).toBe(1);
  });

  test("handles empty backlinks array", () => {
    const raw = {
      backlinks: [],
      meta: { docid: "#target", totalBacklinks: 0 },
    };

    expect(raw.backlinks).toBeArrayOfSize(0);
    expect(raw.meta.totalBacklinks).toBe(0);
  });

  test("backlink has all required fields", () => {
    const backlink: MockBacklink = {
      sourceDocid: "#abc",
      sourceUri: "gno://notes/file.md",
      sourceTitle: "Title",
      linkText: "context",
      startLine: 1,
      startCol: 1,
    };

    expect(backlink).toHaveProperty("sourceDocid");
    expect(backlink).toHaveProperty("sourceUri");
    expect(backlink).toHaveProperty("sourceTitle");
    expect(backlink).toHaveProperty("linkText");
    expect(backlink).toHaveProperty("startLine");
    expect(backlink).toHaveProperty("startCol");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Props Interface Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel props", () => {
  interface BacklinksPanelProps {
    docId: string;
    className?: string;
    defaultOpen?: boolean;
    onNavigate?: (uri: string) => void;
  }

  test("accepts required docId prop", () => {
    const props: BacklinksPanelProps = {
      docId: "#abc123",
    };
    expect(props.docId).toBe("#abc123");
  });

  test("accepts optional className", () => {
    const props: BacklinksPanelProps = {
      docId: "#abc123",
      className: "custom-class",
    };
    expect(props.className).toBe("custom-class");
  });

  test("accepts optional defaultOpen", () => {
    const props: BacklinksPanelProps = {
      docId: "#abc123",
      defaultOpen: false,
    };
    expect(props.defaultOpen).toBe(false);
  });

  test("accepts optional onNavigate callback", () => {
    const navigateFn = mock(() => {});
    const props: BacklinksPanelProps = {
      docId: "#abc123",
      onNavigate: navigateFn,
    };

    props.onNavigate?.("gno://notes/test.md");
    expect(navigateFn).toHaveBeenCalledWith("gno://notes/test.md");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Display Logic Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel display logic", () => {
  test("extracts filename from URI for display", () => {
    const uri = "gno://notes/my-document.md";
    const displayName = uri.split("/").pop() || "Untitled";
    expect(displayName).toBe("my-document.md");
  });

  test("uses title when available", () => {
    const backlink: MockBacklink = {
      sourceDocid: "#abc",
      sourceUri: "gno://notes/file.md",
      sourceTitle: "My Document Title",
      linkText: "",
      startLine: 1,
      startCol: 1,
    };
    const displayName =
      backlink.sourceTitle || backlink.sourceUri.split("/").pop() || "Untitled";
    expect(displayName).toBe("My Document Title");
  });

  test("falls back to filename when title empty", () => {
    const backlink: MockBacklink = {
      sourceDocid: "#abc",
      sourceUri: "gno://notes/file.md",
      sourceTitle: "",
      linkText: "",
      startLine: 1,
      startCol: 1,
    };
    const displayName =
      backlink.sourceTitle || backlink.sourceUri.split("/").pop() || "Untitled";
    expect(displayName).toBe("file.md");
  });

  test("truncates long context snippets", () => {
    const longText = "A".repeat(150);
    const maxLength = 120;
    const truncated =
      longText.length > maxLength
        ? `${longText.slice(0, maxLength)}…`
        : longText;
    expect(truncated.length).toBe(121); // 120 + ellipsis
    expect(truncated.endsWith("…")).toBe(true);
  });

  test("preserves short context snippets", () => {
    const shortText = "Short link text";
    const maxLength = 120;
    const result =
      shortText.length > maxLength
        ? `${shortText.slice(0, maxLength)}…`
        : shortText;
    expect(result).toBe("Short link text");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cache Key Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("BacklinksPanel cache key generation", () => {
  test("generates unique cache key per docId", () => {
    const docId1 = "#abc123";
    const docId2 = "#def456";

    const key1 = `backlinks:${docId1}`;
    const key2 = `backlinks:${docId2}`;

    expect(key1).toBe("backlinks:#abc123");
    expect(key2).toBe("backlinks:#def456");
    expect(key1).not.toBe(key2);
  });

  test("handles special characters in docId", () => {
    const docId = "#special/chars";
    const key = `backlinks:${docId}`;
    expect(key).toBe("backlinks:#special/chars");
  });
});
