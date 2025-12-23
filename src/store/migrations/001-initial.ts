/**
 * Initial schema migration.
 * Creates all core tables for GNO.
 *
 * @module src/store/migrations/001_initial
 */

import type { Database } from 'bun:sqlite';
import type { FtsTokenizer } from '../../config/types';
import type { Migration } from './runner';

export const migration: Migration = {
  version: 1,
  name: 'initial_schema',

  up(db: Database, ftsTokenizer: FtsTokenizer): void {
    // Collections (synced from YAML config)
    db.exec(`
      CREATE TABLE IF NOT EXISTS collections (
        name TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        pattern TEXT NOT NULL DEFAULT '**/*',
        include TEXT,
        exclude TEXT,
        update_cmd TEXT,
        language_hint TEXT,
        synced_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Contexts (synced from YAML config)
    db.exec(`
      CREATE TABLE IF NOT EXISTS contexts (
        scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'collection', 'prefix')),
        scope_key TEXT NOT NULL,
        text TEXT NOT NULL,
        synced_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (scope_type, scope_key)
      )
    `);

    // Documents (source file identity)
    db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT NOT NULL,
        rel_path TEXT NOT NULL,

        source_hash TEXT NOT NULL,
        source_mime TEXT NOT NULL,
        source_ext TEXT NOT NULL,
        source_size INTEGER NOT NULL,
        source_mtime TEXT NOT NULL,

        docid TEXT NOT NULL,
        uri TEXT NOT NULL,

        title TEXT,
        mirror_hash TEXT,
        converter_id TEXT,
        converter_version TEXT,
        language_hint TEXT,

        active INTEGER NOT NULL DEFAULT 1,

        last_error_code TEXT,
        last_error_message TEXT,
        last_error_at TEXT,

        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),

        UNIQUE (collection, rel_path),
        FOREIGN KEY (collection) REFERENCES collections(name) ON DELETE CASCADE
        -- Note: mirror_hash is NOT an FK - documents are tracked before content exists
        -- Cleanup via cleanupOrphans() handles orphaned content
      )
    `);

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection)'
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_documents_active ON documents(active)'
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_documents_mirror_hash ON documents(mirror_hash)'
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_documents_docid ON documents(docid)'
    );
    db.exec('CREATE INDEX IF NOT EXISTS idx_documents_uri ON documents(uri)');

    // Content (content-addressed markdown mirrors)
    db.exec(`
      CREATE TABLE IF NOT EXISTS content (
        mirror_hash TEXT PRIMARY KEY,
        markdown TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Content chunks (for FTS and vectors)
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_chunks (
        mirror_hash TEXT NOT NULL,
        seq INTEGER NOT NULL,
        pos INTEGER NOT NULL,
        text TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        language TEXT,
        token_count INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (mirror_hash, seq),
        FOREIGN KEY (mirror_hash) REFERENCES content(mirror_hash) ON DELETE CASCADE
      )
    `);

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_chunks_mirror_hash ON content_chunks(mirror_hash)'
    );

    // FTS5 virtual table with configurable tokenizer
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        text,
        tokenize='${ftsTokenizer}'
      )
    `);

    // Content vectors (EPIC 7)
    db.exec(`
      CREATE TABLE IF NOT EXISTS content_vectors (
        mirror_hash TEXT NOT NULL,
        seq INTEGER NOT NULL,
        model TEXT NOT NULL,
        embedding BLOB NOT NULL,
        embedded_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (mirror_hash, seq, model),
        FOREIGN KEY (mirror_hash, seq) REFERENCES content_chunks(mirror_hash, seq) ON DELETE CASCADE
      )
    `);

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_vectors_model ON content_vectors(model)'
    );

    // LLM cache (EPIC 6+)
    db.exec(`
      CREATE TABLE IF NOT EXISTS llm_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT
      )
    `);

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_llm_cache_expires ON llm_cache(expires_at)'
    );

    // Ingest errors
    db.exec(`
      CREATE TABLE IF NOT EXISTS ingest_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        details_json TEXT
      )
    `);

    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_ingest_errors_occurred ON ingest_errors(occurred_at DESC)'
    );
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_ingest_errors_collection ON ingest_errors(collection, rel_path)'
    );
  },

  down(db: Database): void {
    // Drop in reverse order of creation
    db.exec('DROP TABLE IF EXISTS ingest_errors');
    db.exec('DROP TABLE IF EXISTS llm_cache');
    db.exec('DROP TABLE IF EXISTS content_vectors');
    db.exec('DROP TABLE IF EXISTS content_fts');
    db.exec('DROP TABLE IF EXISTS content_chunks');
    db.exec('DROP TABLE IF EXISTS content');
    db.exec('DROP TABLE IF EXISTS documents');
    db.exec('DROP TABLE IF EXISTS contexts');
    db.exec('DROP TABLE IF EXISTS collections');
  },
};
