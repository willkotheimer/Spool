import { describe, expect, it } from 'vitest'
import { isSelected, only, prune, range, selectedClips, selectedCount, toggle } from './selection'
import type { Clip } from './types'

const clip = (id: string): Clip => ({
  id,
  content: id,
  preview: id,
  byteLength: id.length,
  sourceApp: null,
  wasFlagged: false,
  capturedAt: '2026-09-11T00:00:00.000Z'
})

const clips = [clip('a'), clip('b'), clip('c')]

describe('an empty selection means every clip (PLAN.md 3)', () => {
  // The rule the whole feature rests on: selecting nothing and meaning nothing is not a state worth
  // having, because it would make the hotkeys dead with no way to tell that apart from a bug.
  it('treats every clip as in play', () => {
    const none = new Set<string>()
    expect(clips.every((c) => isSelected(c.id, none))).toBe(true)
    expect(selectedClips(clips, none)).toEqual(clips)
    expect(selectedCount(clips, none)).toBe(3)
  })

  it('narrows to exactly what was chosen once something is', () => {
    const some = new Set(['a', 'c'])
    expect(selectedClips(clips, some).map((c) => c.id)).toEqual(['a', 'c'])
    expect(selectedCount(clips, some)).toBe(2)
    expect(isSelected('b', some)).toBe(false)
  })

  it('keeps spool order rather than the order things were ticked', () => {
    expect(selectedClips(clips, new Set(['c', 'a'])).map((c) => c.id)).toEqual(['a', 'c'])
  })
})

describe('toggle', () => {
  it('adds and removes one clip', () => {
    expect([...toggle(new Set(), 'b')]).toEqual(['b'])
    expect([...toggle(new Set(['b']), 'b')]).toEqual([])
  })

  // Unticking the last box returns to all, which is the same state as never having ticked one.
  // Clearing the selection and selecting everything are one act, so they cannot disagree.
  it('emptying the selection is the same as selecting all', () => {
    const emptied = toggle(new Set(['b']), 'b')
    expect(selectedCount(clips, emptied)).toBe(3)
  })
})

describe('prune', () => {
  it('drops ids for clips that are gone', () => {
    expect([...prune([clip('a')], new Set(['a', 'b']))]).toEqual(['a'])
  })

  // A selection still holding a deleted clip would make the button promise more than it can give.
  it('a selection emptied by deletion means all again, not none', () => {
    expect(selectedCount([clip('a')], prune([clip('a')], new Set(['gone'])))).toBe(1)
  })
})

describe('only', () => {
  it('chooses one clip and drops the rest', () => {
    expect(only(new Set(['a', 'b']), 'c')).toEqual(new Set(['c']))
  })

  it('choosing the sole chosen clip again clears, which means all', () => {
    expect(only(new Set(['a']), 'a')).toEqual(new Set())
  })

  it('choosing one of several chosen narrows to it rather than clearing', () => {
    expect(only(new Set(['a', 'b']), 'a')).toEqual(new Set(['a']))
  })
})

describe('range', () => {
  it('takes the run from the anchor to the clip, inclusive', () => {
    expect(range(clips, new Set(), 'a', 'c')).toEqual(new Set(['a', 'b', 'c']))
  })

  it('reads the same run whichever end was clicked first', () => {
    expect(range(clips, new Set(), 'c', 'a')).toEqual(new Set(['a', 'b', 'c']))
  })

  it('replaces what was chosen before, as shift-click does everywhere', () => {
    expect(range(clips, new Set(['c']), 'a', 'b')).toEqual(new Set(['a', 'b']))
  })

  it('is a plain click when there is no anchor', () => {
    expect(range(clips, new Set(['a']), null, 'b')).toEqual(new Set(['b']))
  })

  it('is a plain click when the anchor has left the spool', () => {
    expect(range(clips, new Set(), 'gone', 'b')).toEqual(new Set(['b']))
  })
})
