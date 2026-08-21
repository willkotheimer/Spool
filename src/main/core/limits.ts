/**
 * The caps of PLAN.md 3, Limits. Compile-time constants, shown read-only in settings, not raisable
 * by the user in v1. They live here because they are pure logic — the store enforces nothing.
 */

/** The default spool is a buffer: things flow through it, and eviction is what a buffer is for. */
export const DEFAULT_SPOOL_CLIP_CAP = 50

/** A saved spool is an artifact someone built. At its cap it refuses rather than discarding work. */
export const SAVED_SPOOL_CLIP_CAP = 100

/** Creating another saved spool past this requires deleting one. Enforced by the store, at M8. */
export const SAVED_SPOOL_CAP = 50

/** A clip larger than this is not captured, and the user is told what was skipped and why. */
export const CLIP_BYTE_CAP = 1024 * 1024

/** The whole store's budget. The capacity advisor of PLAN.md 9 steps in well before it. */
export const STORE_BYTE_BUDGET = 512 * 1024 * 1024

/** Star another by unstarring one first. Arrives at M11. */
export const STARRED_SPOOL_CAP = 5

/** The share of the budget starred spools may hold, which keeps the capacity floor solvable. */
export const STARRED_BUDGET_SHARE = 0.5

/** How many characters of a clip the preview keeps (PLAN.md 7). */
export const PREVIEW_LENGTH = 120
