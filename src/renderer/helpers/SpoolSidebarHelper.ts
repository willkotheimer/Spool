import type { SpoolSummary } from '../../shared/ipc'

/** Pure helpers for the spool list. No React, no I/O (PLAN.md 6). */

/**
 * What the Clear spools button says (PLAN.md 9).
 *
 * It names the number it will take, because a destructive button that does not say what it is
 * about to do is one the user runs without checking. Null when there is nothing to clear, so the
 * button is not offered at all.
 *
 * The count and the action must agree. They did not once: the label counted the active spool and
 * the action then skipped it, so "Clear 1 spool" did nothing.
 */
export function clearSpoolsLabel(spools: readonly SpoolSummary[]): string | null {
  const clearing = spools.filter((spool) => !spool.isDefault).length
  if (clearing === 0) return null

  return `Clear ${clearing} ${clearing === 1 ? 'spool' : 'spools'}`
}
