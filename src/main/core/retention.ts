import { deleteClip } from './spool'
import type { Clip, Spool } from './types'

/**
 * Age-based retention (PLAN.md 11, M9).
 *
 * Optional and per-spool: a spool with no limit keeps its clips until the user removes them, which
 * is the default and stays the default. A spool *with* one is a buffer the user asked to be
 * self-emptying — a scratch spool for the working day, say.
 *
 * This is the one place clips go away without the user pressing anything, so it is deliberately
 * narrow: only clips older than a limit the user set on that spool, never as a side effect of
 * anything else, and it is reported so nothing disappears silently (invariant 7).
 *
 * Pure: the clock is passed in, as everywhere else in `core/`.
 */

/** No limit at all, which is what every spool starts with. */
export const NO_RETENTION = null

export type RetentionHours = number | null

export interface ExpiryResult {
  readonly spool: Spool
  /** What aged out, so the caller can remove the rows and say what happened. */
  readonly expired: readonly Clip[]
}

/**
 * Drop clips older than the limit.
 *
 * Deletion goes through `deleteClip` one at a time rather than filtering the array, so the cursor
 * follows the rules of PLAN.md 3 exactly as it would for any other deletion — an expiry that left
 * the cursor on a clip that no longer exists would be a different kind of bug in every milestone
 * that came before.
 */
export function expireClips(spool: Spool, hours: RetentionHours, now: Date): ExpiryResult {
  if (hours === null || hours <= 0) return { spool, expired: [] }

  const cutoff = now.getTime() - hours * 60 * 60 * 1000
  const expired = spool.clips.filter((clip) => capturedAt(clip) < cutoff)

  let remaining = spool
  for (const clip of expired) remaining = deleteClip(remaining, clip.id)

  return { spool: remaining, expired }
}

/**
 * A clip whose timestamp cannot be read is treated as new rather than ancient. Retention removes
 * things, so an unreadable value must never be the reason something is deleted.
 */
function capturedAt(clip: Clip): number {
  const parsed = Date.parse(clip.capturedAt)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

/** The limits offered in settings, in hours. */
export const RETENTION_CHOICES: ReadonlyArray<{ hours: RetentionHours; label: string }> = [
  { hours: null, label: 'Keep until I remove them' },
  { hours: 1, label: 'One hour' },
  { hours: 24, label: 'One day' },
  { hours: 24 * 7, label: 'One week' },
  { hours: 24 * 30, label: 'One month' }
]

export function isRetentionHours(value: unknown): value is RetentionHours {
  if (value === null) return true
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
