import type { SpoolSummary } from '../../shared/ipc'

/** Pure helpers for the spool list. No React, no I/O (PLAN.md 6). */

/**
 * What the Clear spools button says (PLAN.md 10).
 *
 * It states what it spares — "Clear 12 spools / 3 starred kept" — because the whole point of a star
 * is that the user can run this without checking first. Null when there is nothing to clear, so the
 * button is not offered at all.
 */
export function clearSpoolsLabel(spools: readonly SpoolSummary[]): string | null {
  const clearing = spools.filter((spool) => !spool.isDefault && !spool.isStarred).length
  if (clearing === 0) return null

  const starred = spools.filter((spool) => spool.isStarred).length
  const head = `Clear ${clearing} ${clearing === 1 ? 'spool' : 'spools'}`

  return starred === 0 ? head : `${head} \u00b7 ${starred} starred kept`
}
