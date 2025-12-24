# GNO - Gno Knows

Local knowledge indexing and semantic search CLI with MCP (Model Context Protocol) integration.

## Features

- **Hybrid Search**: BM25 full-text + vector similarity search
- **Multi-Format**: Index Markdown, PDF, DOCX, and more
- **Collections**: Organize documents by source directory
- **Contexts**: Add semantic hints to improve search relevance
- **Multilingual**: BCP-47 language hints and configurable FTS tokenizers
- **MCP Integration**: Use as an MCP server for AI assistant access

## Installation

```bash
bun install
```

## Quick Start

```bash
# Initialize GNO
bun run src/cli/main.ts init

# Add a collection
bun run src/cli/main.ts init ~/notes --name notes --pattern "**/*.md"

# With language hint for German docs
bun run src/cli/main.ts init ~/docs --name german --language de
```

## Development

```bash
# Run tests
bun test

# Lint and format
bun run lint

# Type check
bun run typecheck
```

## Project Status

Core CLI and indexing infrastructure complete. See `spec/cli.md` for the full interface specification.

### Completed

- **EPIC 2**: Config schema, collection/context management, init command
- **EPIC 3**: CLI binary with Commander.js, doctor command
- **EPIC 4**: SQLite schema, migrations, store adapters
- **EPIC 5**: File discovery, content extraction (md/txt/pdf/docx), FTS indexing
- **EPIC 6**: LLM subsystem with node-llama-cpp (embedding, rerank, generation)
- **EPIC 7**: Vector embeddings with sqlite-vec, `gno embed` command

### Upcoming

- EPIC 8: Search pipelines (BM25, vector, hybrid)
- EPIC 9: Output formatters and `gno get`
- EPIC 10: MCP server integration

## Documentation

- [CLI Specification](spec/cli.md)
- [MCP Specification](spec/mcp.md)
- [Output Schemas](spec/output-schemas/)

## License

MIT
