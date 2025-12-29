/**
 * gno models path command implementation.
 * Print model cache directory.
 *
 * @module src/cli/commands/models/path
 */

import { getModelsCachePath } from '../../../app/constants';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelsPathOptions {
  /** Output as JSON */
  json?: boolean;
}

export interface ModelsPathResult {
  path: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute gno models path command.
 */
export function modelsPath(): ModelsPathResult {
  return {
    path: getModelsCachePath(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format models path result for output.
 */
export function formatModelsPath(
  result: ModelsPathResult,
  options: ModelsPathOptions
): string {
  if (options.json) {
    return JSON.stringify(result, null, 2);
  }
  return result.path;
}
