# Evals Specification (Evalite v1)

This document specifies the evaluation harness for GNO using Evalite v1.

## Overview

GNO uses Evalite for:
- **Ranking quality gates**: Validate `vsearch` and `query` return relevant results
- **Stability checks**: Ensure structured expansion outputs are schema-valid
- **Multilingual sanity**: Cross-language retrieval works (DE query → EN doc)

## Dependencies

```json
{
  "devDependencies": {
    "evalite": "^1.0.0",
    "vitest": "^3.0.0",
    "better-sqlite3": "^11.0.0"
  }
}
```

Note: `better-sqlite3` is required for persistent eval storage.

## File Structure

```
test/
  eval/
    vsearch.eval.ts           # vector search ranking
    query.eval.ts             # hybrid query pipeline
    expansion.eval.ts         # structured expansion stability
    multilingual.eval.ts      # cross-language ranking
    scorers/
      ir-metrics.ts           # recall@k, nDCG@k scorers
      expansion-validity.ts   # schema validation scorer
    fixtures/
      corpus/
        de/                   # German test docs
        en/                   # English test docs
        fr/                   # French test docs
        it/                   # Italian test docs
      queries.json            # query-judgment pairs
evalite.config.ts             # global configuration
```

## Configuration

### `evalite.config.ts`

```ts
import { defineConfig } from "evalite/config";
import { createSqliteStorage } from "evalite/sqlite-storage";

export default defineConfig({
  // Persistent storage for tracking scores over time
  storage: () => createSqliteStorage("./evalite.db"),

  // Test execution
  testTimeout: 120_000,   // 2 min for embedding + rerank
  maxConcurrency: 10,     // parallel test cases

  // Quality gate (MVP: 70%, increase as baseline improves)
  scoreThreshold: 70,

  // Cache LLM responses for fast iteration in dev
  cache: true,

  // Watch mode triggers: rerun when these change
  forceRerunTriggers: [
    "src/pipeline/**/*.ts",
    "src/llm/**/*.ts",
    "test/eval/fixtures/**/*",
  ],
});
```

### `package.json` Scripts

```json
{
  "scripts": {
    "eval": "evalite",
    "eval:watch": "evalite watch",
    "eval:ci": "evalite --threshold=70 --outputPath=./eval-results.json"
  }
}
```

## Custom Scorers

Evalite doesn't include IR-specific scorers. Create them in `test/eval/scorers/ir-metrics.ts`:

### Recall@K

```ts
import { createScorer } from "evalite";

type RecallInput = { query: string; collection?: string };
type RecallOutput = string[];  // docids
type RecallExpected = string[];  // relevant docids

export const recallAtK = (k: number) => createScorer<
  RecallInput,
  RecallOutput,
  RecallExpected
>({
  name: `Recall@${k}`,
  description: `Fraction of relevant docs retrieved in top ${k} results`,
  scorer: ({ output, expected }) => {
    if (!expected || expected.length === 0) {
      return { score: 1, metadata: { k, hits: 0, total: 0, note: "no relevants" } };
    }
    const topK = output.slice(0, k);
    const hits = expected.filter(docid => topK.includes(docid)).length;
    return {
      score: hits / expected.length,
      metadata: { k, hits, total: expected.length },
    };
  },
});
```

### nDCG@K

```ts
type NdcgInput = { query: string; collection?: string };
type NdcgOutput = string[];
type NdcgExpected = Array<{ docid: string; relevance: number }>;

export const ndcgAtK = (k: number) => createScorer<
  NdcgInput,
  NdcgOutput,
  NdcgExpected
>({
  name: `nDCG@${k}`,
  description: `Normalized Discounted Cumulative Gain at rank ${k}`,
  scorer: ({ output, expected }) => {
    if (!expected || expected.length === 0) {
      return { score: 1, metadata: { k, dcg: 0, idcg: 0, note: "no judgments" } };
    }

    const relevanceMap = new Map(expected.map(e => [e.docid, e.relevance]));

    // DCG for actual ranking
    const dcg = output.slice(0, k).reduce((sum, docid, i) => {
      const rel = relevanceMap.get(docid) ?? 0;
      return sum + (Math.pow(2, rel) - 1) / Math.log2(i + 2);
    }, 0);

    // Ideal DCG (sorted by relevance)
    const idcg = [...expected]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, k)
      .reduce((sum, e, i) => {
        return sum + (Math.pow(2, e.relevance) - 1) / Math.log2(i + 2);
      }, 0);

    return {
      score: idcg > 0 ? dcg / idcg : 1,
      metadata: { k, dcg: dcg.toFixed(4), idcg: idcg.toFixed(4) },
    };
  },
});
```

### Expansion Schema Validity

```ts
import { createScorer } from "evalite";
import Ajv from "ajv";
import expansionSchema from "../../spec/output-schemas/expansion.json";

const ajv = new Ajv();
const validate = ajv.compile(expansionSchema);

export const expansionSchemaValid = createScorer<
  string,
  unknown,
  undefined
>({
  name: "Expansion Schema Valid",
  description: "Checks if expansion output matches JSON schema",
  scorer: ({ output }) => {
    const valid = validate(output);
    return {
      score: valid ? 1 : 0,
      metadata: valid ? { valid: true } : { valid: false, errors: validate.errors },
    };
  },
});
```

### Latency Budget (Soft Gate)

```ts
export const latencyBudget = (maxMs: number) => createScorer<
  unknown,
  { result: unknown; durationMs: number },
  undefined
>({
  name: `Latency < ${maxMs}ms`,
  description: `Checks if task completed within ${maxMs}ms budget`,
  scorer: ({ output }) => {
    const withinBudget = output.durationMs <= maxMs;
    return {
      score: withinBudget ? 1 : Math.max(0, 1 - (output.durationMs - maxMs) / maxMs),
      metadata: { durationMs: output.durationMs, maxMs, withinBudget },
    };
  },
});
```

## Test Data Format

### `test/eval/fixtures/queries.json`

```json
[
  {
    "id": "q1",
    "query": "termination clause",
    "collection": "contracts",
    "language": "en",
    "relevantDocs": ["#a1b2c3", "#d4e5f6"],
    "judgments": [
      { "docid": "#a1b2c3", "relevance": 3 },
      { "docid": "#d4e5f6", "relevance": 2 },
      { "docid": "#g7h8i9", "relevance": 1 }
    ]
  },
  {
    "id": "q2",
    "query": "Kündigungsklausel",
    "collection": "contracts",
    "language": "de",
    "note": "German query over mixed DE/EN corpus",
    "relevantDocs": ["#a1b2c3"],
    "judgments": [
      { "docid": "#a1b2c3", "relevance": 3 }
    ]
  }
]
```

## Eval Files

### Vector Search Eval

```ts
// test/eval/vsearch.eval.ts
import { evalite } from "evalite";
import { recallAtK, ndcgAtK } from "./scorers/ir-metrics";
import { vsearch } from "../../src/pipeline/vsearch";

interface QueryData {
  id: string;
  query: string;
  collection?: string;
  relevantDocs: string[];
  judgments: Array<{ docid: string; relevance: number }>;
}

evalite("Vector Search Ranking", {
  data: async () => {
    const queries: QueryData[] = await Bun.file("test/eval/fixtures/queries.json").json();
    return queries.map((q) => ({
      input: { query: q.query, collection: q.collection },
      expected: {
        relevantDocs: q.relevantDocs,
        judgments: q.judgments,
      },
    }));
  },

  task: async (input) => {
    const results = await vsearch(input.query, {
      collection: input.collection,
      limit: 10,
    });
    return results.map(r => r.docid);
  },

  scorers: [
    {
      name: "Recall@5",
      scorer: ({ output, expected }) =>
        recallAtK(5).scorer({ input: {}, output, expected: expected.relevantDocs }),
    },
    {
      name: "Recall@10",
      scorer: ({ output, expected }) =>
        recallAtK(10).scorer({ input: {}, output, expected: expected.relevantDocs }),
    },
    {
      name: "nDCG@10",
      scorer: ({ output, expected }) =>
        ndcgAtK(10).scorer({ input: {}, output, expected: expected.judgments }),
    },
  ],

  columns: ({ input, output }) => [
    { label: "Query", value: input.query },
    { label: "Top 3", value: output.slice(0, 3).join(", ") },
  ],
});
```

### Hybrid Query Eval

```ts
// test/eval/query.eval.ts
import { evalite } from "evalite";
import { recallAtK, ndcgAtK, latencyBudget } from "./scorers/ir-metrics";
import { query } from "../../src/pipeline/query";

evalite("Hybrid Query Pipeline", {
  data: async () => {
    const queries = await Bun.file("test/eval/fixtures/queries.json").json();
    return queries.map((q) => ({
      input: { query: q.query, collection: q.collection },
      expected: {
        relevantDocs: q.relevantDocs,
        judgments: q.judgments,
      },
    }));
  },

  task: async (input) => {
    const start = performance.now();
    const results = await query(input.query, {
      collection: input.collection,
      limit: 10,
    });
    const durationMs = performance.now() - start;

    return {
      docids: results.map(r => r.docid),
      durationMs,
    };
  },

  scorers: [
    {
      name: "Recall@5",
      scorer: ({ output, expected }) =>
        recallAtK(5).scorer({ input: {}, output: output.docids, expected: expected.relevantDocs }),
    },
    {
      name: "nDCG@10",
      scorer: ({ output, expected }) =>
        ndcgAtK(10).scorer({ input: {}, output: output.docids, expected: expected.judgments }),
    },
    {
      name: "Latency < 2s",
      scorer: ({ output }) =>
        latencyBudget(2000).scorer({ input: {}, output, expected: undefined }),
    },
  ],

  trialCount: 1,  // deterministic for same model weights
});
```

### Expansion Stability Eval

```ts
// test/eval/expansion.eval.ts
import { evalite } from "evalite";
import { expansionSchemaValid } from "./scorers/expansion-validity";
import { expandQuery } from "../../src/pipeline/expansion";

evalite("Structured Expansion Stability", {
  data: async () => {
    const queries = await Bun.file("test/eval/fixtures/queries.json").json();
    return queries.map((q) => ({
      input: q.query,
    }));
  },

  task: async (input) => {
    return await expandQuery(input);
  },

  scorers: [
    {
      name: "Schema Valid",
      scorer: ({ output }) => expansionSchemaValid.scorer({ input: "", output, expected: undefined }),
    },
    {
      name: "Has Lexical Variants",
      scorer: ({ output }) => {
        const hasLexical = Array.isArray(output?.lexicalQueries) && output.lexicalQueries.length > 0;
        return { score: hasLexical ? 1 : 0, metadata: { count: output?.lexicalQueries?.length ?? 0 } };
      },
    },
    {
      name: "Has Vector Variants",
      scorer: ({ output }) => {
        const hasVector = Array.isArray(output?.vectorQueries) && output.vectorQueries.length > 0;
        return { score: hasVector ? 1 : 0, metadata: { count: output?.vectorQueries?.length ?? 0 } };
      },
    },
  ],

  // Run 3 times to detect variance in LLM expansion
  trialCount: 3,
});
```

### Multilingual Eval

```ts
// test/eval/multilingual.eval.ts
import { evalite } from "evalite";
import { recallAtK } from "./scorers/ir-metrics";
import { query } from "../../src/pipeline/query";

// Cross-language test cases: query in one language, relevant docs in another
const multilingualCases = [
  {
    query: "Kündigungsklausel",  // German
    expectedLang: "de",
    relevantDocs: ["#en-termination-1"],  // English doc
    note: "DE query should find EN termination clause doc via embeddings",
  },
  {
    query: "termination clause",  // English
    expectedLang: "en",
    relevantDocs: ["#de-kuendigung-1"],  // German doc
    note: "EN query should find DE Kündigung doc via embeddings",
  },
];

evalite("Multilingual Cross-Language Retrieval", {
  data: () => multilingualCases.map(c => ({
    input: { query: c.query },
    expected: c.relevantDocs,
  })),

  task: async (input) => {
    const results = await query(input.query, { limit: 10 });
    return results.map(r => r.docid);
  },

  scorers: [
    {
      name: "Recall@5",
      scorer: ({ output, expected }) =>
        recallAtK(5).scorer({ input: {}, output, expected }),
    },
  ],

  columns: ({ input, output }) => [
    { label: "Query", value: input.query },
    { label: "Found", value: output.slice(0, 3).join(", ") },
  ],
});
```

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/evals.yml
name: Evals

on:
  push:
    branches: [main]
  pull_request:
    paths:
      - 'src/pipeline/**'
      - 'src/llm/**'
      - 'test/eval/**'

jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install

      - name: Run evals
        run: bun run eval:ci
        env:
          # Models cached in CI, no network needed
          GNO_CACHE_DIR: ${{ runner.temp }}/gno-cache

      - name: Export eval UI
        if: always()
        run: bun run evalite export --output=./eval-ui

      - name: Upload eval results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-results
          path: |
            eval-results.json
            eval-ui/

      - name: Upload eval UI
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: eval-ui
          path: eval-ui/
```

### Threshold Strategy

| Phase | Threshold | Rationale |
|-------|-----------|-----------|
| MVP | 70% | Baseline, allow room for improvement |
| Beta | 80% | Tighten as quality stabilizes |
| GA | 90% | Production quality gate |

Configure in CI:

```bash
# Soft fail during development
evalite --threshold=70 || echo "Evals below threshold (soft fail)"

# Hard fail in production
evalite --threshold=90
```

## Tracing with AI SDK

When using the AI SDK for LLM calls in tasks or scorers, wrap models for automatic tracing:

```ts
import { openai } from "@ai-sdk/openai";
import { wrapAISDKModel } from "evalite/ai-sdk";
import { generateObject } from "ai";

const model = wrapAISDKModel(openai("gpt-4o-mini"));

evalite("LLM Expansion", {
  data: [{ input: "termination clause" }],
  task: async (input) => {
    const result = await generateObject({
      model,
      schema: expansionSchema,
      prompt: `Expand this search query: ${input}`,
    });
    return result.object;
  },
  // ...
});
```

Benefits:
- Automatic trace capture (prompts, responses, tokens)
- Automatic caching of identical requests
- Zero overhead in production (no-op outside Evalite)

## Storage

### Development (In-Memory)

Default behavior when no storage configured:
- Fast iteration
- Data lost on process exit
- Good for quick experiments

### Persistent (SQLite)

Configure for tracking scores over time:

```ts
export default defineConfig({
  storage: () => createSqliteStorage("./evalite.db"),
});
```

SQLite file is gitignored; each developer has local history.

### CI (JSON Export)

Export results for artifact storage:

```bash
evalite --outputPath=./eval-results.json
```

JSON contains:
- Run metadata
- All eval results with scores
- Traces for debugging

## Acceptance Criteria

### EPIC 11 Complete When:

1. **T11.1 Corpus**: `test/eval/fixtures/` contains:
   - At least 20 queries with relevance judgments
   - At least 2 docs each in DE, EN, FR, IT
   - At least 3 cross-language query-doc pairs

2. **T11.2 Harness**: All eval files pass:
   - `vsearch.eval.ts` with Recall@5, Recall@10, nDCG@10
   - `query.eval.ts` with ranking + latency metrics
   - `expansion.eval.ts` with schema validity
   - `multilingual.eval.ts` with cross-language recall

3. **T11.3 CI Gating**:
   - GitHub Actions workflow runs on PRs
   - Threshold starts at 70%, configurable
   - Static UI exported as artifact
   - Results JSON available for analysis
