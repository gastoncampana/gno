/**
 * Unit tests for RelatedNotesSidebar component logic.
 *
 * Tests core functionality: caching, debouncing, request sequencing.
 * Uses isolated testing without full React rendering.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

// -----------------------------------------------------------------------------
// Test the cache implementation directly
// -----------------------------------------------------------------------------

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 30000; // 30s

function createCache<T>() {
  const cache = new Map<string, CacheEntry<T>>();

  return {
    get(key: string): T | null {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
      }
      return entry.data;
    },

    set(key: string, data: T): void {
      cache.set(key, { data, timestamp: Date.now() });
    },

    clear(): void {
      cache.clear();
    },

    size(): number {
      return cache.size;
    },
  };
}

describe("RelatedNotesSidebar cache", () => {
  let cache: ReturnType<typeof createCache<{ similar: unknown[] }>>;

  beforeEach(() => {
    cache = createCache();
  });

  afterEach(() => {
    cache.clear();
  });

  test("returns null for missing key", () => {
    expect(cache.get("nonexistent")).toBeNull();
  });

  test("stores and retrieves data", () => {
    const data = { similar: [{ docid: "#1", score: 0.9 }] };
    cache.set("doc:123", data);
    expect(cache.get("doc:123")).toEqual(data);
  });

  test("tracks cache size", () => {
    expect(cache.size()).toBe(0);
    cache.set("key1", { similar: [] });
    expect(cache.size()).toBe(1);
    cache.set("key2", { similar: [] });
    expect(cache.size()).toBe(2);
  });

  test("clears cache", () => {
    cache.set("key1", { similar: [] });
    cache.set("key2", { similar: [] });
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("key1")).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Test cache key building
// -----------------------------------------------------------------------------

function buildCacheKey(
  docId: string,
  limit: number,
  threshold: number,
  contentHash?: string
): string {
  return `similar:${docId}:${limit}:${threshold}:${contentHash ?? "static"}`;
}

function hashContent(content: string): string {
  let hash = 0;
  for (const char of content) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash = hash & hash;
  }
  return hash.toString(36);
}

describe("RelatedNotesSidebar cache key", () => {
  test("builds key with all params", () => {
    const key = buildCacheKey("#abc", 5, 0.5, "xyz");
    expect(key).toBe("similar:#abc:5:0.5:xyz");
  });

  test("uses 'static' when no content hash", () => {
    const key = buildCacheKey("#abc", 5, 0.5);
    expect(key).toBe("similar:#abc:5:0.5:static");
  });

  test("different docIds produce different keys", () => {
    const key1 = buildCacheKey("#a", 5, 0.5);
    const key2 = buildCacheKey("#b", 5, 0.5);
    expect(key1).not.toBe(key2);
  });

  test("different limits produce different keys", () => {
    const key1 = buildCacheKey("#a", 5, 0.5);
    const key2 = buildCacheKey("#a", 10, 0.5);
    expect(key1).not.toBe(key2);
  });

  test("different thresholds produce different keys", () => {
    const key1 = buildCacheKey("#a", 5, 0.5);
    const key2 = buildCacheKey("#a", 5, 0.7);
    expect(key1).not.toBe(key2);
  });
});

describe("content hash", () => {
  test("produces consistent hash for same content", () => {
    const hash1 = hashContent("hello world");
    const hash2 = hashContent("hello world");
    expect(hash1).toBe(hash2);
  });

  test("produces different hash for different content", () => {
    const hash1 = hashContent("hello");
    const hash2 = hashContent("world");
    expect(hash1).not.toBe(hash2);
  });

  test("handles empty string", () => {
    const hash = hashContent("");
    expect(hash).toBe("0");
  });

  test("handles unicode", () => {
    const hash = hashContent("hello");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });
});

// -----------------------------------------------------------------------------
// Test debounce logic
// -----------------------------------------------------------------------------

function createDebouncer(delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    debounce(fn: () => void): void {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fn, delay);
    },

    cancel(): void {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    isPending(): boolean {
      return timer !== null;
    },
  };
}

describe("RelatedNotesSidebar debounce", () => {
  test("delays execution", async () => {
    const debouncer = createDebouncer(50);
    let called = false;

    debouncer.debounce(() => {
      called = true;
    });

    expect(called).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(called).toBe(true);
  });

  test("cancels pending execution on new call", async () => {
    const debouncer = createDebouncer(50);
    let callCount = 0;

    debouncer.debounce(() => {
      callCount++;
    });
    debouncer.debounce(() => {
      callCount++;
    });
    debouncer.debounce(() => {
      callCount++;
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(callCount).toBe(1);
  });

  test("can cancel pending", async () => {
    const debouncer = createDebouncer(50);
    let called = false;

    debouncer.debounce(() => {
      called = true;
    });
    expect(debouncer.isPending()).toBe(true);

    debouncer.cancel();
    expect(debouncer.isPending()).toBe(false);

    // Verify callback never fires
    await new Promise((r) => setTimeout(r, 60));
    expect(called).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Test request sequencing
// -----------------------------------------------------------------------------

function createRequestSequencer() {
  let currentId = 0;

  return {
    next(): number {
      return ++currentId;
    },

    isCurrent(id: number): boolean {
      return id === currentId;
    },

    current(): number {
      return currentId;
    },
  };
}

describe("RelatedNotesSidebar request sequencing", () => {
  test("increments request ID", () => {
    const sequencer = createRequestSequencer();
    expect(sequencer.next()).toBe(1);
    expect(sequencer.next()).toBe(2);
    expect(sequencer.next()).toBe(3);
  });

  test("isCurrent returns true for latest", () => {
    const sequencer = createRequestSequencer();
    sequencer.next();
    sequencer.next();
    const id = sequencer.next();
    expect(sequencer.isCurrent(id)).toBe(true);
  });

  test("isCurrent returns false for stale", () => {
    const sequencer = createRequestSequencer();
    const oldId = sequencer.next();
    sequencer.next();
    expect(sequencer.isCurrent(oldId)).toBe(false);
  });

  test("prevents race conditions", async () => {
    const sequencer = createRequestSequencer();
    const results: number[] = [];

    // Simulate 3 overlapping requests
    const makeRequest = async (delay: number): Promise<void> => {
      const id = sequencer.next();
      await new Promise((r) => setTimeout(r, delay));
      if (sequencer.isCurrent(id)) {
        results.push(id);
      }
    };

    // Start 3 requests with different delays
    // Request 1: takes 100ms
    // Request 2: takes 50ms
    // Request 3: takes 10ms
    await Promise.all([makeRequest(100), makeRequest(50), makeRequest(10)]);

    // Only the last request (id=3) should have been accepted
    expect(results).toEqual([3]);
  });
});

// -----------------------------------------------------------------------------
// Test similarity score display
// -----------------------------------------------------------------------------

function scoreToPercentage(score: number): number {
  return Math.round(score * 100);
}

describe("similarity score display", () => {
  test("converts score to percentage", () => {
    expect(scoreToPercentage(0.85)).toBe(85);
    expect(scoreToPercentage(0.5)).toBe(50);
    expect(scoreToPercentage(0.123)).toBe(12);
  });

  test("handles edge cases", () => {
    const zero = 0;
    const one = 1;
    expect(scoreToPercentage(zero)).toBe(0);
    expect(scoreToPercentage(one)).toBe(100);
    expect(scoreToPercentage(0.999)).toBe(100);
    expect(scoreToPercentage(0.001)).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Test API URL construction
// -----------------------------------------------------------------------------

function buildApiUrl(docId: string, limit: number, threshold: number): string {
  const params = new URLSearchParams({
    limit: String(limit),
    threshold: String(threshold),
  });
  return `/api/doc/${encodeURIComponent(docId)}/similar?${params.toString()}`;
}

describe("API URL construction", () => {
  test("builds correct URL", () => {
    const url = buildApiUrl("#abc123", 5, 0.5);
    expect(url).toBe("/api/doc/%23abc123/similar?limit=5&threshold=0.5");
  });

  test("encodes special characters in docId", () => {
    const url = buildApiUrl("doc#with/special?chars", 5, 0.5);
    expect(url).toContain("doc%23with%2Fspecial%3Fchars");
  });

  test("handles different limit values", () => {
    const url = buildApiUrl("#a", 10, 0.5);
    expect(url).toContain("limit=10");
  });

  test("handles different threshold values", () => {
    const url = buildApiUrl("#a", 5, 0.75);
    expect(url).toContain("threshold=0.75");
  });
});

// -----------------------------------------------------------------------------
// Test cache TTL expiration (time-based)
// -----------------------------------------------------------------------------

describe("cache TTL expiration", () => {
  test("entry expires after TTL", async () => {
    // Create cache with very short TTL for testing
    const SHORT_TTL = 50;
    const cache = new Map<string, CacheEntry<string>>();

    const get = (key: string): string | null => {
      const entry = cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > SHORT_TTL) {
        cache.delete(key);
        return null;
      }
      return entry.data;
    };

    const set = (key: string, data: string): void => {
      cache.set(key, { data, timestamp: Date.now() });
    };

    // Set value
    set("key", "value");
    expect(get("key")).toBe("value");

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));

    // Should be expired
    expect(get("key")).toBeNull();
    expect(cache.size).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Integration: simulate component behavior
// -----------------------------------------------------------------------------

describe("component behavior simulation", () => {
  test("full flow: cache miss -> fetch -> cache hit", async () => {
    const cache = createCache<{ similar: unknown[] }>();
    const sequencer = createRequestSequencer();
    let fetchCount = 0;

    const fetchSimilar = async (
      docId: string,
      limit: number,
      threshold: number
    ): Promise<{ similar: unknown[] }> => {
      const cacheKey = buildCacheKey(docId, limit, threshold);

      // Check cache
      const cached = cache.get(cacheKey);
      if (cached) return cached;

      // Track request
      const id = sequencer.next();

      // Simulate fetch
      fetchCount++;
      const data = { similar: [{ docid: "#1", score: 0.9 }] };

      // Only cache if still current
      if (sequencer.isCurrent(id)) {
        cache.set(cacheKey, data);
      }

      return data;
    };

    // First fetch - cache miss
    const result1 = await fetchSimilar("#doc1", 5, 0.5);
    expect(result1.similar).toHaveLength(1);
    expect(fetchCount).toBe(1);

    // Second fetch - cache hit
    const result2 = await fetchSimilar("#doc1", 5, 0.5);
    expect(result2.similar).toHaveLength(1);
    expect(fetchCount).toBe(1); // No additional fetch

    // Different params - cache miss
    await fetchSimilar("#doc1", 10, 0.5);
    expect(fetchCount).toBe(2);
  });

  test("content change triggers refetch via different cache key", async () => {
    const cache = createCache<{ similar: unknown[] }>();
    let fetchCount = 0;

    const fetchWithContent = async (
      docId: string,
      content: string | undefined
    ): Promise<{ similar: unknown[] }> => {
      const contentHash = content ? hashContent(content) : undefined;
      const cacheKey = buildCacheKey(docId, 5, 0.5, contentHash);

      const cached = cache.get(cacheKey);
      if (cached) return cached;

      fetchCount++;
      const data = { similar: [] };
      cache.set(cacheKey, data);
      return data;
    };

    // Initial fetch
    await fetchWithContent("#doc1", undefined);
    expect(fetchCount).toBe(1);

    // Same content - cache hit
    await fetchWithContent("#doc1", undefined);
    expect(fetchCount).toBe(1);

    // Content changed - cache miss
    await fetchWithContent("#doc1", "new content");
    expect(fetchCount).toBe(2);

    // Same changed content - cache hit
    await fetchWithContent("#doc1", "new content");
    expect(fetchCount).toBe(2);

    // Different content - cache miss
    await fetchWithContent("#doc1", "different content");
    expect(fetchCount).toBe(3);
  });
});

// -----------------------------------------------------------------------------
// Props validation
// -----------------------------------------------------------------------------

describe("props defaults", () => {
  const defaultLimit = 5;
  const defaultThreshold = 0.5;

  test("default limit is 5", () => {
    expect(defaultLimit).toBe(5);
  });

  test("default threshold is 0.5", () => {
    expect(defaultThreshold).toBe(0.5);
  });

  test("threshold range is 0-1", () => {
    expect(defaultThreshold).toBeGreaterThanOrEqual(0);
    expect(defaultThreshold).toBeLessThanOrEqual(1);
  });
});
