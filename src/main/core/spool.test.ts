import { describe, expect, it } from 'vitest'
import { createClip } from './clip'
import { CLIP_BYTE_CAP, DEFAULT_SPOOL_CLIP_CAP, SAVED_SPOOL_CLIP_CAP } from './limits'
import { capture, createSpool, cursorClip, deleteClip, reorder, serve, setMode } from './spool'
import type { Clip, Mode, Spool, SpoolKind } from './types'

const clip = (id: string, content = `content of ${id}`): Clip =>
  createClip({ id, content, capturedAt: '2026-08-20T12:00:00.000Z' })

const spoolOf = (ids: string[], mode: Mode = 'fifo', kind: SpoolKind = 'saved'): Spool =>
  createSpool({ id: 's1', name: 'Test', kind, mode, clips: ids.map((id) => clip(id)) })

const ids = (spool: Spool): string[] => spool.clips.map((c) => c.id)
const cursor = (spool: Spool): string | null => spool.cursorClipId

/** Serve repeatedly, collecting what each serve delivers. Serving pastes; it does not pop. */
function servedOrder(spool: Spool, times: number): string[] {
  const delivered: string[] = []
  let current = spool
  for (let i = 0; i < times; i++) {
    const result = serve(current)
    if (!result.ok) break
    delivered.push(result.clip.id)
    current = result.spool
  }
  return delivered
}

describe('mode and cursor travel (PLAN.md 3)', () => {
  it('fifo serves A -> B -> C -> A, starting at the oldest', () => {
    const spool = spoolOf(['A', 'B', 'C'], 'fifo')
    expect(cursor(spool)).toBe('A')
    expect(servedOrder(spool, 4)).toEqual(['A', 'B', 'C', 'A'])
  })

  it('lifo serves C -> B -> A -> C, starting at the newest', () => {
    const spool = spoolOf(['A', 'B', 'C'], 'lifo')
    expect(cursor(spool)).toBe('C')
    expect(servedOrder(spool, 4)).toEqual(['C', 'B', 'A', 'C'])
  })

  it('serving leaves every clip where it was', () => {
    const result = serve(spoolOf(['A', 'B', 'C'], 'fifo'))
    expect(result.ok && ids(result.spool)).toEqual(['A', 'B', 'C'])
  })
})

// The eight rows of the cursor table in PLAN.md 3, in order.
describe('cursor behaviour under every mutation (PLAN.md 3)', () => {
  it('row 1 - capture, fifo: appended at the end, cursor does not move', () => {
    const result = capture(spoolOf(['A', 'B'], 'fifo'), clip('C'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(ids(result.spool)).toEqual(['A', 'B', 'C'])
    expect(cursor(result.spool)).toBe('A')
  })

  it('row 2 - capture, lifo: appended at the end and becomes the cursor target', () => {
    const result = capture(spoolOf(['A', 'B'], 'lifo'), clip('C'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(ids(result.spool)).toEqual(['A', 'B', 'C'])
    expect(cursor(result.spool)).toBe('C')
  })

  it('row 2b - a capture into an empty spool takes the cursor in either mode', () => {
    for (const mode of ['fifo', 'lifo'] as Mode[]) {
      const result = capture(spoolOf([], mode), clip('A'))
      expect(result.ok && cursor(result.spool)).toBe('A')
    }
  })

  it('row 3 - deleting the clip at the cursor moves it in the mode direction', () => {
    expect(cursor(deleteClip(spoolOf(['A', 'B', 'C'], 'fifo'), 'A'))).toBe('B')
    expect(cursor(deleteClip(spoolOf(['A', 'B', 'C'], 'lifo'), 'C'))).toBe('B')
  })

  it('row 3b - with no clip in that direction, the cursor clamps to the nearest end', () => {
    // A fifo cursor parked on the last clip has nothing ahead of it, so it clamps back one.
    const atLast = { ...spoolOf(['A', 'B', 'C'], 'fifo'), cursorClipId: 'C' }
    expect(cursor(deleteClip(atLast, 'C'))).toBe('B')

    // A lifo cursor on the oldest clip has nothing behind it, so it clamps forward one.
    const atFirst = { ...spoolOf(['A', 'B', 'C'], 'lifo'), cursorClipId: 'A' }
    expect(cursor(deleteClip(atFirst, 'A'))).toBe('B')
  })

  it('row 4 - deleting any other clip leaves the cursor on the same clip', () => {
    const before = { ...spoolOf(['A', 'B', 'C'], 'fifo'), cursorClipId: 'C' }
    const after = deleteClip(before, 'A')

    expect(ids(after)).toEqual(['B', 'C'])
    expect(cursor(after)).toBe('C')
    // Its index moved from 2 to 1; its identity did not.
    expect(after.clips.findIndex((c) => c.id === 'C')).toBe(1)
  })

  it('row 5 - reorder: the cursor follows the clip it pointed at, wherever it lands', () => {
    const before = { ...spoolOf(['A', 'B', 'C'], 'fifo'), cursorClipId: 'C' }
    const after = reorder(before, 2, 0)

    expect(ids(after)).toEqual(['C', 'A', 'B'])
    expect(cursor(after)).toBe('C')
  })

  it('row 5b - reordering other clips around the cursor does not disturb it', () => {
    const before = { ...spoolOf(['A', 'B', 'C'], 'fifo'), cursorClipId: 'B' }
    const after = reorder(before, 0, 2)

    expect(ids(after)).toEqual(['B', 'C', 'A'])
    expect(cursor(after)).toBe('B')
  })

  it('row 6 - a mode change moves nothing but the direction of future travel', () => {
    const after = setMode(spoolOf(['A', 'B', 'C'], 'fifo'), 'lifo')

    expect(cursor(after)).toBe('A')
    expect(servedOrder(after, 3)).toEqual(['A', 'C', 'B'])
  })

  it('row 7 - eviction is treated exactly as a delete of that clip', () => {
    const full = createSpool({
      id: 's',
      name: 'Default',
      kind: 'default',
      mode: 'fifo',
      clips: Array.from({ length: DEFAULT_SPOOL_CLIP_CAP }, (_, i) => clip(`c${i}`))
    })
    expect(cursor(full)).toBe('c0')

    const result = capture(full, clip('new'))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.evicted.map((c) => c.id)).toEqual(['c0'])
    // The evicted clip held the cursor, so the cursor moved in the mode's direction.
    expect(cursor(result.spool)).toBe('c1')
    expect(result.spool.clips.length).toBe(DEFAULT_SPOOL_CLIP_CAP)
  })

  it('row 7b - eviction of a clip that did not hold the cursor leaves it alone', () => {
    const clips = Array.from({ length: DEFAULT_SPOOL_CLIP_CAP }, (_, i) => clip(`c${i}`))
    const full = {
      ...createSpool({ id: 's', name: 'Default', kind: 'default', mode: 'fifo', clips }),
      cursorClipId: 'c7'
    }

    const result = capture(full, clip('new'))
    expect(result.ok && cursor(result.spool)).toBe('c7')
  })

  it('row 8 - an empty spool has a null cursor, and serve reports nothing to paste', () => {
    const emptied = deleteClip(spoolOf(['A'], 'fifo'), 'A')

    expect(ids(emptied)).toEqual([])
    expect(cursor(emptied)).toBeNull()
    expect(cursorClip(emptied)).toBeNull()

    const result = serve(emptied)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('empty')
  })
})

describe('limits (PLAN.md 3, Limits)', () => {
  it('the default spool rolls: the oldest clip is evicted to make room', () => {
    let spool = createSpool({ id: 's', name: 'Default', kind: 'default', mode: 'fifo' })
    for (let i = 0; i < DEFAULT_SPOOL_CLIP_CAP + 5; i++) {
      const result = capture(spool, clip(`c${i}`))
      expect(result.ok).toBe(true)
      if (result.ok) spool = result.spool
    }

    expect(spool.clips.length).toBe(DEFAULT_SPOOL_CLIP_CAP)
    expect(ids(spool)[0]).toBe('c5')
    expect(ids(spool).at(-1)).toBe(`c${DEFAULT_SPOOL_CLIP_CAP + 4}`)
  })

  it('a saved spool refuses: capture stops and nothing is evicted', () => {
    const clips = Array.from({ length: SAVED_SPOOL_CLIP_CAP }, (_, i) => clip(`c${i}`))
    const full = createSpool({ id: 's', name: 'Saved', kind: 'saved', mode: 'fifo', clips })

    const result = capture(full, clip('new'))
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toBe('spool_full')
    expect(result.limit).toBe(SAVED_SPOOL_CLIP_CAP)
    expect(result.spool).toBe(full)
    expect(result.spool.clips.length).toBe(SAVED_SPOOL_CLIP_CAP)
  })

  it('a clip over the byte cap is not captured, and the spool is untouched', () => {
    const spool = spoolOf(['A'], 'fifo')
    const huge = clip('big', 'x'.repeat(CLIP_BYTE_CAP + 1))

    const result = capture(spool, huge)
    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toBe('clip_too_large')
    expect(result.limit).toBe(CLIP_BYTE_CAP)
    expect(result.spool).toBe(spool)
  })

  it('a clip exactly at the byte cap is captured', () => {
    const result = capture(spoolOf([], 'fifo'), clip('edge', 'x'.repeat(CLIP_BYTE_CAP)))
    expect(result.ok).toBe(true)
  })
})
