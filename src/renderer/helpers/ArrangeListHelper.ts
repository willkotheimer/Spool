import type { ClipView } from '../../shared/ipc'

/** Pure helpers for arranging clips. No React, no I/O (PLAN.md 6). */

/**
 * Move one clip to a new index, clamped to the list.
 *
 * Clamping rather than wrapping: pressing "up" on the first row should do nothing, not send it to
 * the bottom, which would be a surprise the user has to undo.
 */
export function moveClip(ids: readonly string[], from: number, to: number): string[] {
  const next = [...ids]
  if (from < 0 || from >= next.length) return next

  const target = Math.min(Math.max(to, 0), next.length - 1)
  if (target === from) return next

  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return next
}

/**
 * Whether two lists hold exactly the same clips, in any order.
 *
 * This is what tells a draft arrangement from a stale one: if a capture or a serve changed which
 * clips exist while the user was arranging, the draft no longer describes this spool and the live
 * order is the truthful thing to show.
 */
export function sameClips(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const counts = new Map<string, number>()
  for (const id of a) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const id of b) {
    const remaining = counts.get(id)
    if (remaining === undefined || remaining === 0) return false
    counts.set(id, remaining - 1)
  }
  return true
}

/** Whether an arrangement differs from the order it started in. */
export function hasChanged(original: readonly string[], arranged: readonly string[]): boolean {
  if (original.length !== arranged.length) return true
  return original.some((id, index) => id !== arranged[index])
}

/** What a clip's source is called when the OS said. */
export function sourceLabel(clip: ClipView): string | null {
  if (clip.sourceApp === null) return null
  const trimmed = clip.sourceApp.replace(/\.exe$/i, '').trim()
  return trimmed.length === 0 ? null : trimmed
}
