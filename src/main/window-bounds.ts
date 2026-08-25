/**
 * Where the window goes when it changes size (PLAN.md 8).
 *
 * Pure geometry, so the rule can be tested without a screen.
 *
 * **It anchors rather than re-centres.** Centring on resize slides the whole layout underneath a
 * stationary cursor: the compact window's Arrange button and the expanded window's per-row move
 * controls land in almost the same place, so the click that expands leaves the pointer resting on a
 * control that reorders a clip. Keeping the top-left corner put means nothing moves under the hand
 * that just clicked.
 */

export interface Rectangle {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/**
 * The new bounds for a resize: same corner, new size, nudged back inside the work area if the new
 * size would hang off the edge of the screen.
 */
export function anchoredBounds(current: Rectangle, size: Size, workArea: Rectangle): Rectangle {
  const maxX = workArea.x + Math.max(workArea.width - size.width, 0)
  const maxY = workArea.y + Math.max(workArea.height - size.height, 0)

  return {
    x: Math.round(Math.min(Math.max(current.x, workArea.x), maxX)),
    y: Math.round(Math.min(Math.max(current.y, workArea.y), maxY)),
    width: size.width,
    height: size.height
  }
}
