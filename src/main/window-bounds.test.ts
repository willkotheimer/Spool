import { describe, expect, it } from 'vitest'
import { anchoredBounds } from './window-bounds'

const workArea = { x: 0, y: 0, width: 1920, height: 1040 }
const compact = { width: 360, height: 420 }
const expanded = { width: 900, height: 640 }

describe('anchoredBounds (PLAN.md 8)', () => {
  it('keeps the corner where it was, so nothing slides under the cursor', () => {
    const current = { x: 500, y: 200, ...compact }

    expect(anchoredBounds(current, expanded, workArea)).toEqual({
      x: 500,
      y: 200,
      width: 900,
      height: 640
    })
  })

  it('pulls the window back on screen when the new size would hang off the right', () => {
    const current = { x: 1700, y: 200, ...compact }

    expect(anchoredBounds(current, expanded, workArea)).toMatchObject({ x: 1020, y: 200 })
  })

  it('pulls it back up when the new size would hang off the bottom', () => {
    const current = { x: 100, y: 900, ...compact }

    expect(anchoredBounds(current, expanded, workArea)).toMatchObject({ x: 100, y: 400 })
  })

  it('shrinking back to compact leaves the corner alone', () => {
    const current = { x: 300, y: 150, ...expanded }

    expect(anchoredBounds(current, compact, workArea)).toEqual({
      x: 300,
      y: 150,
      width: 360,
      height: 420
    })
  })

  it('respects a work area that does not start at the origin', () => {
    const secondScreen = { x: 1920, y: 0, width: 1280, height: 720 }
    const current = { x: 1930, y: 10, ...compact }

    expect(anchoredBounds(current, expanded, secondScreen)).toMatchObject({ x: 1930, y: 10 })
  })

  it('never places the window before the work area starts', () => {
    const current = { x: -50, y: -30, ...compact }

    expect(anchoredBounds(current, expanded, workArea)).toMatchObject({ x: 0, y: 0 })
  })

  it('copes with a window larger than the work area rather than going negative', () => {
    const small = { x: 0, y: 0, width: 800, height: 600 }
    const current = { x: 10, y: 10, ...compact }

    expect(anchoredBounds(current, expanded, small)).toMatchObject({ x: 0, y: 0 })
  })
})
