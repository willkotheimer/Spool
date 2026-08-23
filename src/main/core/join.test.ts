import { describe, expect, it } from 'vitest'
import { createClip } from './clip'
import {
  CONFIRM_JOIN_BYTES,
  isSeparatorKind,
  joinSpool,
  needsConfirmation,
  separatorText
} from './join'
import { createSpool, serve } from './spool'
import type { Mode, Spool } from './types'

const spoolOf = (contents: string[], mode: Mode = 'fifo'): Spool =>
  createSpool({
    id: 's',
    name: 'Test',
    kind: 'saved',
    mode,
    clips: contents.map((content, i) =>
      createClip({ id: `c${i}`, content, capturedAt: '2026-08-22T18:00:00.000Z' })
    )
  })

describe('joining a whole spool (PLAN.md 3)', () => {
  it('lands five clips as five separated lines in one paste', () => {
    const result = joinSpool(spoolOf(['one', 'two', 'three', 'four', 'five']), 'newline')

    expect(result.ok && result.text).toBe('one\ntwo\nthree\nfour\nfive')
    expect(result.ok && result.clips).toBe(5)
  })

  it('reverses the emitted order in lifo', () => {
    const result = joinSpool(spoolOf(['one', 'two', 'three'], 'lifo'), 'newline')

    expect(result.ok && result.text).toBe('three\ntwo\none')
  })

  it('starts at position 0 regardless of where the cursor sits', () => {
    let spool = spoolOf(['one', 'two', 'three'])
    // Advance the cursor to the middle, the way serving would.
    const served = serve(spool)
    if (served.ok) spool = served.spool
    expect(spool.cursorClipId).toBe('c1')

    const result = joinSpool(spool, 'newline')

    expect(result.ok && result.text).toBe('one\ntwo\nthree')
  })

  it('does not move the cursor — this is a bulk read, not a traversal', () => {
    const spool = spoolOf(['one', 'two'])
    const before = spool.cursorClipId

    joinSpool(spool, 'newline')

    expect(spool.cursorClipId).toBe(before)
  })

  it('joins with whichever separator is set', () => {
    const spool = spoolOf(['a', 'b', 'c'])

    expect(joinSpool(spool, 'tab').ok && joinSpool(spool, 'tab')).toMatchObject({
      text: 'a\tb\tc'
    })
    expect(joinSpool(spool, 'blank_line').ok && joinSpool(spool, 'blank_line')).toMatchObject({
      text: 'a\n\nb\n\nc'
    })
    expect(joinSpool(spool, 'comma').ok && joinSpool(spool, 'comma')).toMatchObject({
      text: 'a, b, c'
    })
    expect(joinSpool(spool, 'space').ok && joinSpool(spool, 'space')).toMatchObject({
      text: 'a b c'
    })
    expect(joinSpool(spool, 'none').ok && joinSpool(spool, 'none')).toMatchObject({ text: 'abc' })
  })

  it('makes one tab-delimited line out of a spool of cells', () => {
    const result = joinSpool(spoolOf(['Q1', 'Q2', 'Q3', 'Q4']), 'tab')

    expect(result.ok && result.text).toBe('Q1\tQ2\tQ3\tQ4')
    expect(result.ok && result.text.includes('\n')).toBe(false)
  })

  it('says nothing to paste on an empty spool, in the same words a single serve uses', () => {
    const result = joinSpool(spoolOf([]), 'newline')

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toBe('empty')
  })

  it('leaves a single clip alone, with no separator anywhere', () => {
    expect(joinSpool(spoolOf(['only']), 'comma')).toMatchObject({ text: 'only' })
  })

  it('measures the joined result in bytes, not characters', () => {
    const result = joinSpool(spoolOf(['🧵', '🧵']), 'none')

    expect(result.ok && result.byteLength).toBe(8)
  })
})

describe('the confirmation threshold (PLAN.md 3)', () => {
  it('confirms above 10 MiB, because the clipboard is shared with the whole machine', () => {
    expect(needsConfirmation(CONFIRM_JOIN_BYTES + 1)).toBe(true)
    expect(needsConfirmation(CONFIRM_JOIN_BYTES)).toBe(false)
    expect(needsConfirmation(1024)).toBe(false)
  })
})

describe('separators', () => {
  it('renders each kind as the characters it names', () => {
    expect(separatorText('newline')).toBe('\n')
    expect(separatorText('blank_line')).toBe('\n\n')
    expect(separatorText('tab')).toBe('\t')
    expect(separatorText('none')).toBe('')
  })
})

describe('an unrecognised separator (measured at M7)', () => {
  it('falls back to the documented default rather than to Array.join comma', () => {
    const spool = spoolOf(['a', 'b'])
    const result = joinSpool(spool, 'semicolons' as never)

    expect(result.ok && result.text).toBe('a\nb')
    expect(result.ok && result.text).not.toBe('a,b')
  })

  it('knows which values are actually offered', () => {
    expect(isSeparatorKind('tab')).toBe(true)
    expect(isSeparatorKind('none')).toBe(true)
    expect(isSeparatorKind('semicolons')).toBe(false)
    expect(isSeparatorKind(7)).toBe(false)
    expect(isSeparatorKind(undefined)).toBe(false)
  })
})
