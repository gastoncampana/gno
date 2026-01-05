/**
 * BacklinksPanel - Collapsible sidebar showing docs linking TO current document.
 *
 * Aesthetic: Scholarly index card catalog / cross-reference slips
 * - Each backlink as a miniature index card with brass accents
 * - Context snippets shown as highlighted marginalia
 * - Brass connecting lines suggest knowledge graph web
 * - Specimen cabinet drawer feel from TagFacets extended here
 */

import { ChevronDownIcon, ChevronRightIcon, LinkIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../hooks/use-api";
import { cn } from "../lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

/** Single backlink from API */
interface Backlink {
  sourceDocid: string;
  sourceUri: string;
  sourceTitle: string;
  linkText: string;
  startLine: number;
  startCol: number;
}

/** API response shape */
interface BacklinksResponse {
  backlinks: Backlink[];
  meta: {
    docid: string;
    totalBacklinks: number;
  };
}

export interface BacklinksPanelProps {
  /** Current document ID to fetch backlinks for */
  docId: string;
  /** Additional CSS classes */
  className?: string;
  /** Initial collapsed state */
  defaultOpen?: boolean;
  /** Navigate to source doc callback */
  onNavigate?: (uri: string) => void;
}

/** Simple in-memory cache with TTL */
interface CacheEntry {
  data: BacklinksResponse;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30000; // 30 seconds

function getCached(key: string): BacklinksResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: BacklinksResponse): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/** Loading skeleton - index cards shimmer */
function BacklinksSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[1, 2, 3].map((i) => (
        <div
          className="rounded border border-muted/20 bg-muted/5 p-2.5"
          key={i}
        >
          {/* Title line */}
          <div
            className="mb-2 h-3.5 w-3/4 animate-pulse rounded bg-muted/40"
            style={{ animationDelay: `${i * 100}ms` }}
          />
          {/* Context snippet */}
          <div className="space-y-1">
            <div
              className="h-2.5 w-full animate-pulse rounded bg-muted/20"
              style={{ animationDelay: `${i * 100 + 50}ms` }}
            />
            <div
              className="h-2.5 w-2/3 animate-pulse rounded bg-muted/20"
              style={{ animationDelay: `${i * 100 + 100}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Empty state - no references found */
function BacklinksEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      {/* Brass-ringed empty indicator */}
      <div className="flex size-10 items-center justify-center rounded-full border border-secondary/30 bg-muted/10">
        <LinkIcon className="size-4 text-muted-foreground/40" />
      </div>
      <p className="font-mono text-muted-foreground text-xs">
        No backlinks found
      </p>
      <p className="text-muted-foreground/60 text-xs">
        Other documents haven&apos;t linked to this one yet
      </p>
    </div>
  );
}

/** Individual backlink card */
function BacklinkCard({
  backlink,
  onNavigate,
}: {
  backlink: Backlink;
  onNavigate?: (uri: string) => void;
}) {
  // Extract filename from URI for display
  const displayName =
    backlink.sourceTitle || backlink.sourceUri.split("/").pop() || "Untitled";

  // Truncate context if too long
  const contextSnippet =
    backlink.linkText.length > 120
      ? `${backlink.linkText.slice(0, 120)}…`
      : backlink.linkText;

  return (
    <button
      className={cn(
        // Index card aesthetic
        "group relative w-full text-left",
        "rounded border border-muted/20 bg-muted/5",
        "p-2.5 transition-all duration-200",
        // Hover - card lifts, brass glow
        "hover:border-secondary/40 hover:bg-muted/10",
        "hover:shadow-[0_2px_8px_rgba(212,160,83,0.1)]",
        // Focus state
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
      )}
      onClick={() => onNavigate?.(backlink.sourceUri)}
      type="button"
    >
      {/* Brass corner accent */}
      <div className="absolute top-0 right-0 size-2 border-t border-r border-secondary/30 transition-colors group-hover:border-secondary/60" />

      {/* Source document title */}
      <div className="mb-1.5 flex items-start gap-1.5">
        <LinkIcon className="mt-0.5 size-3 shrink-0 text-secondary/60" />
        <span className="line-clamp-1 font-mono text-[11px] text-foreground/90 leading-tight">
          {displayName}
        </span>
      </div>

      {/* Context snippet - highlighted marginalia feel */}
      {contextSnippet && (
        <div
          className={cn(
            "ml-4.5 border-l-2 border-primary/20 pl-2",
            "transition-colors group-hover:border-primary/40"
          )}
        >
          <p className="line-clamp-2 text-[10px] text-muted-foreground/70 italic leading-relaxed">
            &ldquo;{contextSnippet}&rdquo;
          </p>
        </div>
      )}

      {/* Line reference - brass plate style */}
      <div className="mt-1.5 flex justify-end">
        <span className="rounded bg-secondary/10 px-1 py-0.5 font-mono text-[9px] text-secondary/60 tabular-nums">
          L{backlink.startLine}:{backlink.startCol}
        </span>
      </div>
    </button>
  );
}

export function BacklinksPanel({
  docId,
  className,
  defaultOpen = true,
  onNavigate,
}: BacklinksPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request sequencing - track latest request to ignore stale responses
  const requestIdRef = useRef(0);

  // Cache key for this doc
  const cacheKey = `backlinks:${docId}`;

  // Fetch backlinks
  const fetchBacklinks = useCallback(async () => {
    // Increment request ID for sequencing
    const currentRequestId = ++requestIdRef.current;

    // Check cache first
    const cached = getCached(cacheKey);
    if (cached) {
      setBacklinks(cached.backlinks);
      setTotalCount(cached.meta.totalBacklinks);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const url = `/api/doc/${encodeURIComponent(docId)}/backlinks`;
    const { data, error: fetchError } = await apiFetch<BacklinksResponse>(url);

    // Ignore stale response if newer request was made
    if (currentRequestId !== requestIdRef.current) {
      return;
    }

    if (fetchError || !data) {
      setError(fetchError ?? "Failed to load backlinks");
      setLoading(false);
      return;
    }

    // Cache and update state
    setCache(cacheKey, data);
    setBacklinks(data.backlinks);
    setTotalCount(data.meta.totalBacklinks);
    setLoading(false);
  }, [cacheKey, docId]);

  // Fetch on mount and when docId changes
  useEffect(() => {
    void fetchBacklinks();
  }, [fetchBacklinks]);

  return (
    <Collapsible
      className={cn("", className)}
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      {/* Panel header - drawer handle aesthetic */}
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2",
          "rounded-sm px-2 py-1.5",
          "transition-colors duration-150",
          "hover:bg-muted/20"
        )}
      >
        {/* Chevron */}
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/60">
          {isOpen ? (
            <ChevronDownIcon className="size-3.5 transition-transform duration-200" />
          ) : (
            <ChevronRightIcon className="size-3.5 transition-transform duration-200" />
          )}
        </span>

        {/* Title - brass label */}
        <span className="flex-1 text-left font-mono text-[11px] text-muted-foreground uppercase tracking-wider">
          Backlinks
        </span>

        {/* Count badge - brass plate */}
        {!loading && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5",
              "font-mono text-[10px] tabular-nums",
              "transition-colors duration-150",
              totalCount > 0
                ? "bg-primary/15 text-primary"
                : "bg-muted/20 text-muted-foreground/60"
            )}
          >
            {totalCount}
          </span>
        )}

        {/* Loading indicator */}
        {loading && (
          <span className="size-3 animate-spin rounded-full border border-muted-foreground/20 border-t-primary/60" />
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapse-up data-[state=open]:animate-collapse-down">
        {/* Content area */}
        {loading ? (
          <BacklinksSkeleton />
        ) : error ? (
          <div className="p-4 text-center">
            <p className="font-mono text-destructive text-xs">{error}</p>
            <button
              className="mt-2 font-mono text-primary text-xs underline-offset-2 hover:underline"
              onClick={() => void fetchBacklinks()}
              type="button"
            >
              Retry
            </button>
          </div>
        ) : backlinks.length === 0 ? (
          <BacklinksEmpty />
        ) : (
          <div className="space-y-1.5 p-2">
            {backlinks.map((bl) => (
              <BacklinkCard
                backlink={bl}
                key={`${bl.sourceDocid}-${bl.startLine}-${bl.startCol}`}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
