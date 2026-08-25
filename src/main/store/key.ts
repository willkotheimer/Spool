import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * The database key (PLAN.md 6, 12).
 *
 * Generated on first run, and never written anywhere in plaintext: it is sealed with the operating
 * system's own facility — DPAPI on Windows, the Keychain on macOS — through Electron's
 * `safeStorage`, and only the sealed bytes reach disk. **Not `keytar`**, which is archived.
 *
 * The sealing facility is injected rather than imported so this module never touches Electron,
 * which is what lets every path below be tested — including the ones that matter most, where
 * sealing is unavailable or the sealed key can no longer be opened.
 */

/** The part of Electron's `safeStorage` this needs. */
export interface Sealer {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(sealed: Buffer): string
}

export type KeyResult =
  | { readonly ok: true; readonly key: string; readonly created: boolean }
  /**
   * The OS offers no sealing. Storing the key in plaintext instead would quietly break the promise
   * the privacy panel makes, so the app says so and stores nothing (PLAN.md 11, M6).
   */
  | { readonly ok: false; readonly reason: 'encryption_unavailable'; readonly detail: string }
  /** The sealed key cannot be opened — a different machine, a different user, a corrupt file. */
  | { readonly ok: false; readonly reason: 'key_unreadable'; readonly detail: string }

/** 256 bits, hex-encoded, which is what SQLCipher wants as a raw key. */
function generateKey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Load the sealed key, or make one on first run.
 *
 * Never falls back to an unsealed key: a store the user believes is encrypted, and is not, is worse
 * than no store at all.
 */
export function loadOrCreateKey(keyPath: string, sealer: Sealer): KeyResult {
  if (!sealer.isEncryptionAvailable()) {
    return {
      ok: false,
      reason: 'encryption_unavailable',
      detail:
        'This system offers no way to seal the database key, so Spool will not store anything. ' +
        'Nothing is written in plaintext instead.'
    }
  }

  if (existsSync(keyPath)) {
    try {
      const key = sealer.decryptString(readFileSync(keyPath))
      if (key.length === 0) throw new Error('the sealed key was empty')
      return { ok: true, key, created: false }
    } catch (error) {
      return {
        ok: false,
        reason: 'key_unreadable',
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }

  const key = generateKey()
  mkdirSync(dirname(keyPath), { recursive: true })
  writeFileSync(keyPath, sealer.encryptString(key))
  return { ok: true, key, created: true }
}

/**
 * Throw away the sealed key and the file it unlocked, and start again.
 *
 * The only honest response to a key that cannot be opened: without it the existing database is
 * unreadable by anyone, this app included, so the choice is a fresh store or none. Destructive by
 * definition, which is why it happens only when the user asks for it (invariant 7).
 *
 * **Nothing here reads anything.** No open, no parse, no query — the files are removed blind, and
 * so are SQLite's sidecar files, which would otherwise survive to confuse the next launch. A reset
 * that needs a working database in order to clear a broken one is not a failsafe, and this is the
 * one command that has to work when everything else has failed (PLAN.md 11, M9).
 */
export function discardStore(
  keyPath: string,
  databasePath: string,
  extraPaths: readonly string[] = []
): { readonly removed: string[]; readonly failed: Array<{ path: string; reason: string }> } {
  const targets = [
    keyPath,
    databasePath,
    // Write-ahead log and shared-memory files, which WAL mode leaves beside the database.
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
    ...extraPaths
  ]

  const removed: string[] = []
  const failed: Array<{ path: string; reason: string }> = []

  for (const target of targets) {
    const wasThere = existsSync(target)
    try {
      rmSync(target, { force: true, recursive: false })
      if (wasThere) removed.push(target)
    } catch (error) {
      // Keep going — one file refusing to go must not leave the rest behind — but **report it**.
      // On Windows a file with an open handle cannot be deleted, and a failsafe that quietly
      // leaves the data in place is worse than one that fails loudly.
      failed.push({ path: target, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  return { removed, failed }
}
