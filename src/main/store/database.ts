import Database from 'better-sqlite3-multiple-ciphers'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { CURRENT_SCHEMA_VERSION, pendingMigrations } from './migrations'

/**
 * Opening the encrypted store (PLAN.md 6, 7).
 *
 * SQLCipher through `better-sqlite3-multiple-ciphers` — plain `better-sqlite3` has no cipher
 * support. The key is applied before any other statement runs, because a wrong or missing key does
 * not fail on open, it fails on the first read.
 */

export type SpoolDatabase = Database.Database

export type OpenResult =
  | { readonly ok: true; readonly database: SpoolDatabase; readonly migrated: number[] }
  /** The key did not open this file — usually a key from a different install (PLAN.md 11, M6). */
  | { readonly ok: false; readonly reason: 'wrong_key'; readonly detail: string }
  | { readonly ok: false; readonly reason: 'unreadable'; readonly detail: string }

export function openDatabase(databasePath: string, key: string): OpenResult {
  mkdirSync(dirname(databasePath), { recursive: true })

  let database: SpoolDatabase
  try {
    database = new Database(databasePath)
  } catch (error) {
    return { ok: false, reason: 'unreadable', detail: describe(error) }
  }

  try {
    // A raw hex key, so SQLCipher uses these bytes rather than deriving from a passphrase.
    database.pragma(`key="x'${key}'"`)
    // Fails here rather than later if the key is wrong: this is the first read of the header.
    database.prepare('SELECT count(*) FROM sqlite_schema').get()
  } catch (error) {
    database.close()
    return { ok: false, reason: 'wrong_key', detail: describe(error) }
  }

  try {
    database.pragma('journal_mode = WAL')
    database.pragma('foreign_keys = ON')
    const migrated = migrate(database)
    return { ok: true, database, migrated }
  } catch (error) {
    database.close()
    return { ok: false, reason: 'unreadable', detail: describe(error) }
  }
}

/** The version this file is at. Read from `meta`, never inferred from table shape (PLAN.md 12). */
export function schemaVersion(database: SpoolDatabase): number {
  const hasMeta = database
    .prepare("SELECT count(*) AS n FROM sqlite_schema WHERE type = 'table' AND name = 'meta'")
    .get() as { n: number }

  if (hasMeta.n === 0) return 0

  const row = database.prepare('SELECT schema_version FROM meta WHERE id = 1').get() as
    | { schema_version: number }
    | undefined

  return row?.schema_version ?? 0
}

/**
 * Bring a file up to the current version, in one transaction per migration. Returns the versions
 * applied — empty on an already-current file, which is the no-op case M6 asks for a test of.
 */
export function migrate(database: SpoolDatabase): number[] {
  const from = schemaVersion(database)
  const applied: number[] = []

  for (const migration of pendingMigrations(from)) {
    database.transaction(() => {
      migration.up(database)
      database
        .prepare(
          `INSERT INTO meta (id, schema_version, created_at) VALUES (1, ?, ?)
           ON CONFLICT (id) DO UPDATE SET schema_version = excluded.schema_version`
        )
        .run(migration.version, new Date().toISOString())
    })()
    applied.push(migration.version)
  }

  if (applied.length === 0 && from !== CURRENT_SCHEMA_VERSION && from !== 0) {
    // A file from the future: a newer Spool wrote it. Downgrading it would lose whatever the newer
    // version added, so refuse rather than guess.
    throw new Error(
      `This data file is at schema version ${from}, which is newer than this version of Spool understands (${CURRENT_SCHEMA_VERSION}).`
    )
  }

  return applied
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
