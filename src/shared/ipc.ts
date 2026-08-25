/**
 * The contract that crosses the contextBridge.
 *
 * Types only — no behaviour, no imports from either side. It exists because both processes have to
 * agree on the shape of what passes between them, and neither may import the other: the renderer
 * never reaches into main (PLAN.md 6), and main has no business importing renderer code. Main
 * projects its state into these shapes in `main/ipc/view.ts`; the renderer renders them.
 */

export type Mode = 'fifo' | 'lifo'

/**
 * `nothing_to_paste` is the odd one out: the decline categories are said once per session, but a
 * serve on an empty spool has to answer every time it is asked (PLAN.md 3).
 */
export type NoticeCategory =
  | 'file'
  | 'image'
  | 'unsupported'
  | 'size'
  | 'nothing_to_paste'
  /** Confirmation that a whole spool is on the clipboard, or that an arrangement was saved. */
  | 'pasted_spool'

export interface Notice {
  readonly category: NoticeCategory
  readonly message: string
}

export interface ClipView {
  readonly id: string
  readonly preview: string
  readonly capturedAt: string
  readonly sourceApp: string | null
}

export interface SpoolView {
  readonly name: string
  readonly mode: Mode
  readonly clips: readonly ClipView[]
  /** The clip the next serve will deliver, which the window marks (PLAN.md 1, invariant 6). */
  readonly cursorClipId: string | null
  readonly count: number
  readonly cap: number
}

/** The four choices offered by the consent prompt (PLAN.md 4). */
export type ConsentChoice = 'keep_once' | 'skip' | 'always_keep' | 'always_skip'

/** A clip held in memory, unwritten, while the user decides (PLAN.md 4). */
export interface PendingPrompt {
  /** 1 is what the application declared and is authoritative; 2 is a guess from shape. */
  readonly tier: 1 | 2
  readonly headline: string
  readonly detail: string
  /** Named so the standing-answer choices can say which application they apply to. */
  readonly sourceApp: string | null
  /** Seconds before the prompt answers itself with Skip. */
  readonly timeoutSeconds: number
}

/** What the privacy panel says Spool looks for, taken from the detectors themselves. */
export interface PrivacyFacts {
  readonly heuristics: ReadonlyArray<{ readonly label: string; readonly detail: string }>
  readonly consentTimeoutSeconds: number
  /** Where the encrypted store lives, or null while there is not one yet (M6). */
  readonly dataFilePath: string | null
  /** Every standing answer, so each can be revoked (PLAN.md 11, M9). */
  readonly sourceRules: readonly SourceRuleView[]
  readonly limits: LimitsView
}

/** Whether anything is being stored, and what to do when it is not (PLAN.md 11, M6). */
export interface StorageStatus {
  readonly available: boolean
  /** Plain-language explanation when storage is unavailable. */
  readonly reason: string | null
  /** Whether the only way forward is a fresh store, which the user has to choose. */
  readonly canStartFresh: boolean
  /** Where the encrypted file lives, once there is one. */
  readonly path: string | null
}

/** How clips are joined when a whole spool is pasted (PLAN.md 3). */
export type SeparatorKind = 'newline' | 'blank_line' | 'tab' | 'comma' | 'space' | 'none'

/** Which size the window is in (PLAN.md 8). */
export type WindowStateName = 'compact' | 'expanded'

/** Enough of a spool to list it. Choosing which one captures is M8. */
/** A standing per-application answer, listed so it can be revoked (PLAN.md 11, M9). */
export interface SourceRuleView {
  readonly sourceApp: string
  readonly action: 'always_keep' | 'always_skip'
}

/** The caps of PLAN.md 3, shown read-only so the user knows what they are. */
export interface LimitsView {
  readonly defaultSpoolClips: number
  readonly savedSpoolClips: number
  readonly savedSpools: number
  readonly clipBytes: number
  readonly storeBytes: number
}

export interface SpoolSummary {
  readonly id: string
  readonly name: string
  readonly count: number
  /** The spool that captures, serves, and is arranged. */
  readonly isActive: boolean
  /** The default spool can be cleared but never deleted — something has to catch a copy. */
  readonly isDefault: boolean
  /** How long clips live here, in hours, or null to keep them until removed (PLAN.md 11, M9). */
  readonly retentionHours: number | null
}

/** A joined result waiting on a yes, because it is large enough to be felt system-wide. */
export interface PendingJoin {
  readonly byteLength: number
  readonly clips: number
}

export interface AppState {
  readonly spool: SpoolView
  /** The most recent decline, shown until the next capture replaces it. */
  readonly notice: Notice | null
  /** Whether the clipboard listener is running, and why not when it is not. */
  readonly capture: { readonly available: boolean; readonly reason: string | null }
  /** A clip waiting on an answer, shown inline in the compact window (PLAN.md 4). */
  readonly prompt: PendingPrompt | null
  /** For the privacy panel, so its claims come from the code rather than from prose (PLAN.md 5f). */
  readonly privacy: PrivacyFacts
  readonly storage: StorageStatus
  readonly separator: SeparatorKind
  readonly spools: readonly SpoolSummary[]
  readonly pendingJoin: PendingJoin | null
}

/** The channel names, in one place so the two sides cannot drift apart. */
export const CHANNELS = {
  getState: 'spool:get-state',
  state: 'spool:state',
  answerConsent: 'spool:answer-consent',
  startFreshStore: 'spool:start-fresh-store',
  pasteWholeSpool: 'spool:paste-whole-spool',
  cancelWholeSpoolPaste: 'spool:cancel-whole-spool-paste',
  saveArrangement: 'spool:save-arrangement',
  createSpoolFromArrangement: 'spool:create-spool-from-arrangement',
  setSeparator: 'spool:set-separator',
  setWindowState: 'spool:set-window-state',
  createSpool: 'spool:create-spool',
  renameSpool: 'spool:rename-spool',
  deleteSpool: 'spool:delete-spool',
  setActiveSpool: 'spool:set-active-spool',
  setRetention: 'spool:set-retention',
  revokeSourceRule: 'spool:revoke-source-rule',
  setConsentTimeout: 'spool:set-consent-timeout',
  resetEverything: 'spool:reset-everything',
  deleteClip: 'spool:delete-clip',
  clearSpool: 'spool:clear-spool'
} as const
