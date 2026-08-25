import type { ClipView, SpoolView } from '../../shared/ipc'

/** Pure helpers for the compact window's clip list. No React, no I/O (PLAN.md 6). */

export interface ClipRow {
  readonly clip: ClipView
  /** Position in the spool, 1-based, as the user counts things. */
  readonly position: number
  /** The clip the next serve will deliver (PLAN.md 1, invariant 6). */
  readonly isNext: boolean
}

/**
 * The rows the compact window shows: the next clip to serve and the few behind it (PLAN.md 8).
 *
 * Order is always position order — oldest first — whatever the mode. Mode governs which clip serves
 * next, not how the list reads; a list that reversed itself under the user would make the spool
 * harder to arrange, not easier.
 */
export function clipRows(spool: SpoolView, limit = 5): ClipRow[] {
  const rows = spool.clips.map((clip, index) => ({
    clip,
    position: index + 1,
    isNext: clip.id === spool.cursorClipId
  }))

  if (rows.length <= limit) return rows

  // Keep the next-to-serve clip in view, with as much of its neighbourhood as fits.
  const next = rows.findIndex((row) => row.isNext)
  if (next === -1) return rows.slice(0, limit)

  const start = Math.min(Math.max(next - 1, 0), rows.length - limit)
  return rows.slice(start, start + limit)
}

/**
 * How many clips fall outside the window of rows on show.
 *
 * The compact window keeps the next-to-serve clip in view, which means clips can sit above or below
 * the visible rows with nothing to say so — and a spool whose state is only partly legible is the
 * thing invariant 6 is against. Counting them lets the window admit what it is not showing.
 */
export function hiddenCounts(
  spool: SpoolView,
  limit = 5
): { readonly above: number; readonly below: number } {
  const shown = clipRows(spool, limit)
  if (shown.length === 0 || shown.length === spool.clips.length) return { above: 0, below: 0 }

  const firstShown = spool.clips.findIndex((clip) => clip.id === shown[0].clip.id)
  const above = Math.max(firstShown, 0)

  return { above, below: spool.clips.length - above - shown.length }
}

/** How full the spool is, in the words the compact window uses. */
export function capacityLabel(spool: SpoolView): string {
  return `${spool.count} of ${spool.cap}`
}

/** What a clip's source is called when the OS did not say. */
export function sourceLabel(clip: ClipView): string | null {
  if (clip.sourceApp === null) return null
  return clip.sourceApp.replace(/\.exe$/i, '')
}
