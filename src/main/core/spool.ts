import { byteLength } from './clip'
import { CLIP_BYTE_CAP, DEFAULT_SPOOL_CLIP_CAP, SAVED_SPOOL_CLIP_CAP } from './limits'
import type { CaptureResult, Clip, Mode, ServeResult, Spool, SpoolKind } from './types'

/** The clip cap this spool is bound by (PLAN.md 3, Limits). */
export function clipCap(kind: SpoolKind): number {
  return kind === 'default' ? DEFAULT_SPOOL_CLIP_CAP : SAVED_SPOOL_CLIP_CAP
}

/** Which way the cursor travels: `fifo` forward from the oldest, `lifo` backward from the newest. */
function step(mode: Mode): 1 | -1 {
  return mode === 'fifo' ? 1 : -1
}

export function createSpool(input: {
  id: string
  name: string
  kind: SpoolKind
  mode?: Mode
  clips?: readonly Clip[]
}): Spool {
  const clips = input.clips ?? []
  const mode = input.mode ?? 'fifo'
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    mode,
    clips,
    cursorClipId: clips.length === 0 ? null : startingClip(clips, mode).id
  }
}

/** Where a cursor begins: position 0 in `fifo`, the last position in `lifo` (PLAN.md 3). */
function startingClip(clips: readonly Clip[], mode: Mode): Clip {
  return mode === 'fifo' ? clips[0] : clips[clips.length - 1]
}

export function cursorIndex(spool: Spool): number {
  return spool.clips.findIndex((clip) => clip.id === spool.cursorClipId)
}

/** The clip the next serve will deliver, or null when there is nothing to paste. */
export function cursorClip(spool: Spool): Clip | null {
  const index = cursorIndex(spool)
  return index === -1 ? null : spool.clips[index]
}

/**
 * Capture a clip.
 *
 * `fifo` — appended at the end, and the cursor does not move. `lifo` — appended at the end, where it
 * becomes the cursor target, because it is now the newest. A capture into an empty spool takes the
 * cursor in either mode; there is nowhere else for it to be.
 *
 * At the cap the two kinds part ways, which is the whole point of having two (PLAN.md 3, Limits):
 * the default buffer **rolls**, evicting the oldest clip, and a saved spool **refuses** so that
 * nothing anyone arranged is discarded to make room.
 */
export function capture(spool: Spool, clip: Clip): CaptureResult {
  if (clip.byteLength > CLIP_BYTE_CAP) {
    return { ok: false, reason: 'clip_too_large', spool, limit: CLIP_BYTE_CAP }
  }

  const cap = clipCap(spool.kind)
  let clips = spool.clips
  let cursorClipId = spool.cursorClipId
  const evicted: Clip[] = []

  if (clips.length >= cap) {
    if (spool.kind === 'saved') {
      return { ok: false, reason: 'spool_full', spool, limit: cap }
    }
    // Rolling: eviction is exactly a delete of the oldest clip, cursor rules and all.
    while (clips.length >= cap) {
      const oldest = clips[0]
      const afterEviction = removeAt({ ...spool, clips, cursorClipId }, 0)
      evicted.push(oldest)
      clips = afterEviction.clips
      cursorClipId = afterEviction.cursorClipId
    }
  }

  const withClip = [...clips, clip]
  const nextCursor =
    spool.mode === 'lifo' || cursorClipId === null || clips.length === 0 ? clip.id : cursorClipId

  return {
    ok: true,
    spool: { ...spool, clips: withClip, cursorClipId: nextCursor },
    evicted
  }
}

/**
 * Write the cursor's clip out and advance (PLAN.md 3). **Serving pastes; it does not pop** — the
 * clip stays exactly where it was, and the cursor moves one step in the mode's direction, wrapping
 * at the end.
 */
export function serve(spool: Spool): ServeResult {
  const index = cursorIndex(spool)
  if (index === -1) return { ok: false, reason: 'empty', spool }

  const clip = spool.clips[index]
  const count = spool.clips.length
  const next = (index + step(spool.mode) + count) % count

  return { ok: true, clip, spool: { ...spool, cursorClipId: spool.clips[next].id } }
}

/**
 * Delete one clip. The cursor follows the rule the mutation deserves: if it held the cursor, the
 * cursor moves to the next clip in the mode's direction and clamps to the nearest end when there is
 * none; otherwise it stays on the clip it was on, whatever that clip's index becomes.
 */
export function deleteClip(spool: Spool, clipId: string): Spool {
  const index = spool.clips.findIndex((clip) => clip.id === clipId)
  return index === -1 ? spool : removeAt(spool, index)
}

function removeAt(spool: Spool, index: number): Spool {
  const clips = [...spool.clips.slice(0, index), ...spool.clips.slice(index + 1)]

  if (clips.length === 0) return { ...spool, clips, cursorClipId: null }
  if (spool.clips[index].id !== spool.cursorClipId) return { ...spool, clips }

  // The deleted clip held the cursor. In `fifo` the next clip has shifted into this index; in
  // `lifo` it is the one before. Either way, clamp into range rather than wrapping — the cursor
  // lands at the nearest end when it ran out of clips in that direction.
  const target = spool.mode === 'fifo' ? index : index - 1
  const clamped = Math.min(Math.max(target, 0), clips.length - 1)

  return { ...spool, clips, cursorClipId: clips[clamped].id }
}

/**
 * Move a clip to a new position. Positions stay dense, and the cursor follows the clip it pointed
 * at, wherever it lands — which costs nothing, because the cursor is an identity.
 */
export function reorder(spool: Spool, from: number, to: number): Spool {
  if (from === to) return spool
  if (from < 0 || from >= spool.clips.length) return spool

  const clips = [...spool.clips]
  const [moved] = clips.splice(from, 1)
  clips.splice(Math.min(Math.max(to, 0), clips.length), 0, moved)

  return { ...spool, clips }
}

/**
 * Put the clips in the order given by `clipIds`.
 *
 * Rejects an arrangement that is not a permutation of exactly the clips there are — a dropped or
 * invented id would silently lose or duplicate a clip, and the renderer is not the authority on
 * what is in the spool. Returns null rather than throwing, because a stale arrangement arriving
 * from a window is a race, not a bug.
 */
export function arrange(clips: readonly Clip[], clipIds: readonly string[]): Clip[] | null {
  if (clipIds.length !== clips.length) return null

  const byId = new Map(clips.map((clip) => [clip.id, clip]))
  const rearranged: Clip[] = []

  for (const id of clipIds) {
    const clip = byId.get(id)
    if (clip === undefined) return null
    byId.delete(id)
    rearranged.push(clip)
  }

  return rearranged
}

/** Change direction. The cursor stays on the clip it was on; only future travel changes. */
export function setMode(spool: Spool, mode: Mode): Spool {
  return { ...spool, mode }
}

/** Remove every clip. The user asked; the cursor has nowhere to be (PLAN.md 1, invariant 7). */
export function clear(spool: Spool): Spool {
  return { ...spool, clips: [], cursorClipId: null }
}

/** Total bytes held, which is what the capacity advisor of PLAN.md 9 will read. */
export function spoolByteLength(spool: Spool): number {
  return spool.clips.reduce((total, clip) => total + clip.byteLength, 0)
}

export { byteLength }
