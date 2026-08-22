/**
 * The contract that crosses the contextBridge.
 *
 * Types only — no behaviour, no imports from either side. It exists because both processes have to
 * agree on the shape of what passes between them, and neither may import the other: the renderer
 * never reaches into main (PLAN.md 6), and main has no business importing renderer code. Main
 * projects its state into these shapes in `main/ipc/view.ts`; the renderer renders them.
 */

export type Mode = 'fifo' | 'lifo'

export type NoticeCategory = 'file' | 'image' | 'unsupported' | 'size'

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

export interface AppState {
  readonly spool: SpoolView
  /** The most recent decline, shown until the next capture replaces it. */
  readonly notice: Notice | null
  /** Whether the clipboard listener is running, and why not when it is not. */
  readonly capture: { readonly available: boolean; readonly reason: string | null }
}

/** The channel names, in one place so the two sides cannot drift apart. */
export const CHANNELS = {
  getState: 'spool:get-state',
  state: 'spool:state'
} as const
