import { SAVED_SPOOL_CAP, SAVED_SPOOL_CLIP_CAP, STORE_BYTE_BUDGET } from './limits'

/**
 * The capacity advisor (PLAN.md 9).
 *
 * A saved spool that refuses new captures is a wall. This exists so the user meets a recommendation
 * long before they meet the wall, and it takes the same shape as the consent prompt of PLAN.md 4:
 * the app detects, the app asks, the user decides, the app obeys. **Nothing is ever reclaimed that
 * someone did not choose** — there is no automatic deletion anywhere in here.
 *
 * Pure: measures in, recommendation out. No store, no clock beyond what is handed over.
 */

/** The three measures, each against a hard cap from PLAN.md 3, Limits. */
export type MeasureName = 'bytes' | 'spools' | 'clips'

export const ADVISE_AT = 0.9
export const GATE_AT = 0.95

export interface Measure {
  readonly name: MeasureName
  readonly used: number
  readonly cap: number
  /** Used over cap. Above 1 is possible: a cap can be crossed by a clip that was already allowed. */
  readonly ratio: number
}

/** What the advisor is looking at when it decides whether to speak. */
export interface CapacitySnapshot {
  /** Bytes held by every clip in the store. */
  readonly storeBytes: number
  /** Saved spools, which the default spool is not one of. */
  readonly savedSpools: number
  /** Clips in the spool being captured into. */
  readonly clipsInActiveSpool: number
}

export function measures(snapshot: CapacitySnapshot): Measure[] {
  return [
    measure('bytes', snapshot.storeBytes, STORE_BYTE_BUDGET),
    measure('spools', snapshot.savedSpools, SAVED_SPOOL_CAP),
    measure('clips', snapshot.clipsInActiveSpool, SAVED_SPOOL_CLIP_CAP)
  ]
}

function measure(name: MeasureName, used: number, cap: number): Measure {
  return { name, used, cap, ratio: cap === 0 ? 0 : used / cap }
}

/**
 * The measure closest to its cap — the one the advisor watches, and the one the modal names.
 * "You're at 90%" without saying of what is not a usable message (PLAN.md 9).
 */
export function closestMeasure(snapshot: CapacitySnapshot): Measure {
  return measures(snapshot).reduce((closest, candidate) =>
    candidate.ratio > closest.ratio ? candidate : closest
  )
}

/** How the measure reads in the modal's first line. */
export function describeMeasure(measure: Measure): string {
  switch (measure.name) {
    case 'bytes':
      return `${formatBytes(measure.used)} of the ${formatBytes(measure.cap)} this app keeps for clips`
    case 'spools':
      return `${measure.used} of ${measure.cap} saved spools`
    case 'clips':
      return `${measure.used} of ${measure.cap} clips in the spool you are capturing into`
  }
}

export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib >= 1) return `${Math.round(mib)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Enough of a spool for the advisor to rank and describe it. */
export interface CapacityCandidate {
  readonly id: string
  readonly name: string
  readonly clips: number
  readonly bytes: number
  /** ISO 8601, or null for a spool that has never been used since the column arrived. */
  readonly lastUsedAt: string | null
  readonly isDefault: boolean
  readonly isActive: boolean
}

/**
 * Which spools to offer, and in which order.
 *
 * **The default spool and the active one are never proposed** (PLAN.md 9): one is where copies land
 * when the user has chosen nothing else, and the other is what they are working in right now.
 *
 * Order differs by threshold, and the difference is the point. At 90% the question is "what have
 * you finished with", so it is oldest-used first. At the 95% floor the question is "what frees the
 * most, fastest", so it is largest first.
 */
export function rankCandidates(
  spools: readonly CapacityCandidate[],
  order: 'oldest_used' | 'largest' = 'oldest_used'
): CapacityCandidate[] {
  const eligible = spools.filter((spool) => !spool.isDefault && !spool.isActive)

  if (order === 'largest') {
    return [...eligible].sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name))
  }

  // Never used sorts oldest: a spool with no recorded use is the least likely to be missed.
  return [...eligible].sort((a, b) => {
    const left = a.lastUsedAt === null ? 0 : Date.parse(a.lastUsedAt)
    const right = b.lastUsedAt === null ? 0 : Date.parse(b.lastUsedAt)
    return left - right || a.name.localeCompare(b.name)
  })
}

/** What deleting a selection would free, which the modal shows as a running total. */
export function freedBy(
  candidates: readonly CapacityCandidate[],
  selectedIds: readonly string[]
): { spools: number; bytes: number } {
  const selected = new Set(selectedIds)
  const chosen = candidates.filter((candidate) => selected.has(candidate.id))

  return {
    spools: chosen.length,
    bytes: chosen.reduce((total, candidate) => total + candidate.bytes, 0)
  }
}

/** Whether a measure has reached the level at which the advisor speaks. */
export function shouldAdvise(measure: Measure): boolean {
  return measure.ratio >= ADVISE_AT
}

/**
 * Whether a measure has reached the floor, where the app stops accepting new clips (PLAN.md 9).
 *
 * **The only hard gate in the app, and deliberately narrow: it suspends capture only.** Every
 * stored clip stays readable, servable, and reorderable — invariant 8, and what keeps a quota from
 * taking someone's own work away from them.
 */
export function shouldGate(measure: Measure): boolean {
  return measure.ratio >= GATE_AT
}

/**
 * How much has to go to get back under the floor.
 *
 * The reserve of PLAN.md 10 is what makes this always solvable without touching a star: starred
 * usage is capped at half the budget and the floor is at 95%, so at least 45% of the budget is
 * non-starred and reclaimable.
 */
export function bytesOverFloor(storeBytes: number, cap: number): number {
  return Math.max(Math.ceil(storeBytes - cap * GATE_AT), 0)
}
