import type { Clip, Mode, Spool, SpoolKind } from '../core/types'
import type { SourceAction, SourceRules } from '../detect/consent'
import type { SpoolDatabase } from './database'

/**
 * Reading and writing spools (PLAN.md 7).
 *
 * Thin on purpose: every rule about ordering, cursors, and caps lives in `core/`, and this only
 * moves rows. **In memory a spool is a list of clips plus a cursor clip id**, and saving one is
 * rewriting that list — at most a hundred rows inside a transaction, which is why there is no
 * incremental-update machinery here to get wrong.
 */

interface SpoolRow {
  id: string
  name: string
  mode: Mode
  cursor_clip_id: string | null
  is_default: number
}

interface ClipRow {
  id: string
  content: string
  preview: string
  byte_len: number
  source_app: string | null
  was_flagged: number
  captured_at: string
}

export function loadSpools(database: SpoolDatabase): Spool[] {
  const spools = database
    .prepare('SELECT id, name, mode, cursor_clip_id, is_default FROM spools ORDER BY created_at')
    .all() as SpoolRow[]

  const clipsFor = database.prepare(
    `SELECT id, content, preview, byte_len, source_app, was_flagged, captured_at
     FROM clips WHERE spool_id = ? ORDER BY position`
  )

  return spools.map((row) => {
    const clips = (clipsFor.all(row.id) as ClipRow[]).map(
      (clip): Clip => ({
        id: clip.id,
        content: clip.content,
        preview: clip.preview,
        byteLength: clip.byte_len,
        sourceApp: clip.source_app,
        wasFlagged: clip.was_flagged === 1,
        capturedAt: clip.captured_at
      })
    )

    // A cursor that no longer resolves would be a stale id, which invariant 3 of the M2 property
    // test forbids — so it is checked on the way in rather than trusted.
    const cursorClipId =
      row.cursor_clip_id !== null && clips.some((clip) => clip.id === row.cursor_clip_id)
        ? row.cursor_clip_id
        : (clips[0]?.id ?? null)

    return {
      id: row.id,
      name: row.name,
      kind: (row.is_default === 1 ? 'default' : 'saved') as SpoolKind,
      mode: row.mode,
      clips,
      cursorClipId
    }
  })
}

/** Write one spool and its clips. Positions are rewritten from the array, which is the order. */
export function saveSpool(database: SpoolDatabase, spool: Spool, now: string): void {
  const upsertSpool = database.prepare(
    `INSERT INTO spools (id, name, mode, cursor_clip_id, is_default, created_at, updated_at)
     VALUES (@id, @name, @mode, @cursor_clip_id, @is_default, @now, @now)
     ON CONFLICT (id) DO UPDATE SET
       name = excluded.name,
       mode = excluded.mode,
       cursor_clip_id = excluded.cursor_clip_id,
       updated_at = excluded.updated_at`
  )
  const deleteClips = database.prepare('DELETE FROM clips WHERE spool_id = ?')
  const insertClip = database.prepare(
    `INSERT INTO clips
       (id, spool_id, position, content, preview, byte_len, source_app, was_flagged, captured_at)
     VALUES (@id, @spool_id, @position, @content, @preview, @byte_len, @source_app, @was_flagged, @captured_at)`
  )

  database.transaction(() => {
    upsertSpool.run({
      id: spool.id,
      name: spool.name,
      mode: spool.mode,
      cursor_clip_id: spool.cursorClipId,
      is_default: spool.kind === 'default' ? 1 : 0,
      now
    })

    deleteClips.run(spool.id)
    spool.clips.forEach((clip, position) => {
      insertClip.run({
        id: clip.id,
        spool_id: spool.id,
        position,
        content: clip.content,
        preview: clip.preview,
        byte_len: clip.byteLength,
        source_app: clip.sourceApp,
        was_flagged: clip.wasFlagged ? 1 : 0,
        captured_at: clip.capturedAt
      })
    })
  })()
}

export function loadSourceRules(database: SpoolDatabase): Map<string, SourceAction> {
  const rows = database.prepare('SELECT source_app, action FROM source_rules').all() as Array<{
    source_app: string
    action: SourceAction
  }>

  return new Map(rows.map((row) => [row.source_app, row.action]))
}

export function saveSourceRules(database: SpoolDatabase, rules: SourceRules, now: string): void {
  const clear = database.prepare('DELETE FROM source_rules')
  const insert = database.prepare(
    'INSERT INTO source_rules (source_app, action, created_at) VALUES (?, ?, ?)'
  )

  database.transaction(() => {
    clear.run()
    for (const [sourceApp, action] of rules) insert.run(sourceApp, action, now)
  })()
}
