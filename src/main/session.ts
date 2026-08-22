import { randomUUID } from 'node:crypto'
import { captureSnapshot, type CaptureState } from './clipboard/capture'
import { loadClipboardWatcher, type ClipboardWatcher } from './clipboard/watcher'
import { createSpool } from './core/spool'
import type { ClipboardSnapshot } from './detect/admit'
import { emptyLedger } from './detect/notices'
import type { AppState } from '../shared/ipc'
import { toSpoolView } from './ipc/view'

/**
 * The live session: one default spool, held in memory (PLAN.md 11, M3 — restarting loses
 * everything, which is expected until M6).
 *
 * This is the only stateful object in the main process. It owns the capture state, hands snapshots
 * to the pure pipeline, and tells whoever is listening what changed. Decisions live in
 * `clipboard/capture.ts`; this is wiring.
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
    ledger: emptyLedger
  }

  private notice: AppState['notice'] = null
  private capture: AppState['capture'] = { available: false, reason: 'capture has not started yet' }
  private watcher: ClipboardWatcher | null = null
  private readonly listeners = new Set<(state: AppState) => void>()

  /** Start watching the clipboard. A watcher that will not load is reported, never swallowed. */
  startCapture(load = loadClipboardWatcher()): void {
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
