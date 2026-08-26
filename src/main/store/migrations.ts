/**
 * Schema versions and the runner that applies them (PLAN.md 7).
 *
 * **`schema_version` is read from `meta`, never inferred from table shape** (PLAN.md 12). A runner
 * that guesses the version from which columns exist will eventually guess wrong on a file that was
 * half-migrated, and the whole point of versioning is to survive exactly that.
 *
 * The schema evolves on purpose across three versions — v1 here, `last_used_at` at M10, and
 * `is_starred` at M11 — so the upgrade test at M13 walks a real path rather than comparing
 * identical schemas.
 */

/** A statement runner, so this module needs no database type and stays testable. */
export interface MigrationTarget {
  exec(sql: string): void
}

export interface Migration {
  readonly version: number
  readonly up: (database: MigrationTarget) => void
}

const V1 = `
CREATE TABLE meta (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version INTEGER NOT NULL,
  created_at     TEXT    NOT NULL
);

CREATE TABLE spools (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('fifo', 'lifo')),
  cursor_clip_id TEXT,
  is_default     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE clips (
  id          TEXT    PRIMARY KEY,
  spool_id    TEXT    NOT NULL REFERENCES spools(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  content     TEXT    NOT NULL,
  preview     TEXT    NOT NULL,
  byte_len    INTEGER NOT NULL,
  source_app  TEXT,
  was_flagged INTEGER NOT NULL DEFAULT 0,
  captured_at TEXT    NOT NULL
);

CREATE INDEX clips_by_spool ON clips (spool_id, position);

CREATE TABLE source_rules (
  source_app TEXT PRIMARY KEY,
  action     TEXT NOT NULL CHECK (action IN ('always_keep', 'always_skip')),
  created_at TEXT NOT NULL
);
`

/**
 * `position` deliberately carries no database constraint. Density and uniqueness are maintained by
 * `core/` and asserted by the M2 property test — a `UNIQUE (spool_id, position)` constraint would
 * collide with itself mid-reorder and buy nothing the property test does not already prove
 * (PLAN.md 7).
 */
/**
 * Retention is per-spool, so it belongs on the spool rather than in the preferences file: it is
 * data about a spool, it has to travel with it, and a spool that is deleted must take its limit
 * with it. That makes it a schema change — the first one after v1, which pushes `last_used_at` to
 * v3 at M10 and `is_starred` to v4 at M11. Recorded in PLAN.md 7; the upgrade test at M13 walks
 * whatever the real path turns out to be rather than a path decided in advance.
 */
const V2 = `ALTER TABLE spools ADD COLUMN retention_hours INTEGER;`

/**
 * When a spool was last served from, made active, or edited — what the capacity advisor ranks by
 * (PLAN.md 9). Null for spools that predate the column, which sorts them oldest: a spool with no
 * recorded use is the least likely to be missed.
 */
const V3 = `ALTER TABLE spools ADD COLUMN last_used_at TEXT;`

/**
 * A star marks a spool the user means to keep (PLAN.md 10). Default zero, so every spool that
 * predates the column arrives unstarred — the safe answer, since a star is a promise the app then
 * has to honour.
 */
const V4 = `ALTER TABLE spools ADD COLUMN is_starred INTEGER NOT NULL DEFAULT 0;`

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (database) => database.exec(V1)
  },
  {
    version: 2,
    up: (database) => database.exec(V2)
  },
  {
    version: 3,
    up: (database) => database.exec(V3)
  },
  {
    version: 4,
    up: (database) => database.exec(V4)
  }
]

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

/** Which migrations a file at `from` still needs. Empty when it is already current. */
export function pendingMigrations(from: number): readonly Migration[] {
  return MIGRATIONS.filter((migration) => migration.version > from)
}
