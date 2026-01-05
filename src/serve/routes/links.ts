/**
 * REST API routes for document links (outgoing, backlinks, similar).
 *
 * @module src/serve/routes/links
 */

import type { SqliteAdapter } from "../../store/sqlite/adapter";
import type { ServerContext } from "../context";

import { decodeEmbedding } from "../../store/vector/sqlite-vec";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkResponse {
  links: Array<{
    targetRef: string;
    targetRefNorm: string;
    targetAnchor?: string;
    targetCollection?: string;
    linkType: "wiki" | "markdown";
    linkText?: string;
    startLine: number;
    startCol: number;
    endLine: number;
    endCol: number;
    source: "parsed" | "user" | "suggested";
  }>;
  meta: {
    docid: string;
    totalLinks: number;
    typeFilter?: "wiki" | "markdown";
  };
}

export interface BacklinkResponse {
  backlinks: Array<{
    sourceDocid: string;
    sourceUri: string;
    sourceTitle?: string;
    linkText?: string;
    startLine: number;
    startCol: number;
  }>;
  meta: {
    docid: string;
    totalBacklinks: number;
  };
}

export interface SimilarDocResponse {
  similar: Array<{
    docid: string;
    uri: string;
    title?: string;
    collection: string;
    score: number;
  }>;
  meta: {
    docid: string;
    totalResults: number;
    limit: number;
    threshold: number;
    crossCollection: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return jsonResponse({ error: { code, message } }, status);
}

/**
 * Parse and validate a positive integer query param.
 * Returns default if missing, NaN, or out of bounds.
 */
function parsePositiveInt(
  value: string | null,
  defaultValue: number,
  min: number,
  max: number
): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

/**
 * Parse and validate a float query param in [0, 1].
 * Returns default if missing, NaN, or out of bounds.
 */
function parseThreshold(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(0, Math.min(1, parsed));
}

// ─────────────────────────────────────────────────────────────────────────────
// Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/doc/:id/links
 * List outgoing links from a document.
 * Query params: ?type=wiki|markdown (optional filter)
 */
export async function handleDocLinks(
  store: SqliteAdapter,
  docId: string,
  url: URL
): Promise<Response> {
  // Get document
  const docResult = await store.getDocumentByDocid(docId);
  if (!docResult.ok) {
    return errorResponse("RUNTIME", docResult.error.message, 500);
  }
  if (!docResult.value) {
    return errorResponse("NOT_FOUND", "Document not found", 404);
  }

  const doc = docResult.value;

  // Get links
  const linksResult = await store.getLinksForDoc(doc.id);
  if (!linksResult.ok) {
    return errorResponse("RUNTIME", linksResult.error.message, 500);
  }

  let links = linksResult.value;

  // Validate and apply type filter
  const typeParam = url.searchParams.get("type");
  let validatedType: "wiki" | "markdown" | undefined;

  if (typeParam) {
    if (typeParam !== "wiki" && typeParam !== "markdown") {
      return errorResponse(
        "VALIDATION",
        `Invalid type filter: ${typeParam}. Must be 'wiki' or 'markdown'`,
        400
      );
    }
    validatedType = typeParam;
    links = links.filter((l) => l.linkType === validatedType);
  }

  // Sort by position for deterministic output
  links.sort((a, b) => {
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.startCol - b.startCol;
  });

  const response: LinkResponse = {
    links: links.map((l) => ({
      targetRef: l.targetRef,
      targetRefNorm: l.targetRefNorm,
      // Only include optional fields if present
      ...(l.targetAnchor && { targetAnchor: l.targetAnchor }),
      ...(l.targetCollection && { targetCollection: l.targetCollection }),
      linkType: l.linkType,
      ...(l.linkText && { linkText: l.linkText }),
      startLine: l.startLine,
      startCol: l.startCol,
      endLine: l.endLine,
      endCol: l.endCol,
      source: l.source,
    })),
    meta: {
      docid: doc.docid,
      totalLinks: links.length,
      ...(validatedType && { typeFilter: validatedType }),
    },
  };

  return jsonResponse(response);
}

/**
 * GET /api/doc/:id/backlinks
 * List documents that link TO this document.
 */
export async function handleDocBacklinks(
  store: SqliteAdapter,
  docId: string
): Promise<Response> {
  // Get document
  const docResult = await store.getDocumentByDocid(docId);
  if (!docResult.ok) {
    return errorResponse("RUNTIME", docResult.error.message, 500);
  }
  if (!docResult.value) {
    return errorResponse("NOT_FOUND", "Document not found", 404);
  }

  const doc = docResult.value;

  // Get backlinks
  const backlinksResult = await store.getBacklinksForDoc(doc.id);
  if (!backlinksResult.ok) {
    return errorResponse("RUNTIME", backlinksResult.error.message, 500);
  }

  // Sort for deterministic output
  const backlinks = [...backlinksResult.value].sort((a, b) => {
    if (a.sourceDocUri !== b.sourceDocUri) {
      return a.sourceDocUri.localeCompare(b.sourceDocUri);
    }
    if (a.startLine !== b.startLine) return a.startLine - b.startLine;
    return a.startCol - b.startCol;
  });

  const response: BacklinkResponse = {
    backlinks: backlinks.map((b) => ({
      sourceDocid: b.sourceDocid,
      sourceUri: b.sourceDocUri,
      ...(b.sourceDocTitle && { sourceTitle: b.sourceDocTitle }),
      ...(b.linkText && { linkText: b.linkText }),
      startLine: b.startLine,
      startCol: b.startCol,
    })),
    meta: {
      docid: doc.docid,
      totalBacklinks: backlinks.length,
    },
  };

  return jsonResponse(response);
}

/**
 * GET /api/doc/:id/similar
 * Find semantically similar documents using stored vector embeddings.
 * Query params:
 *   ?limit=5 (default 5, max 20)
 *   ?threshold=0.5 (min similarity score 0-1, default 0.5)
 *   ?crossCollection=true (search across all collections, default false)
 *
 * Algorithm: avg embedding of stored doc chunks -> vector search -> exclude self
 */
export async function handleDocSimilar(
  ctx: ServerContext,
  docId: string,
  url: URL
): Promise<Response> {
  const store = ctx.store;

  // Get document
  const docResult = await store.getDocumentByDocid(docId);
  if (!docResult.ok) {
    return errorResponse("RUNTIME", docResult.error.message, 500);
  }
  if (!docResult.value) {
    return errorResponse("NOT_FOUND", "Document not found", 404);
  }

  const doc = docResult.value;

  // Check vector search availability
  if (!ctx.vectorIndex?.searchAvailable) {
    return errorResponse(
      "UNAVAILABLE",
      "Similar docs requires vector search with sqlite-vec. Run: gno embed",
      503
    );
  }

  // Parse and validate query params (guard against NaN)
  const limit = parsePositiveInt(url.searchParams.get("limit"), 5, 1, 20);
  const threshold = parseThreshold(url.searchParams.get("threshold"), 0.5);
  const crossCollection = url.searchParams.get("crossCollection") === "true";

  // Check document has content
  if (!doc.mirrorHash) {
    return jsonResponse({
      similar: [],
      meta: {
        docid: doc.docid,
        totalResults: 0,
        limit,
        threshold,
        crossCollection,
      },
    } satisfies SimilarDocResponse);
  }

  // Get embedding model from context
  const embedModel = ctx.vectorIndex.model;

  // Get document's stored embeddings from content_vectors
  const db = store.getRawDb();

  interface VectorRow {
    embedding: Uint8Array;
  }

  const vectors = db
    .query<VectorRow, [string, string]>(
      "SELECT embedding FROM content_vectors WHERE mirror_hash = ? AND model = ?"
    )
    .all(doc.mirrorHash, embedModel);

  if (vectors.length === 0) {
    return jsonResponse({
      similar: [],
      meta: {
        docid: doc.docid,
        totalResults: 0,
        limit,
        threshold,
        crossCollection,
      },
    } satisfies SimilarDocResponse);
  }

  // Compute average embedding from stored chunk embeddings
  let dimensions: number;
  let avgEmbedding: Float32Array;

  try {
    const firstVec = decodeEmbedding(vectors[0]!.embedding);
    dimensions = firstVec.length;
    avgEmbedding = new Float32Array(dimensions);

    for (const v of vectors) {
      const emb = decodeEmbedding(v.embedding);
      if (emb.length !== dimensions) {
        return errorResponse(
          "RUNTIME",
          "Inconsistent embedding dimensions in stored vectors",
          500
        );
      }
      for (let i = 0; i < dimensions; i++) {
        const current = avgEmbedding[i] ?? 0;
        const embVal = emb[i] ?? 0;
        avgEmbedding[i] = current + embVal / vectors.length;
      }
    }
  } catch (e) {
    return errorResponse(
      "RUNTIME",
      `Invalid stored embedding data: ${e instanceof Error ? e.message : String(e)}`,
      500
    );
  }

  // Normalize the average embedding for cosine similarity
  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    const val = avgEmbedding[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) {
      avgEmbedding[i] = (avgEmbedding[i] ?? 0) / norm;
    }
  }

  // Search for similar docs (request extra to account for self-exclusion, filtering)
  const candidateLimit = Math.min(limit * 20, 200);
  const searchResult = await ctx.vectorIndex.searchNearest(
    avgEmbedding,
    candidateLimit,
    {}
  );

  if (!searchResult.ok) {
    return errorResponse("RUNTIME", searchResult.error.message, 500);
  }

  // Get all docs for lookup (single query)
  const docsResult = await store.listDocuments(
    crossCollection ? undefined : doc.collection
  );
  if (!docsResult.ok) {
    return errorResponse("RUNTIME", docsResult.error.message, 500);
  }

  const docsByHash = new Map(
    docsResult.value
      .filter((d) => d.mirrorHash && d.active)
      .map((d) => [d.mirrorHash!, d])
  );

  // Build similar docs list, excluding self
  const similar: SimilarDocResponse["similar"] = [];
  const seenDocids = new Set<string>();

  for (const vec of searchResult.value) {
    if (similar.length >= limit) break;

    const similarDoc = docsByHash.get(vec.mirrorHash);
    if (!similarDoc) continue;

    // Exclude self
    if (similarDoc.docid === doc.docid) continue;

    // Skip duplicates
    if (seenDocids.has(similarDoc.docid)) continue;

    // Compute similarity score from cosine distance
    // sqlite-vec with cosine metric returns distance where similarity = 1 - distance
    const score = Math.max(0, Math.min(1, 1 - vec.distance));
    if (score < threshold) continue;

    similar.push({
      docid: similarDoc.docid,
      uri: similarDoc.uri,
      ...(similarDoc.title && { title: similarDoc.title }),
      collection: similarDoc.collection,
      score,
    });

    seenDocids.add(similarDoc.docid);
  }

  // Sort by score descending
  similar.sort((a, b) => b.score - a.score);

  const response: SimilarDocResponse = {
    similar: similar.slice(0, limit),
    meta: {
      docid: doc.docid,
      totalResults: similar.length,
      limit,
      threshold,
      crossCollection,
    },
  };

  return jsonResponse(response);
}
