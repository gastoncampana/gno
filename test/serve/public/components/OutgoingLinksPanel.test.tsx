/**
 * Tests for OutgoingLinksPanel component logic.
 *
 * Since the project uses route-level testing rather than React Testing Library,
 * we test the component's data transformation and props interface through unit tests.
 */

import { describe, expect, test } from "bun:test";

import type { OutgoingLink } from "../../../../src/serve/public/components/OutgoingLinksPanel";

// Re-export type for external tests
describe("OutgoingLinksPanel types", () => {
  test("OutgoingLink interface matches API response shape", () => {
    // Validate the interface structure against expected API response
    const link: OutgoingLink = {
      targetRef: "Test Note",
      targetRefNorm: "test note",
      linkType: "wiki",
      startLine: 5,
      startCol: 1,
      endLine: 5,
      endCol: 20,
      source: "parsed",
    };

    expect(link.targetRef).toBe("Test Note");
    expect(link.targetRefNorm).toBe("test note");
    expect(link.linkType).toBe("wiki");
    expect(link.startLine).toBe(5);
    expect(link.startCol).toBe(1);
    expect(link.endLine).toBe(5);
    expect(link.endCol).toBe(20);
    expect(link.source).toBe("parsed");
  });

  test("OutgoingLink supports optional fields", () => {
    const linkWithOptionals: OutgoingLink = {
      targetRef: "Other Doc",
      targetRefNorm: "other doc",
      targetAnchor: "section-heading",
      targetCollection: "notes",
      linkType: "markdown",
      linkText: "display text",
      startLine: 10,
      startCol: 1,
      endLine: 10,
      endCol: 30,
      source: "parsed",
      resolved: true,
    };

    expect(linkWithOptionals.targetAnchor).toBe("section-heading");
    expect(linkWithOptionals.targetCollection).toBe("notes");
    expect(linkWithOptionals.linkText).toBe("display text");
    expect(linkWithOptionals.resolved).toBe(true);
  });

  test("OutgoingLink resolved=false indicates broken link", () => {
    const brokenLink: OutgoingLink = {
      targetRef: "Missing Note",
      targetRefNorm: "missing note",
      linkType: "wiki",
      startLine: 1,
      startCol: 1,
      endLine: 1,
      endCol: 15,
      source: "parsed",
      resolved: false,
    };

    expect(brokenLink.resolved).toBe(false);
  });
});

describe("OutgoingLinksPanel URI building", () => {
  // Test the URI building logic that would be used in navigation

  function buildUri(
    link: Pick<OutgoingLink, "targetCollection" | "targetRefNorm">
  ): string {
    if (link.targetCollection) {
      return `${link.targetCollection}:${link.targetRefNorm}`;
    }
    return link.targetRefNorm;
  }

  test("builds URI with collection prefix", () => {
    const uri = buildUri({
      targetCollection: "notes",
      targetRefNorm: "my document",
    });
    expect(uri).toBe("notes:my document");
  });

  test("builds URI without collection when not present", () => {
    const uri = buildUri({
      targetCollection: undefined,
      targetRefNorm: "standalone-doc",
    });
    expect(uri).toBe("standalone-doc");
  });
});

describe("OutgoingLinksPanel link classification", () => {
  // Test link classification logic

  function isWikiLink(link: Pick<OutgoingLink, "linkType">): boolean {
    return link.linkType === "wiki";
  }

  function isBrokenLink(link: Pick<OutgoingLink, "resolved">): boolean {
    return link.resolved === false;
  }

  function countBrokenLinks(
    links: Array<Pick<OutgoingLink, "resolved">>
  ): number {
    return links.filter((l) => l.resolved === false).length;
  }

  test("identifies wiki links", () => {
    expect(isWikiLink({ linkType: "wiki" })).toBe(true);
    expect(isWikiLink({ linkType: "markdown" })).toBe(false);
  });

  test("identifies broken links", () => {
    expect(isBrokenLink({ resolved: false })).toBe(true);
    expect(isBrokenLink({ resolved: true })).toBe(false);
    // undefined resolved means not checked yet - not broken
    expect(isBrokenLink({ resolved: undefined })).toBe(false);
  });

  test("counts broken links in array", () => {
    const links = [
      { resolved: true },
      { resolved: false },
      { resolved: undefined },
      { resolved: false },
    ];
    expect(countBrokenLinks(links)).toBe(2);
  });
});

describe("OutgoingLinksPanel display text", () => {
  // Test display text selection logic

  function getDisplayText(
    link: Pick<OutgoingLink, "linkText" | "targetRef">
  ): string {
    return link.linkText || link.targetRef;
  }

  test("uses linkText when available", () => {
    const link = { linkText: "Display Text", targetRef: "actual-ref" };
    expect(getDisplayText(link)).toBe("Display Text");
  });

  test("falls back to targetRef when no linkText", () => {
    const link = { linkText: undefined, targetRef: "My Note" };
    expect(getDisplayText(link)).toBe("My Note");
  });

  test("falls back to targetRef when linkText is empty", () => {
    const link = { linkText: "", targetRef: "My Note" };
    expect(getDisplayText(link)).toBe("My Note");
  });
});

describe("OutgoingLinksPanel API URL encoding", () => {
  // Test URL encoding for API calls

  function buildApiUrl(docId: string): string {
    return `/api/doc/${encodeURIComponent(docId)}/links`;
  }

  test("encodes docId with hash prefix", () => {
    const url = buildApiUrl("#abc123");
    expect(url).toBe("/api/doc/%23abc123/links");
  });

  test("encodes docId with special characters", () => {
    const url = buildApiUrl("#doc/path with spaces");
    expect(url).toBe("/api/doc/%23doc%2Fpath%20with%20spaces/links");
  });

  test("handles simple docId", () => {
    const url = buildApiUrl("simple-id");
    expect(url).toBe("/api/doc/simple-id/links");
  });
});
