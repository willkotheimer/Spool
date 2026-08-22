import Database from 'better-sqlite3-multiple-ciphers'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClip } from '../core/clip'
import { createSpool } from '../core/spool'
import { migrate, openDatabase, schemaVersion } from './database'
import { discardStore, loadOrCreateKey, type Sealer } from './key'
import { CURRENT_SCHEMA_VERSION, pendingMigrations } from './migrations'
import { loadSourceRules, loadSpools, saveSourceRules, saveSpool } from './repository'
import { explainStorageFailure } from './index'

let directory: string
const paths = () => ({
  database: join(directory, 'spool.db'),
  key: join(directory, 'spool.key')
})

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'spool-store-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

/** Stands in for Electron's safeStorage, which cannot run outside the app (PLAN.md 6). */
function fakeSealer(available = true): Sealer {
  return {
    isEncryptionAvailable: () => available,
    // The real one seals with DPAPI or the Keychain; reversing the bytes is enough to prove the
    // plaintext never reaches disk unchanged.
    encryptString: (plain) => Buffer.from(plain).reverse(),
    decryptString: (sealed) => Buffer.from(sealed).reverse().toString()
  }
}

const NOW = '2026-08-22T17:00:00.000Z'

const clip = (id: string, content = `content of ${id}`) =>
  createClip({ id, content, capturedAt: NOW })

describe('the database key (PLAN.md 6)', () => {
  it('generates one on first run and reads it back on the next', () => {
    const first = loadOrCreateKey(paths().key, fakeSealer())
    const second = loadOrCreateKey(paths().key, fakeSealer())
    if (!first.ok || !second.ok) throw new Error('the key should have loaded')

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.key).toBe(first.key)
  })

  it('is 256 bits of hex, which is what SQLCipher wants raw', () => {
    const result = loadOrCreateKey(paths().key, fakeSealer())

    expect(result.ok && result.key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never writes the key to disk in plaintext', () => {
    const result = loadOrCreateKey(paths().key, fakeSealer())
    const onDisk = readFileSync(paths().key).toString()

    expect(result.ok && onDisk).not.toContain(result.ok ? result.key : '')
  })

  it('refuses to store anything when the system cannot seal a key', () => {
    const result = loadOrCreateKey(paths().key, fakeSealer(false))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('encryption_unavailable')
    // And nothing was written instead.
    expect(existsSync(paths().key)).toBe(false)
  })

  it('reports a sealed key it cannot open, rather than throwing', () => {
    writeFileSync(paths().key, Buffer.from('not a sealed key'))
    const angry: Sealer = {
      ...fakeSealer(),
      decryptString: () => {
        throw new Error('decryption failed')
      }
    }

    const result = loadOrCreateKey(paths().key, angry)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('key_unreadable')
    expect(result.ok === false && result.detail).toContain('decryption failed')
  })

  it('starting fresh removes both the key and the file it unlocked', () => {
    const { key, database } = paths()
    loadOrCreateKey(key, fakeSealer())
    writeFileSync(database, 'anything')

    discardStore(key, database)

    expect(existsSync(key)).toBe(false)
    expect(existsSync(database)).toBe(false)
  })
})

describe('the encrypted file (PLAN.md 11, M6)', () => {
  it('is not readable without the key', () => {
    const { database, key } = paths()
    const secret = 'a-very-recognisable-clip'
    const loaded = loadOrCreateKey(key, fakeSealer())
    if (!loaded.ok) throw new Error(loaded.detail)
    const result = openDatabase(database, loaded.key)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    saveSpool(
      result.database,
      { ...createSpool({ id: 's', name: 'Default', kind: 'default' }), clips: [clip('c1', secret)] },
      NOW
    )
    result.database.close()

    // The bytes on disk carry neither the clip nor SQLite's own header.
    const raw = readFileSync(database)
    expect(raw.includes(Buffer.from(secret))).toBe(false)
    expect(raw.subarray(0, 15).toString()).not.toBe('SQLite format 3')

    // And plain sqlite3 — the same library with no key — cannot read it.
    const unkeyed = new Database(database)
    expect(() => unkeyed.prepare('SELECT count(*) FROM clips').get()).toThrow()
    unkeyed.close()
  })

  it('reports a wrong key instead of failing later', () => {
    const { database } = paths()
    const opened = openDatabase(database, 'a'.repeat(64))
    expect(opened.ok).toBe(true)
    if (opened.ok) opened.database.close()

    const wrong = openDatabase(database, 'b'.repeat(64))

    expect(wrong.ok).toBe(false)
    expect(wrong.ok === false && wrong.reason).toBe('wrong_key')
  })
})

describe('migrations (PLAN.md 7)', () => {
  const open = () => {
    const result = openDatabase(paths().database, 'c'.repeat(64))
    if (!result.ok) throw new Error(result.detail)
    return result
  }

  it('creates the schema at version 1 on a new file', () => {
    const { database, migrated } = open()

    expect(migrated).toEqual([1])
    expect(schemaVersion(database)).toBe(CURRENT_SCHEMA_VERSION)
    database.close()
  })

  it('is a no-op on an already-current file', () => {
    const first = open()
    first.database.close()

    const second = open()
    expect(second.migrated).toEqual([])

    // Reopening again applies nothing either, and the runner reports it.
    expect(migrate(second.database)).toEqual([])
    expect(schemaVersion(second.database)).toBe(CURRENT_SCHEMA_VERSION)
    second.database.close()
  })

  it('reads the version from meta rather than inferring it from tables', () => {
    const { database } = open()

    // Tables intact, meta lowered: the runner must believe meta (PLAN.md 12).
    database.prepare('UPDATE meta SET schema_version = 0').run()
    expect(schemaVersion(database)).toBe(0)
    database.close()
  })

  it('refuses a file written by a newer version rather than guessing', () => {
    const { database } = open()
    database.prepare('UPDATE meta SET schema_version = ?').run(CURRENT_SCHEMA_VERSION + 5)

    expect(() => migrate(database)).toThrow(/newer than this version/i)
    database.close()
  })

  it('knows what is still pending from any version', () => {
    expect(pendingMigrations(0).map((m) => m.version)).toEqual([1])
    expect(pendingMigrations(CURRENT_SCHEMA_VERSION)).toEqual([])
  })
})

describe('round-tripping a spool (PLAN.md 11, M6)', () => {
  const open = () => {
    const result = openDatabase(paths().database, 'd'.repeat(64))
    if (!result.ok) throw new Error(result.detail)
    return result.database
  }

  it('restores clips in order, with the cursor where it was', () => {
    const spool = {
      ...createSpool({ id: 'default', name: 'Default spool', kind: 'default', mode: 'lifo' }),
      clips: [clip('a'), clip('b'), clip('c')],
      cursorClipId: 'b'
    }

    let database = open()
    saveSpool(database, spool, NOW)
    database.close()

    database = open()
    const [restored] = loadSpools(database)
    database.close()

    expect(restored.clips.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(restored.cursorClipId).toBe('b')
    expect(restored.mode).toBe('lifo')
    expect(restored.kind).toBe('default')
    expect(restored.name).toBe('Default spool')
  })

  it('restores every field of a clip', () => {
    const flagged = createClip({
      id: 'f1',
      content: 'kept after a prompt',
      capturedAt: NOW,
      sourceApp: 'EXCEL.EXE',
      wasFlagged: true
    })

    const database = open()
    saveSpool(
      database,
      { ...createSpool({ id: 's', name: 'S', kind: 'saved' }), clips: [flagged], cursorClipId: 'f1' },
      NOW
    )
    const [restored] = loadSpools(database)
    database.close()

    expect(restored.clips[0]).toEqual(flagged)
  })

  it('rewrites positions on save, so a reorder round-trips', () => {
    const database = open()
    const spool = {
      ...createSpool({ id: 'default', name: 'Default', kind: 'default' }),
      clips: [clip('a'), clip('b'), clip('c')],
      cursorClipId: 'a'
    }
    saveSpool(database, spool, NOW)

    saveSpool(database, { ...spool, clips: [clip('c'), clip('a'), clip('b')] }, NOW)
    const [restored] = loadSpools(database)
    database.close()

    expect(restored.clips.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('repairs a cursor that no longer resolves rather than restoring a stale id', () => {
    const database = open()
    const spool = {
      ...createSpool({ id: 'default', name: 'Default', kind: 'default' }),
      clips: [clip('a'), clip('b')],
      cursorClipId: 'a'
    }
    saveSpool(database, spool, NOW)
    database.prepare('UPDATE spools SET cursor_clip_id = ?').run('a-clip-that-is-gone')

    const [restored] = loadSpools(database)
    database.close()

    expect(restored.cursorClipId).toBe('a')
  })

  it('round-trips source rules', () => {
    const database = open()
    saveSourceRules(
      database,
      new Map([
        ['1Password.exe', 'always_skip'],
        ['Code.exe', 'always_keep']
      ]),
      NOW
    )

    const restored = loadSourceRules(database)
    database.close()

    expect(restored.get('1Password.exe')).toBe('always_skip')
    expect(restored.get('Code.exe')).toBe('always_keep')
    expect(restored.size).toBe(2)
  })

  it('deleting a spool takes its clips with it', () => {
    const database = open()
    saveSpool(
      database,
      { ...createSpool({ id: 's', name: 'S', kind: 'saved' }), clips: [clip('a')], cursorClipId: 'a' },
      NOW
    )

    database.prepare('DELETE FROM spools WHERE id = ?').run('s')
    const orphans = database.prepare('SELECT count(*) AS n FROM clips').get() as { n: number }
    database.close()

    expect(orphans.n).toBe(0)
  })
})

describe('explaining a storage failure (PLAN.md 11, M6)', () => {
  it('says what happened in words, not in an error code', () => {
    const explained = explainStorageFailure({
      ok: false,
      reason: 'key_unreadable',
      detail: 'Ciphertext does not appear to be encrypted.',
      canStartFresh: true
    })

    expect(explained.reason).not.toContain('key_unreadable')
    expect(explained.reason).toMatch(/sealed key could not be opened/i)
    expect(explained.canStartFresh).toBe(true)
  })

  it('is explicit that no key is written in plaintext when sealing is unavailable', () => {
    const explained = explainStorageFailure({
      ok: false,
      reason: 'encryption_unavailable',
      detail: 'no sealing',
      canStartFresh: false
    })

    expect(explained.reason).toMatch(/plaintext/i)
    expect(explained.canStartFresh).toBe(false)
  })

  it('offers no false hope when starting fresh would not help', () => {
    const explained = explainStorageFailure({
      ok: false,
      reason: 'unreadable',
      detail: 'disk is on fire',
      canStartFresh: false
    })

    expect(explained.reason).toContain('disk is on fire')
    expect(explained.canStartFresh).toBe(false)
  })
})
