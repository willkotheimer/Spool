import { describe, expect, it } from 'vitest'
import { byteLength, createClip, makePreview } from './clip'
import { PREVIEW_LENGTH } from './limits'

describe('makePreview', () => {
  it('collapses newlines so a multi-line clip reads as one line', () => {
    expect(makePreview('first line\nsecond line')).toBe('first line second line')
  })

  it('collapses runs of whitespace and trims the ends', () => {
    expect(makePreview('  spaced \n\n  out  \t text  ')).toBe('spaced out text')
  })

  it('keeps a short clip whole', () => {
    expect(makePreview('short')).toBe('short')
  })

  it('truncates a long clip to the preview length, ellipsis included', () => {
    const preview = makePreview('x'.repeat(500))

    expect(preview).toHaveLength(PREVIEW_LENGTH)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('does not truncate a clip that is exactly the preview length', () => {
    const exact = 'x'.repeat(PREVIEW_LENGTH)

    expect(makePreview(exact)).toBe(exact)
  })
})

describe('byteLength', () => {
  it('counts bytes rather than characters', () => {
    expect(byteLength('abc')).toBe(3)
    // The caps of PLAN.md 3 are in bytes, and one emoji is four of them.
    expect(byteLength('🧵')).toBe(4)
    expect(byteLength('é')).toBe(2)
  })
})

describe('createClip', () => {
  it('takes identity and time from the caller, reading no clock of its own', () => {
    const clip = createClip({
      id: 'c1',
      content: 'hello\nworld',
      capturedAt: '2026-08-20T12:00:00.000Z',
      sourceApp: 'Notepad'
    })

    expect(clip).toEqual({
      id: 'c1',
      content: 'hello\nworld',
      preview: 'hello world',
      byteLength: 11,
      sourceApp: 'Notepad',
      wasFlagged: false,
      capturedAt: '2026-08-20T12:00:00.000Z'
    })
  })

  it('defaults the source application to null rather than inventing one', () => {
    const clip = createClip({ id: 'c1', content: 'x', capturedAt: '2026-08-20T12:00:00.000Z' })

    expect(clip.sourceApp).toBeNull()
    expect(clip.wasFlagged).toBe(false)
  })
})
