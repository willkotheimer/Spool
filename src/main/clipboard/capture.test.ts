import { describe, expect, it } from 'vitest'
import { CLIP_BYTE_CAP, DEFAULT_SPOOL_CLIP_CAP } from '../core/limits'
import { createSpool } from '../core/spool'
import { emptyLedger } from '../detect/notices'
import { captureSnapshot, type CaptureState } from './capture'

const deps = (() => {
  let n = 0
  return {
    now: () => '2026-08-22T07:00:00.000Z',
    newId: () => `clip-${++n}`
  }
})()

const fresh = (): CaptureState => ({
  spool: createSpool({ id: 'default', name: 'Default', kind: 'default', mode: 'fifo' }),
  lastCapturedText: null,
  ledger: emptyLedger
})

const text = (value: string) => ({ formats: ['CF_UNICODETEXT'], text: value })

/** Copy a series of things, in order, the way a user would. */
function captureAll(values: string[], from: CaptureState = fresh()): CaptureState {
  return values.reduce((state, value) => captureSnapshot(state, text(value), deps).state, from)
}

describe('capturing text', () => {
  it('appends to the default spool, oldest first', () => {
    const state = captureAll(['one', 'two', 'three'])

    expect(state.spool.clips.map((clip) => clip.content)).toEqual(['one', 'two', 'three'])
  })

  it('leaves the cursor on the oldest clip in fifo, which is what serves next', () => {
    const state = captureAll(['one', 'two', 'three'])

    expect(state.spool.clips[0].content).toBe('one')
    expect(state.spool.cursorClipId).toBe(state.spool.clips[0].id)
  })

  it('keeps the source application where the OS exposed one', () => {
    const outcome = captureSnapshot(
      fresh(),
      { formats: ['CF_UNICODETEXT'], text: 'copied', sourceApp: 'Excel' },
      deps
    )

    expect(outcome.captured?.sourceApp).toBe('Excel')
  })

  it('ignores an identical consecutive copy, and takes it again after something else', () => {
    const first = captureSnapshot(fresh(), text('same'), deps)
    const again = captureSnapshot(first.state, text('same'), deps)

    expect(again.skipped).toBe('duplicate')
    expect(again.state.spool.clips).toHaveLength(1)
    expect(again.notice).toBeNull()

    const between = captureSnapshot(again.state, text('other'), deps)
    const third = captureSnapshot(between.state, text('same'), deps)

    expect(third.skipped).toBeNull()
    expect(third.state.spool.clips.map((clip) => clip.content)).toEqual(['same', 'other', 'same'])
  })
})

describe('the rolling cap (PLAN.md 3, Limits)', () => {
  it('copying sixty things leaves exactly fifty, with the oldest ten gone', () => {
    const values = Array.from({ length: 60 }, (_, i) => `copy ${i}`)
    const state = captureAll(values)

    expect(state.spool.clips).toHaveLength(DEFAULT_SPOOL_CLIP_CAP)
    expect(state.spool.clips[0].content).toBe('copy 10')
    expect(state.spool.clips.at(-1)?.content).toBe('copy 59')
  })

  it('reports what rolled out so the store can forget it too', () => {
    const values = Array.from({ length: DEFAULT_SPOOL_CLIP_CAP }, (_, i) => `copy ${i}`)
    const full = captureAll(values)
    const outcome = captureSnapshot(full, text('one more'), deps)

    expect(outcome.evicted.map((clip) => clip.content)).toEqual(['copy 0'])
    expect(outcome.notice).toBeNull()
  })
})

describe('declining a copy', () => {
  it('declines a screenshot and says so once, however many follow', () => {
    const image = { formats: ['CF_BITMAP', 'CF_DIB'], text: null }

    let state = fresh()
    const first = captureSnapshot(state, image, deps)
    expect(first.notice?.message).toBe("Images aren't captured in this version")
    expect(first.captured).toBeNull()

    state = first.state
    for (let i = 0; i < 19; i++) {
      const next = captureSnapshot(state, image, deps)
      expect(next.notice).toBeNull()
      state = next.state
    }
    // Twenty screenshots, one notice.
    expect(state.spool.clips).toHaveLength(0)
  })

  it('declines a file copy with its own wording', () => {
    const outcome = captureSnapshot(fresh(), { formats: ['CF_HDROP', 'FileNameW'], text: null }, deps)

    expect(outcome.notice?.message).toBe("Files aren't captured in this version")
    expect(outcome.captured).toBeNull()
  })

  it('declines a copy over the clip cap with the size wording, not a format one', () => {
    const huge = 'x'.repeat(5 * 1024 * 1024)
    const outcome = captureSnapshot(fresh(), text(huge), deps)

    expect(outcome.skipped).toBe('too_large')
    expect(outcome.notice?.message).toBe('That copy was 5 MB, over the 1 MB limit for one clip')
    expect(outcome.notice?.category).toBe('size')
  })

  it('captures a clip that is exactly at the cap', () => {
    const outcome = captureSnapshot(fresh(), text('x'.repeat(CLIP_BYTE_CAP)), deps)

    expect(outcome.captured).not.toBeNull()
  })

  it('leaves the spool, the cursor, and the last-captured text untouched', () => {
    const before = captureAll(['one', 'two'])
    const after = captureSnapshot(before, { formats: ['CF_DIB'], text: null }, deps)

    expect(after.state.spool.clips).toEqual(before.spool.clips)
    expect(after.state.spool.cursorClipId).toBe(before.spool.cursorClipId)
    expect(after.state.lastCapturedText).toBe('two')

    // And a duplicate of the last real copy is still suppressed afterwards.
    expect(captureSnapshot(after.state, text('two'), deps).skipped).toBe('duplicate')
  })

  it('says nothing at all about an empty clipboard', () => {
    const outcome = captureSnapshot(fresh(), { formats: [], text: null }, deps)

    expect(outcome.notice).toBeNull()
    expect(outcome.skipped).toBe('declined')
  })
})
