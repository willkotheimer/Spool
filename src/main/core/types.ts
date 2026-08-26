/** The shapes the spool core operates on. No I/O, no Electron, no clock (PLAN.md 6). */

/** Which direction the cursor travels (PLAN.md 3). */
export type Mode = 'fifo' | 'lifo'

/**
 * Whether reaching the clip cap rolls or refuses (PLAN.md 3, Limits). The default spool is a
 * buffer and rolls; a saved spool is an artifact and refuses.
 */
export type SpoolKind = 'default' | 'saved'

/** One captured clipboard item. Text only in v1 (PLAN.md 4). */
export interface Clip {
  readonly id: string
  readonly content: string
  /** First ~120 characters, newlines collapsed (PLAN.md 7). */
  readonly preview: string
  readonly byteLength: number
  readonly sourceApp: string | null
  readonly wasFlagged: boolean
  /** ISO 8601. Passed in, never read from a clock in here. */
  readonly capturedAt: string
}

/**
 * A named, ordered list of clips with a mode and a cursor.
 *
 * The array is the order and the cursor is a clip **identity**, not an index — which is what makes
 * reorder and delete fall out correctly instead of needing special cases (PLAN.md 3).
 */
export interface Spool {
  readonly id: string
  readonly name: string
  readonly kind: SpoolKind
  readonly mode: Mode
  readonly clips: readonly Clip[]
  readonly cursorClipId: string | null
  /**
   * How long clips live on this spool, in hours, or null to keep them until the user removes them
   * (PLAN.md 11, M9). Null is the default and stays the default.
   */
  readonly retentionHours: number | null
  /**
   * When this spool was last served from, made active, or edited (PLAN.md 9). Null means it has
   * not been used since the column arrived, which the advisor treats as oldest.
   */
  readonly lastUsedAt: string | null
}

/** Why a capture did not happen. Every one of these is something the user is told (PLAN.md 3). */
export type CaptureRefusal = 'spool_full' | 'clip_too_large'

export type CaptureResult =
  | {
      readonly ok: true
      readonly spool: Spool
      /** Rolled out of the default buffer to make room. Empty for a saved spool, which refuses. */
      readonly evicted: readonly Clip[]
    }
  | {
      readonly ok: false
      readonly reason: CaptureRefusal
      /** Unchanged. A refusal never mutates the spool. */
      readonly spool: Spool
      readonly limit: number
    }

export type ServeResult =
  | { readonly ok: true; readonly clip: Clip; readonly spool: Spool }
  /** Nothing to paste (PLAN.md 3). */
  | { readonly ok: false; readonly reason: 'empty'; readonly spool: Spool }
