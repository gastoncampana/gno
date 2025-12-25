# Plan: CLI Guidelines Compliance Audit & Improvements

**Reference:** [Command Line Interface Guidelines](https://clig.dev) - comprehensive best practices for CLI design.

## Current State Assessment

GNO CLI is already well-designed and follows many best practices:

### Already Implemented ✅
- Commander.js for argument parsing
- Exit codes (0=success, 1=validation, 2=runtime)
- Output to stdout, errors/progress to stderr
- `-h`/`--help` flags
- `NO_COLOR` env var support (no-color.org compliant)
- Multiple output formats (`--json`, `--files`, `--csv`, `--md`, `--xml`)
- XDG Base Directory spec compliance
- Progress indicators for model downloads
- `--yes` flag for non-interactive scripting
- `CliError` class with structured error handling
- Format support matrix validated per-command
- Terminal output sanitization (ANSI injection prevention)
- Lazy imports for fast `--help`
- Color via picocolors with global enable/disable

---

## Gaps to Address (Prioritized)

### P0: Critical / Easy Wins

#### 1. Concise help when run with no args
**Guideline:** "Display concise help text by default when command requires args and is run with none"

Currently `gno` with no args shows full Commander help. Should show:
- Brief description
- 1-2 example invocations
- Pointer to `gno --help` for full listing

**Files:** `src/cli/program.ts`

#### 2. Add `--quiet` / `-q` flag
**Guideline:** "Provide a -q option to suppress all non-essential output"

Missing global quiet flag. Currently only have `--verbose`.

**Files:** `src/cli/program.ts`, `src/cli/context.ts`

#### 3. Fix inconsistent console.log/error usage
**Guideline:** "Send output to stdout, messaging to stderr"

Some commands use `console.log()`/`console.error()` instead of `process.stdout.write()`/`process.stderr.write()`. Inconsistent with rest of codebase.

**Files:** `src/cli/commands/context/list.ts`, others to audit

---

### P1: High Value

#### 4. Suggest corrections for typos
**Guideline:** "If the user did something wrong and you can guess what they meant, suggest it"

Commander has built-in `suggestAfterError()` - just needs enabling.

**Files:** `src/cli/program.ts`

#### 5. Add "next steps" suggestions
**Guideline:** "Suggest commands the user should run"

After key commands, suggest what to do next:
- After `init` → "Run `gno index` to build your index"
- After `index` → "Run `gno ask <query>` to search"
- After errors → Suggest fixes

**Files:** Various command files

#### 6. Add `--dry-run` where applicable
**Guideline:** "Use standard names for flags"

Commands that modify state should support `--dry-run`:
- `cleanup` - show what would be deleted
- `reset` - show what would be destroyed
- `update` - show what would change

**Files:** `src/cli/commands/cleanup.ts`, `src/cli/commands/reset.ts`, etc.

---

### P2: Nice to Have

#### 7. Better progress indicators
**Guideline:** "Show progress if something takes a long time"

Current: Simple `\r` overwrite for model downloads
Improve:
- Spinner for short operations (< 5s expected)
- Better formatting for indexing progress
- Time estimates where feasible

**Files:** Create `src/cli/progress.ts`, update command files

#### 8. Graceful Ctrl-C handling with messaging
**Guideline:** "If a user hits Ctrl-C, exit as soon as possible. Say something immediately."

Current: Silent exit with code 130
Should: Print "Interrupted" to stderr, then clean up

**Files:** `src/index.ts`, `src/cli/run.ts`

#### 9. Add support path / web docs link in help
**Guideline:** "Provide a support path for feedback and issues"

Add GitHub link and docs URL to top-level help.

**Files:** `src/cli/program.ts`, `src/app/constants.ts`

#### 10. Terminal width awareness
**Guideline:** "Increase information density"

Use terminal width for:
- Truncating long paths
- Table formatting
- Help text wrapping

**Files:** Create `src/cli/terminal.ts`

---

### P3: Future / Low Priority

#### 11. Pager for long output
**Guideline:** "Use a pager if you are outputting a lot of text"

For commands like `ls` with many results, pipe through pager when TTY.

#### 12. Man pages
**Guideline:** "Consider providing man pages"

Generate from spec/cli.md using tool like ronn.

#### 13. Tab completion
Not in guidelines but mentioned. Commander supports generating completion scripts.

---

## Implementation Plan

### Phase 1: Quick Wins (P0)

#### 1.1 Concise help when `gno` run with no args
```ts
// src/cli/program.ts - add before command definitions
program.action(() => {
  const { CLI_NAME, VERSION, PRODUCT_NAME } = constants;
  console.log(`${PRODUCT_NAME} v${VERSION} - Local Knowledge Index and Retrieval

Usage: ${CLI_NAME} <command> [options]

Quick start:
  ${CLI_NAME} init ~/docs --name docs    # Initialize with a collection
  ${CLI_NAME} index                       # Build the index
  ${CLI_NAME} ask "your question"         # Search your knowledge

Run '${CLI_NAME} --help' for full command list.`);
});
```

#### 1.2 Add `--quiet`/`-q` global flag
- Add to `GlobalOptions` type in `src/cli/context.ts`
- Wire up in `src/cli/program.ts` global options
- Pass through to commands that output progress

#### 1.3 Fix console.log/error usage
Audit and replace:
- `console.log()` → `process.stdout.write(msg + '\n')`
- `console.error()` → `process.stderr.write(msg + '\n')`

### Phase 2: Core Improvements (P1)

#### 2.1 Enable Commander suggestions
```ts
// src/cli/program.ts
program.showSuggestionAfterError(true);
```

#### 2.2 Add "next steps" suggestions
Create helper in `src/cli/hints.ts`:
```ts
export const hints = {
  afterInit: () => `Next: Run 'gno index' to build your search index`,
  afterIndex: () => `Next: Run 'gno ask "your query"' to search`,
  afterCollectionAdd: () => `Next: Run 'gno index' to index this collection`,
  // etc.
};
```

#### 2.3 Add `--dry-run` to destructive commands
- `cleanup --dry-run`: Show orphaned data counts without deleting
- `reset --dry-run`: Show what DBs/files would be deleted
- `update --dry-run`: Show file changes without writing to DB

### Phase 3: Polish (P2)

#### 3.1 Progress utilities
Create `src/cli/progress.ts`:
```ts
import { isatty } from 'node:tty';

export function createSpinner(message: string) {
  if (!isatty(process.stderr.fd)) return { stop: () => {} };

  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const id = setInterval(() => {
    process.stderr.write(`\r${frames[i++ % frames.length]} ${message}`);
  }, 80);

  return {
    stop: (finalMsg?: string) => {
      clearInterval(id);
      process.stderr.write(`\r${finalMsg ?? message}\n`);
    }
  };
}
```

#### 3.2 Better Ctrl-C handling
```ts
// src/index.ts
process.on('SIGINT', () => {
  process.stderr.write('\nInterrupted\n');
  process.exit(130);
});
```

#### 3.3 Add support/docs links
```ts
// src/app/constants.ts
export const DOCS_URL = 'https://github.com/xxx/gno#readme';
export const ISSUES_URL = 'https://github.com/xxx/gno/issues';

// src/cli/program.ts - in help text
program.addHelpText('after', `
Documentation: ${DOCS_URL}
Report issues: ${ISSUES_URL}`);
```

#### 3.4 Terminal width utilities
Create `src/cli/terminal.ts`:
```ts
export function getTerminalWidth(): number {
  return process.stdout.columns ?? 80;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
```

---

## Files to Modify

### New Files
| File | Purpose |
|------|---------|
| `src/cli/progress.ts` | Spinner + progress bar utilities |
| `src/cli/terminal.ts` | Terminal width detection + truncation |
| `src/cli/hints.ts` | "Next steps" suggestion helpers |

### Modified Files
| File | Changes |
|------|---------|
| `src/app/constants.ts` | Add DOCS_URL, ISSUES_URL constants |
| `src/cli/program.ts` | Concise help, --quiet flag, suggestAfterError, docs link |
| `src/cli/context.ts` | Add `quiet` to GlobalOptions type |
| `src/cli/run.ts` | Respect quiet flag, improve error output |
| `src/index.ts` | Better SIGINT handling with message |
| `src/cli/commands/init.ts` | Add next steps hint after success |
| `src/cli/commands/index.ts` | Add next steps hint, use spinner |
| `src/cli/commands/collection/add.ts` | Add next steps hint |
| `src/cli/commands/cleanup.ts` | Add --dry-run option |
| `src/cli/commands/reset.ts` | Add --dry-run option |
| `src/cli/commands/update.ts` | Add --dry-run option |
| `src/cli/commands/context/list.ts` | Fix console.log → process.stdout |

---

## Task Execution Order

```
1. Create src/cli/terminal.ts (no deps)
2. Create src/cli/progress.ts (no deps)
3. Create src/cli/hints.ts (no deps)
4. Update src/app/constants.ts (add URLs)
5. Update src/cli/context.ts (add quiet to GlobalOptions)
6. Update src/cli/program.ts (concise help, --quiet, suggestions, docs)
7. Update src/index.ts (SIGINT handling)
8. Update src/cli/run.ts (respect quiet flag)
9. Fix console.log in context/list.ts and audit others
10. Add --dry-run to cleanup.ts
11. Add --dry-run to reset.ts
12. Add --dry-run to update.ts
13. Add hints to init.ts
14. Add hints to index.ts (commands/index/index.ts)
15. Add hints to collection/add.ts
16. Add spinners where useful (embed, search commands)
17. Run tests, fix any issues
```

---

## Non-Breaking Guarantees

All changes are additive or behavioral improvements:
- New flags are optional with sensible defaults
- Existing output formats unchanged
- Exit codes unchanged
- JSON schemas unchanged
- Commander.js stays as framework
- Tests continue to pass
