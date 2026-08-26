import { STARRED_BUDGET_SHARE, STARRED_SPOOL_CAP, STORE_BYTE_BUDGET } from './limits'

/**
 * Starred spools (PLAN.md 10).
 *
 * A star marks a spool the user means to keep. It sorts to the top of every list and survives the
 * routine clearing that unstarred spools do not.
 *
 * **A star is unconditional.** No capacity state ever proposes deleting a starred spool or asks for
 * it to be unstarred first — not at 90%, not at the floor, and not by Clear spools. Only the user
 * unstars, and only Reset everything overrides it.
 *
 * Which is exactly why starring is capped, and why the cap is refused *before* the user relies on
 * it: declining to make a promise is not the same act as breaking one. "You can't star this,
 * because starred spools already hold half your space" is an honest limit. "Unstar this so we can
 * delete it" is a promise revoked under pressure, and worse than never having offered the star.
 */

/** The most starred bytes allowed — half the budget, as a fraction so the proof survives a small one. */
export const STARRED_BYTE_RESERVE = STORE_BYTE_BUDGET * STARRED_BUDGET_SHARE

/** Enough of a spool to decide whether it may be starred. */
export interface StarrableSpool {
  readonly id: string
  readonly isDefault: boolean
  readonly isStarred: boolean
  readonly bytes: number
}

export type StarRefusal =
  /** The default spool is a buffer, not an artifact (PLAN.md 10). */
  | { readonly reason: 'default_spool'; readonly message: string }
  | { readonly reason: 'star_cap'; readonly message: string }
  | { readonly reason: 'reserve'; readonly message: string }

export type StarDecision = { readonly ok: true } | { readonly ok: false } & StarRefusal

/**
 * Whether this spool may be starred, and if not, which limit stopped it.
 *
 * Every refusal names the limit — a refusal the user cannot act on is just a wall — and **no
 * refusal ever deletes anything**.
 */
export function canStar(spools: readonly StarrableSpool[], spoolId: string): StarDecision {
  const target = spools.find((spool) => spool.id === spoolId)
  if (target === undefined) return { ok: false, reason: 'star_cap', message: 'That spool is gone.' }

  if (target.isDefault) {
    return {
      ok: false,
      reason: 'default_spool',
      message: 'The default spool cannot be starred: it is a buffer, not something you built.'
    }
  }

  if (target.isStarred) return { ok: true }

  const starred = spools.filter((spool) => spool.isStarred)
  if (starred.length >= STARRED_SPOOL_CAP) {
    return {
      ok: false,
      reason: 'star_cap',
      message: `${STARRED_SPOOL_CAP} spools are already starred. Unstar one first — nothing is deleted either way.`
    }
  }

  const starredBytes = starred.reduce((total, spool) => total + spool.bytes, 0)
  if (starredBytes + target.bytes > STARRED_BYTE_RESERVE) {
    return {
      ok: false,
      reason: 'reserve',
      message:
        `Starred spools may hold at most half the space Spool keeps for clips, and this would go ` +
        `past it. Nothing has been deleted — unstar something, or leave this one unstarred.`
    }
  }

  return { ok: true }
}

/** Bytes currently held by starred spools, which the reserve is measured against. */
export function starredBytes(spools: readonly StarrableSpool[]): number {
  return spools
    .filter((spool) => spool.isStarred)
    .reduce((total, spool) => total + spool.bytes, 0)
}

/**
 * Whether a starred spool has reached the reserve and must refuse further capture.
 *
 * Refusing capture is the same shape as a saved spool refusing at its clip cap: it stops, it says
 * so, and it deletes nothing (PLAN.md 3, Limits).
 */
export function starredReserveReached(spools: readonly StarrableSpool[]): boolean {
  return starredBytes(spools) >= STARRED_BYTE_RESERVE
}

/** Starred first, then the rest — the order every list uses (PLAN.md 10). */
export function starredFirst<T extends { isStarred: boolean; isDefault: boolean }>(
  spools: readonly T[]
): T[] {
  return [...spools].sort((a, b) => {
    // The default spool stays at the top: it is where copies land, and moving it would be a
    // surprise every time something is starred.
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1
    return 0
  })
}

/** What Clear spools would remove, and what it would spare (PLAN.md 10). */
export function clearableSpools<T extends { id: string; isStarred: boolean; isDefault: boolean }>(
  spools: readonly T[]
): { readonly clearing: T[]; readonly sparing: T[] } {
  return {
    clearing: spools.filter((spool) => !spool.isStarred && !spool.isDefault),
    sparing: spools.filter((spool) => spool.isStarred)
  }
}
