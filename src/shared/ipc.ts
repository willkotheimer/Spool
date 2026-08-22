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
export type NoticeCategory = 'file' | 'image' | 'unsupported' | 'size' | 'nothing_to_paste'

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
}

/** The channel names, in one place so the two sides cannot drift apart. */
export const CHANNELS = {
  getState: 'spool:get-state',
  state: 'spool:state',
  answerConsent: 'spool:answer-consent'
} as const
