import { describe, expect, it } from 'vitest'
import { hasChanged, moveClip, sameClips, sourceLabel } from './ArrangeListHelper'

const ids = ['a', 'b', 'c', 'd']

describe('moveClip', () => {
  it('moves a clip down', () => {
    expect(moveClip(ids, 0, 1)).toEqual(['b', 'a', 'c', 'd'])
  })

  it('moves a clip up', () => {
    expect(moveClip(ids, 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('clamps at the ends rather than wrapping around', () => {
    expect(moveClip(ids, 0, -1)).toEqual(ids)
    expect(moveClip(ids, 3, 4)).toEqual(ids)
  })

  it('keeps every clip, however it is moved', () => {
    for (let from = 0; from < ids.length; from++) {
      for (let to = 0; to < ids.length; to++) {
        expect([...moveClip(ids, from, to)].sort()).toEqual([...ids].sort())
      }
    }
  })

  it('leaves a list alone when the move goes nowhere', () => {
    expect(moveClip(ids, 2, 2)).toEqual(ids)
    expect(moveClip(ids, 9, 0)).toEqual(ids)
  })
})

describe('hasChanged', () => {
  it('knows an untouched arrangement from a rearranged one', () => {
    expect(hasChanged(ids, ids)).toBe(false)
    expect(hasChanged(ids, ['b', 'a', 'c', 'd'])).toBe(true)
  })
})

describe('sourceLabel', () => {
  it('drops the extension a Windows process name carries', () => {
    expect(sourceLabel({ id: 'a', preview: 'p', capturedAt: 'x', sourceApp: 'EXCEL.EXE' })).toBe(
      'EXCEL'
    )
    expect(sourceLabel({ id: 'a', preview: 'p', capturedAt: 'x', sourceApp: null })).toBeNull()
  })
})

describe('sameClips', () => {
  it('is true for the same clips in a different order', () => {
    expect(sameClips(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
  })

  it('is false once a clip has been added or removed', () => {
    expect(sameClips(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    expect(sameClips(['a', 'b', 'c'], ['a', 'b'])).toBe(false)
    expect(sameClips(['a', 'b'], ['a', 'z'])).toBe(false)
  })

  it('counts duplicates rather than treating the lists as sets', () => {
    expect(sameClips(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(false)
    expect(sameClips(['a', 'a', 'b'], ['b', 'a', 'a'])).toBe(true)
  })
})
