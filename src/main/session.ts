import { randomUUID } from 'node:crypto'
import type {
  AppState,
  ConsentChoice,
  Notice,
  PendingPrompt,
  StorageStatus
} from '../shared/ipc'
import {
  captureSnapshot,
  initialCaptureState,
  keep,
  type CaptureOutcome,
  type CaptureState,
  type PendingConsent
} from './clipboard/capture'
import { loadClipboardWatcher, type ClipboardWatcher, type WatcherLoad } from './clipboard/watcher'
import { isSeparatorKind, joinSpool, needsConfirmation, type SeparatorKind } from './core/join'
import { arrange, createSpool, serve, setMode } from './core/spool'
import type { Clip, Mode, Spool } from './core/types'
import type { ClipboardSnapshot } from './detect/admit'
import { wipe } from './detect/bytes'
import {
  CONSENT_TIMEOUT_MS,
  keepsTheClip,
  promptWording,
  ruleFromChoice
} from './detect/consent'
import { emptyLedger, NOTHING_TO_PASTE } from './detect/notices'
import { HEURISTIC_RULES } from './detect/sensitivity'
import { toSpoolView } from './ipc/view'
import type { Store } from './store'

/**
 * The live session: one default spool, held in memory (PLAN.md 11, M3 — restarting loses
 * everything, which is expected until M6).
 *
 * This is the only stateful object in the main process. It owns the capture state, hands snapshots
 * to the pure pipeline, and tells whoever is listening what changed. Decisions live in
 * `clipboard/capture.ts` and `core/`; this is wiring.
 */
export class Session {
  private state: CaptureState = initialCaptureState(
    createSpool({ id: 'default', name: 'Default spool', kind: 'default', mode: 'fifo' }),
    emptyLedger
  )

  private notice: Notice | null = null
  private capture: AppState['capture'] = { available: false, reason: 'capture has not started yet' }
  private watcher: ClipboardWatcher | null = null
  private readonly listeners = new Set<(state: AppState) => void>()

  /** The clip waiting on an answer, held as bytes so that declining can wipe it (PLAN.md 4). */
  private pending: PendingConsent | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Spools other than the active one. At M7 these can only be created by "save as a new spool";
   * choosing which one captures and serves is M8, and this list is what that will select from.
   */
  private otherSpools: Spool[] = []

  /** How clips are joined when the whole spool is pasted, and what else the user has chosen. */
  private settings: { separator: SeparatorKind } = { separator: 'newline' }

  /** A joined result large enough to be felt system-wide, waiting on a yes (PLAN.md 3). */
  private pendingJoin: { text: string; byteLength: number; clips: number } | null = null

  /** Where state is written through to. Null means this session keeps nothing (PLAN.md 11, M6). */
  private store: Store | null = null
  private storage: StorageStatus = {
    available: false,
    reason: 'storage has not started yet',
    canStartFresh: false,
    path: null
  }
  /** What was last written, so a publish that changed nothing does not write anything. */
  private savedSpool: CaptureState['spool'] | null = null
  private savedRules: CaptureState['sourceRules'] | null = null

  /**
   * `writeText` is injected rather than imported so that this class never reaches for Electron —
   * which is also what lets every rule below be tested without launching the app.
   */
  constructor(private readonly writeText: (text: string) => void) {}

  /**
   * Attach a store and restore what it holds (PLAN.md 11, M6). Everything the user had — clips,
   * cursor, mode, and standing answers — comes back as it was.
   */
  attachStore(store: Store): void {
    this.store = store
    this.storage = { available: true, reason: null, canStartFresh: false, path: store.path }

    const stored = store.loadSpools()
    const restored = stored.find((spool) => spool.kind === 'default')
    const rules = store.loadSourceRules()

    this.otherSpools = stored.filter((spool) => spool.kind !== 'default')
    this.state = {
      ...this.state,
      spool: restored ?? this.state.spool,
      sourceRules: rules
    }
    this.savedSpool = this.state.spool
    this.savedRules = this.state.sourceRules

    this.publish()
  }

  /** Say why nothing is being stored, so the window can offer whatever way out there is. */
  reportStorageFailure(status: Omit<StorageStatus, 'available' | 'path'>): void {
    this.storage = { available: false, path: null, ...status }
    this.publish()
  }

  detachStore(): void {
    this.store?.close()
    this.store = null
  }

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
    this.clearPending()
  }

  /** Exposed for the IPC layer and for tests, which drive it with snapshots directly. */
  onClipboardChange(snapshot: ClipboardSnapshot): void {
    const outcome = captureSnapshot(this.state, snapshot, this.deps)

    this.absorb(outcome)
  }

  /**
   * Answer the prompt (PLAN.md 4). Keep files the clip; Skip wipes the bytes; the two "always"
   * choices do the same and leave a standing answer for that application behind.
   *
   * Nothing here is permanent and nothing is forbidden — a user who wants to store a password can
   * store a password (invariant 3).
   */
  answerConsent(choice: ConsentChoice): void {
    const pending = this.pending
    if (pending === null) return

    // Only the timer is cancelled here. Clearing would wipe the bytes, and Keep still needs them:
    // they are wiped below, once the clip has been filed.
    this.cancelPendingTimer()
    this.pending = null

    const rule = ruleFromChoice(choice)
    if (rule !== null && pending.sourceApp !== null) {
      this.state = {
        ...this.state,
        sourceRules: new Map(this.state.sourceRules).set(pending.sourceApp, rule)
      }
    }

    if (keepsTheClip(choice)) {
      this.absorb(
        keep(this.state, pending.bytes, pending.sourceApp, true, this.deps, null, pending.capturedAt)
      )
    } else {
      this.publish()
    }

    // Wiped either way: once the clip is a string in the spool, the buffer that carried it there
    // has no further use, and leaving a copy of a secret lying around is the thing being avoided.
    wipe(pending.bytes)
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

  /**
   * Write the whole spool to the clipboard as one item (PLAN.md 3).
   *
   * Position order travelling in the mode's direction, **always from the beginning** — "paste
   * everything" means everything — and the cursor does not move, because this is a bulk read
   * rather than a traversal. Above 10 MiB it asks first: the clipboard is shared with every
   * application on the machine.
   */
  pasteWholeSpool(confirmed = false): void {
    const joined = joinSpool(this.state.spool, this.settings.separator)

    if (!joined.ok) {
      this.notice = NOTHING_TO_PASTE
      this.publish()
      return
    }

    if (!confirmed && needsConfirmation(joined.byteLength)) {
      this.pendingJoin = joined
      this.publish()
      return
    }

    this.pendingJoin = null
    this.writeText(joined.text)

    // The joined text must not come back as a new clip, which would be a spool that doubles itself
    // every time it is used (PLAN.md 3). This is M4's suppression, holding against a payload that
    // matches no single clip.
    this.state = { ...this.state, pendingSelfWrite: joined.text }
    this.notice = {
      category: 'pasted_spool',
      message: `${joined.clips} clips are on the clipboard, ready to paste`
    }
    this.publish()
  }

  /** Abandon a whole-spool paste the user was asked to confirm. */
  cancelWholeSpoolPaste(): void {
    this.pendingJoin = null
    this.publish()
  }

  setSeparator(separator: SeparatorKind): void {
    // Anything crossing the bridge is checked here rather than trusted: the renderer is not the
    // authority on what a separator is.
    if (!isSeparatorKind(separator)) return

    this.settings = { ...this.settings, separator }
    this.publish()
  }

  getSeparator(): SeparatorKind {
    return this.settings.separator
  }

  /**
   * Apply an arrangement to the active spool (PLAN.md 11, M7).
   *
   * The order arrives as clip ids, so the renderer never has to know about positions — and the
   * cursor follows the clip it pointed at, wherever it lands, because it is an identity (PLAN.md 3).
   */
  saveArrangement(clipIds: readonly string[]): void {
    const rearranged = arrange(this.state.spool.clips, clipIds)
    if (rearranged === null) return

    this.state = { ...this.state, spool: { ...this.state.spool, clips: rearranged } }
    this.publish()
  }

  /**
   * Save an arrangement as a *new* named spool, leaving the original untouched (PLAN.md 13, 1).
   *
   * Read as: keep what you have, and keep this arrangement of it too.
   */
  createSpoolFromArrangement(name: string, clipIds: readonly string[], newId: () => string = () => randomUUID()): void {
    const rearranged = arrange(this.state.spool.clips, clipIds)
    if (rearranged === null) return

    const copied = rearranged.map((clip): Clip => ({ ...clip, id: newId() }))
    const created: Spool = {
      id: newId(),
      name: name.trim().length === 0 ? 'New spool' : name.trim(),
      kind: 'saved',
      mode: this.state.spool.mode,
      clips: copied,
      cursorClipId: copied[0]?.id ?? null
    }

    this.otherSpools = [...this.otherSpools, created]
    this.store?.saveSpool(created)
    this.notice = {
      category: 'pasted_spool',
      message: `Saved ${copied.length} clips as "${created.name}"`
    }
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
      capture: this.capture,
      storage: this.storage,
      separator: this.settings.separator,
      spools: [
        { id: this.state.spool.id, name: this.state.spool.name, count: this.state.spool.clips.length, isActive: true },
        ...this.otherSpools.map((spool) => ({
          id: spool.id,
          name: spool.name,
          count: spool.clips.length,
          isActive: false
        }))
      ],
      pendingJoin:
        this.pendingJoin === null
          ? null
          : { byteLength: this.pendingJoin.byteLength, clips: this.pendingJoin.clips },
      prompt: this.promptView(),
      privacy: {
        heuristics: HEURISTIC_RULES,
        consentTimeoutSeconds: Math.round(CONSENT_TIMEOUT_MS / 1000),
        dataFilePath: this.storage.path
      }
    }
  }

  private promptView(): PendingPrompt | null {
    if (this.pending === null) return null

    const { headline, detail } = promptWording(this.pending.sensitivity, this.pending.sourceApp)
    return {
      tier: this.pending.sensitivity.tier,
      headline,
      detail,
      sourceApp: this.pending.sourceApp,
      timeoutSeconds: Math.round(CONSENT_TIMEOUT_MS / 1000)
    }
  }

  /** Take an outcome from the pipeline and become it. */
  private absorb(outcome: CaptureOutcome): void {
    this.state = outcome.state

    if (outcome.pending !== null) {
      // A new copy while a prompt is open supersedes it: the user moved on, and the safe reading
      // of an unanswered prompt is Skip (PLAN.md 4). The superseded bytes go now.
      this.clearPending()
      this.pending = outcome.pending
      this.pendingTimer = setTimeout(() => {
        // When nobody is at the keyboard, the safe default is not to write.
        this.answerConsent('skip')
      }, CONSENT_TIMEOUT_MS)
    }

    // A notice stands until the next successful capture replaces it, so a decline the user did not
    // look at is not lost to the next copy.
    if (outcome.notice !== null) this.notice = outcome.notice
    else if (outcome.captured !== null) this.notice = null

    this.publish()
  }

  private cancelPendingTimer(): void {
    if (this.pendingTimer !== null) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
  }

  /** Drop the pending clip and its timer, wiping the bytes it was holding. */
  private clearPending(): void {
    this.cancelPendingTimer()
    if (this.pending !== null) {
      wipe(this.pending.bytes)
      this.pending = null
    }
  }

  private readonly deps = {
    now: () => new Date().toISOString(),
    newId: () => randomUUID()
  }

  onChange(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private publish(): void {
    this.persist()
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }

  /**
   * Write through what changed. The state is immutable, so an identity check is enough to tell a
   * real mutation from a publish that only moved a notice around.
   */
  private persist(): void {
    if (this.store === null) return

    if (this.state.spool !== this.savedSpool) {
      this.store.saveSpool(this.state.spool)
      this.savedSpool = this.state.spool
    }
    if (this.state.sourceRules !== this.savedRules) {
      this.store.saveSourceRules(this.state.sourceRules)
      this.savedRules = this.state.sourceRules
    }
  }
}
