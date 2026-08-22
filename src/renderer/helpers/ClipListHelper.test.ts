import { describe, expect, it } from 'vitest'
import type { ClipView, SpoolView } from '../../shared/ipc'
import { capacityLabel, clipRows, sourceLabel } from './ClipListHelper'

const clip = (id: string, sourceApp: string | null = null): ClipView => ({
  id,
  preview: `preview ${id}`,
  capturedAt: '2026-08-22T07:00:00.000Z',
  sourceApp
})

const spool = (ids: string[], cursorClipId: string | null): SpoolView => ({
  name: 'Default spool',
  mode: 'fifo',
  clips: ids.map((id) => clip(id)),
  cursorClipId,
  count: ids.length,
  cap: 50
})

describe('clipRows', () => {
  it('lists clips oldest first, marking the one that serves next', () => {
    const rows = clipRows(spool(['a', 'b', 'c'], 'a'))

    expect(rows.map((row) => row.clip.id)).toEqual(['a', 'b', 'c'])
    expect(rows.map((row) => row.isNext)).toEqual([true, false, false])
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3])
  })

  it('marks the newest clip in lifo, where the cursor sits at the other end', () => {
    const rows = clipRows({ ...spool(['a', 'b', 'c'], 'c'), mode: 'lifo' })

    // Order does not flip with the mode; only which clip is next.
    expect(rows.map((row) => row.clip.id)).toEqual(['a', 'b', 'c'])
    expect(rows.find((row) => row.isNext)?.clip.id).toBe('c')
  })

  it('keeps the next clip in view when the spool is longer than the window', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`)
    const rows = clipRows(spool(ids, 'c12'), 5)

    expect(rows).toHaveLength(5)
    expect(rows.some((row) => row.isNext)).toBe(true)
    expect(rows.map((row) => row.clip.id)).toEqual(['c11', 'c12', 'c13', 'c14', 'c15'])
  })

  it('does not run off the end when the next clip is the last one', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `c${i}`)
    const rows = clipRows(spool(ids, 'c19'), 5)

    expect(rows.map((row) => row.clip.id)).toEqual(['c15', 'c16', 'c17', 'c18', 'c19'])
    expect(rows.at(-1)?.isNext).toBe(true)
  })

  it('has nothing to show for an empty spool', () => {
    expect(clipRows(spool([], null))).toEqual([])
  })
})

describe('capacityLabel', () => {
  it('reads as a count against the cap', () => {
    expect(capacityLabel(spool(['a', 'b'], 'a'))).toBe('2 of 50')
  })
})

describe('sourceLabel', () => {
  it('drops the extension a Windows process name carries', () => {
    expect(sourceLabel(clip('a', 'EXCEL.EXE'))).toBe('EXCEL')
    expect(sourceLabel(clip('a', 'Code.exe'))).toBe('Code')
  })

  it('says nothing when the OS did not', () => {
    expect(sourceLabel(clip('a', null))).toBeNull()
  })
})
