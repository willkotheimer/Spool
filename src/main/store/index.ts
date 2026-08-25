import { join } from 'node:path'
import type { Spool } from '../core/types'
import type { SourceAction, SourceRules } from '../detect/consent'
import { openDatabase, type SpoolDatabase } from './database'
import { discardStore, loadOrCreateKey, type Sealer } from './key'
import {
  deleteSpool,
  loadSourceRules,
  loadSpools,
  saveSourceRules,
  saveSpool
} from './repository'

/**
 * The store, assembled (PLAN.md 6, 7): a key sealed by the operating system, an encrypted SQLite
 * file, and the migrations that keep it readable across versions.
 *
 * Everything Electron-specific is passed in — the user-data directory and the sealer — so the whole
 * thing can be opened against a temporary directory in a test.
 */

export interface StorePaths {
  readonly database: string
  readonly key: string
}

export function storePaths(userDataDirectory: string): StorePaths {
  return {
    database: join(userDataDirectory, 'spool.db'),
    key: join(userDataDirectory, 'spool.key')
  }
}

/** What the session writes through. Narrow on purpose. */
export interface Store {
  readonly path: string
  saveSpool(spool: Spool): void
  deleteSpool(spoolId: string): void
  saveSourceRules(rules: SourceRules): void
  loadSpools(): Spool[]
  loadSourceRules(): Map<string, SourceAction>
  close(): void
}

export type StoreResult =
  | { readonly ok: true; readonly store: Store }
  | {
      readonly ok: false
      /**
       * `key_unreadable` and `wrong_key` are the recoverable ones: the existing file cannot be
       * opened by anyone, this app included, so the only honest offer is a fresh start — which is
       * destructive, and therefore the user's to choose (PLAN.md 11, M6).
       */
      readonly reason: 'encryption_unavailable' | 'key_unreadable' | 'wrong_key' | 'unreadable'
      readonly detail: string
      readonly canStartFresh: boolean
    }

export function openStore(paths: StorePaths, sealer: Sealer, now = (): string => new Date().toISOString()): StoreResult {
  const key = loadOrCreateKey(paths.key, sealer)
  if (!key.ok) {
    return {
      ok: false,
      reason: key.reason,
      detail: key.detail,
      canStartFresh: key.reason === 'key_unreadable'
    }
  }

  const opened = openDatabase(paths.database, key.key)
  if (!opened.ok) {
    return {
      ok: false,
      reason: opened.reason,
      detail: opened.detail,
      canStartFresh: opened.reason === 'wrong_key'
    }
  }

  return { ok: true, store: wrap(opened.database, paths.database, now) }
}

function wrap(database: SpoolDatabase, path: string, now: () => string): Store {
  return {
    path,
    saveSpool: (spool) => saveSpool(database, spool, now()),
    deleteSpool: (spoolId) => deleteSpool(database, spoolId),
    saveSourceRules: (rules) => saveSourceRules(database, rules, now()),
    loadSpools: () => loadSpools(database),
    loadSourceRules: () => loadSourceRules(database),
    close: () => database.close()
  }
}

/** Throw the unreadable store away and start again. Only ever on an explicit yes. */
export function startFresh(paths: StorePaths, sealer: Sealer): StoreResult {
  discardStore(paths.key, paths.database)
  return openStore(paths, sealer)
}

/**
 * Why nothing is being stored, in words meant for the person reading them rather than the code
 * that produced them. "key_unreadable" is a reason; it is not an explanation (PLAN.md 11, M6).
 */
export function explainStorageFailure(
  failure: Extract<StoreResult, { ok: false }>
): { reason: string; canStartFresh: boolean } {
  const reason = (() => {
    switch (failure.reason) {
      case 'encryption_unavailable':
        return (
          'this system offers no way to seal the database key, and Spool will not fall back to ' +
          'storing it in plaintext'
        )
      case 'key_unreadable':
        return (
          'the sealed key could not be opened, which usually means it was created by a different ' +
          'user account or on another machine. Without it, the existing clips cannot be read by ' +
          'anyone, Spool included'
        )
      case 'wrong_key':
        return 'the key does not open the existing data file, so its contents cannot be read'
      case 'unreadable':
        return `the data file could not be opened: ${failure.detail}`
    }
  })()

  return { reason, canStartFresh: failure.canStartFresh }
}

export { discardStore, type Sealer } from './key'
