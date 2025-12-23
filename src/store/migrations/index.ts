/**
 * Migration registry.
 * Exports all migrations in order.
 *
 * @module src/store/migrations
 */

export type { Migration } from './runner';
export {
  getDbFtsTokenizer,
  getSchemaVersion,
  needsFtsRebuild,
  runMigrations,
} from './runner';

// Import all migrations
import { migration as m001 } from './001-initial';

/** All migrations in order */
export const migrations = [m001];
