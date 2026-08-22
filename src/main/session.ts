import { randomUUID } from 'node:crypto'
import type { AppState, Notice } from '../shared/ipc'
import { captureSnapshot, type CaptureState } from './clipboard/capture'
import { loadClipboardWatcher, type ClipboardWatcher, type WatcherLoad } from './clipboard/watcher'
import { createSpool, serve, setMode } from './core/spool'
import type { Mode } from './core/types'
import type { ClipboardSnapshot } from './detect/admit'
import { emptyLedger, NOTHING_TO_PASTE } from './detect/notices'
import { toSpoolView } from './ipc/view'

/**
 * The live session: one default spool, held in memory (PLAN.md 11, M3 — restarting loses
 * everything, which is expected until M6).
 *
 * This is the only stateful object in the main process. It owns the capture state, hands snapshots
 * to the pure pipeline, and tells whoever is listening what changed. Decisions live in
 * `clipboard/capture.ts` and `core/`; this is wiring.
 */
export class Session {
  private state: CaptureState = {
    spool: createSpool({
      id: 'default',
      name: 'Default spool',
      kind: 'default',
      mode: 'fifo'
    }),
    lastCapturedText: null,
    ledger: emptyLedger,
    pendingSelfWrite: null
  }

  private notice: Notice | null = null
  private capture: AppState['capture'] = { available: false, reason: 'capture has not started yet' }
  private watcher: ClipboardWatcher | null = null
  private readonly listeners = new Set<(state: AppState) => void>()

  /**
   * `writeText` is injected rather than imported so that this class never reaches for Electron —
   * which is also what lets every rule below be tested without launching the app.
   */
  constructor(private readonly writeText: (text: string) => void) {}

  /** Start watching the clipboard. A watcher that will not load is reported, never swallowed. */
  startCapture(load: WatcherLoad = loadClipboardWatcher()): void {
    if (!load.ok) {
      this.capture = { available: false, reason: load.reason }
      this.publish()
      return
    }

    this.watcher = load.watcher
    this.watcher.start((snapshot) => this.onClipboardChange(snapshot))
    this.capture = { available: true, reason: null }
    this.publish()
  }

  stopCapture(): void {
    this.watcher?.stop()
    this.watcher = null
  }

  /** Exposed for the IPC layer and for tests, which drive it with snapshots directly. */
  onClipboardChange(snapshot: ClipboardSnapshot): void {
    const outcome = captureSnapshot(this.state, snapshot, {
      now: () => new Date().toISOString(),
      newId: () => randomUUID()
    })

    this.state = outcome.state

    // A notice stands until the next successful capture replaces it, so a decline the user did not
    // look at is not lost to the next copy.
    if (outcome.notice !== null) this.notice = outcome.notice
    else if (outcome.captured !== null) this.notice = null

    this.publish()
  }

  /**
   * Write the cursor's clip to the system clipboard and advance (PLAN.md 3). The user then presses
   * Ctrl+V themselves — this app synthesizes no keystrokes (PLAN.md 8).
   *
   * **Serving pastes; it does not pop.** The clip stays where it is, so a single serve can be
   * pasted as many times as the user likes.
   */
  serveNext(): void {
    const result = serve(this.state.spool)

    if (!result.ok) {
      this.notice = NOTHING_TO_PASTE
      this.publish()
      return
    }

    this.writeText(result.clip.content)

    // Remember what we just wrote so the clipboard change it causes is recognised as ours rather
    // than captured as a new copy (PLAN.md 11, M4).
    this.state = {
      ...this.state,
      spool: result.spool,
      pendingSelfWrite: result.clip.content
    }
    this.notice = null
    this.publish()
  }

  /** Change direction. The cursor stays on the clip it was on (PLAN.md 3). */
  toggleMode(): void {
    const next: Mode = this.state.spool.mode === 'fifo' ? 'lifo' : 'fifo'
    this.state = { ...this.state, spool: setMode(this.state.spool, next) }
    this.publish()
  }

  getState(): AppState {
    return {
      spool: toSpoolView(this.state.spool),
      notice: this.notice,
      capture: this.capture
    }
  }

  onChange(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(): void {
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }
}
