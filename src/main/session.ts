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
import {
  CLIP_BYTE_CAP,
  DEFAULT_SPOOL_CLIP_CAP,
  SAVED_SPOOL_CAP,
  SAVED_SPOOL_CLIP_CAP,
  STORE_BYTE_BUDGET
} from './core/limits'
import {
  bytesOverFloor,
  closestMeasure,
  describeMeasure,
  rankCandidates,
  shouldAdvise,
  shouldGate,
  type CapacityCandidate,
  type MeasureName
} from './core/capacity'
import { expireClips, isRetentionHours } from './core/retention'
import {
  canStar,
  clearableSpools,
  starredFirst,
  starredReserveReached,
  type StarrableSpool
} from './core/starring'
import { arrange, clear, createSpool, deleteClip, serve, setMode } from './core/spool'
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
   * Every spool except the active one, whose state lives in `this.state.spool` because that is what
   * the capture pipeline reads. `syncActive` keeps the two consistent.
   */
  private otherSpools: Spool[] = []

  /** How clips are joined when the whole spool is pasted, and what else the user has chosen. */
  private settings: { separator: SeparatorKind; consentTimeoutMs: number } = {
    separator: 'newline',
    consentTimeoutMs: CONSENT_TIMEOUT_MS
  }

  /** A joined result large enough to be felt system-wide, waiting on a yes (PLAN.md 3). */
  private pendingJoin: { text: string; byteLength: number; clips: number } | null = null

  /**
   * Capacity advice (PLAN.md 9). The modal is raised at most once per session per measure: a
   * dismissal snoozes that measure rather than hiding it forever, so the advisor cannot nag.
   */
  private capacityPrompt: MeasureName | null = null
  private snoozed = new Set<MeasureName>()
  private sizes: Array<{ spoolId: string; clips: number; bytes: number }> = []
  private storedBytes = 0

  /**
   * The user took the Pause capture door (PLAN.md 9). Deletes nothing: the listener simply stops
   * until they resume or free space another way. It exists because a modal whose only exits
   * destroy data is a data-loss hazard, and would read as hostile.
   */
  private paused = false

  /**
   * Nothing is captured until the privacy statement has been read (PLAN.md 11, M13). The default
   * is the cautious one: a build that somehow lost its settings collects nothing until asked again.
   */
  private firstRun = true

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
  attachStore(store: Store, activeSpoolId: string | null = null): void {
    this.store = store
    this.storage = { available: true, reason: null, canStartFresh: false, path: store.path }

    const stored = store.loadSpools()
    const restored = stored.find((spool) => spool.kind === 'default')
    const rules = store.loadSourceRules()

    this.otherSpools = stored.filter((spool) => spool.id !== (restored ?? this.state.spool).id)
    this.state = {
      ...this.state,
      spool: restored ?? this.state.spool,
      sourceRules: rules
    }
    // Age out anything that expired while the app was closed, before anything else sees it.
    const now = new Date()
    this.otherSpools = this.otherSpools.map((spool) => {
      const aged = expireOne(spool, now)
      if (aged !== spool) store.saveSpool(aged)
      return aged
    })
    this.state = { ...this.state, spool: expireOne(this.state.spool, now) }

    // Restore whichever spool was active, falling back to the default when the id is stale.
    const wanted = this.otherSpools.find((spool) => spool.id === activeSpoolId)
    if (wanted !== undefined) this.activate(wanted)

    this.savedSpool = this.state.spool
    this.savedRules = this.state.sourceRules

    // Count what is stored and, if a measure has already reached ninety per cent, say so on launch
    // rather than waiting for the next capture (PLAN.md 11, M10).
    this.refreshCapacity()

    this.publish()
  }

  /** Which spool captures, for the caller to remember across restarts. */
  getActiveSpoolId(): string {
    return this.state.spool.id
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
  /** The statement has been read. Capture may begin. */
  acknowledgePrivacy(): void {
    if (!this.firstRun) return

    this.firstRun = false
    this.publish()
  }

  /** Whether the statement still has to be shown, which the caller persists. */
  isFirstRun(): boolean {
    return this.firstRun
  }

  /** Set from stored settings at startup, before capture is offered. */
  setPrivacyAcknowledged(acknowledged: boolean): void {
    this.firstRun = !acknowledged
    this.publish()
  }

  onClipboardChange(snapshot: ClipboardSnapshot): void {
    // Before the statement is acknowledged the listener may be running, but nothing is kept. The
    // promise is made before anything is collected.
    if (this.firstRun) return

    // The floor, and the user's own pause. Both stop capture and nothing else: every stored clip
    // stays readable, servable, and reorderable throughout (invariant 8).
    if (this.paused) {
      this.notice = {
        category: 'unsupported',
        message: 'Capture is paused. Your clips are all still here — resume when you are ready.'
      }
      this.publish()
      return
    }

    if (this.atFloor()) {
      this.notice = {
        category: 'unsupported',
        message:
          'Spool is full, so new copies are not being kept. Everything already here still works — ' +
          'delete a spool or two, or pause capture.'
      }
      this.publish()
      return
    }

    // A starred spool that has reached the reserve stops accepting clips (PLAN.md 10). It refuses
    // and says so, exactly as a saved spool does at its clip cap, and deletes nothing.
    if (this.state.spool.isStarred && starredReserveReached(this.starrable())) {
      this.notice = {
        category: 'unsupported',
        message:
          'This starred spool has reached the half of your space that starred spools may hold. ' +
          'Nothing was deleted — unstar it, or capture into another spool.'
      }
      this.publish()
      return
    }

    const outcome = captureSnapshot(this.state, snapshot, this.deps)

    this.absorb(outcome)
    // Retention applies on capture as well as on launch, so a long session ages out too.
    this.expireActive()
    // A capture is the one moment the store reliably grows.
    if (outcome.captured !== null) this.refreshCapacity()
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
      spool: this.touch(result.spool),
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

    this.state = { ...this.state, spool: this.touch({ ...this.state.spool, clips: rearranged }) }
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
      cursorClipId: copied[0]?.id ?? null,
      retentionHours: null,
      lastUsedAt: new Date().toISOString(),
      isStarred: false
    }

    this.otherSpools = [...this.otherSpools, created]
    this.store?.saveSpool(created)
    this.notice = {
      category: 'pasted_spool',
      message: `Saved ${copied.length} clips as "${created.name}"`
    }
    this.publish()
  }

  /**
   * Make a spool, empty and ready to capture into (PLAN.md 11, M8).
   *
   * At the cap it refuses rather than evicting one, for the same reason a saved spool refuses at
   * its clip cap: nothing anyone built goes away to make room (PLAN.md 3, Limits).
   */
  createNamedSpool(name: string, newId: () => string = () => randomUUID()): string | null {
    if (this.allSpools().length >= SAVED_SPOOL_CAP) {
      this.notice = {
        category: 'unsupported',
        message: `That would be more than ${SAVED_SPOOL_CAP} spools. Delete one first.`
      }
      this.publish()
      return null
    }

    const created: Spool = createSpool({
      id: newId(),
      name: cleanName(name),
      kind: 'saved',
      mode: this.state.spool.mode
    })

    this.otherSpools = [...this.otherSpools, created]
    this.store?.saveSpool(created)
    this.setActiveSpool(created.id)
    return created.id
  }

  /** Rename a spool. Nothing else about it changes. */
  renameSpool(spoolId: string, name: string): void {
    const renamed = cleanName(name)

    if (spoolId === this.state.spool.id) {
      this.state = { ...this.state, spool: { ...this.state.spool, name: renamed } }
      this.store?.saveSpool(this.state.spool)
    } else {
      this.otherSpools = this.otherSpools.map((spool) =>
        spool.id === spoolId ? { ...spool, name: renamed } : spool
      )
      const spool = this.otherSpools.find((candidate) => candidate.id === spoolId)
      if (spool !== undefined) this.store?.saveSpool(spool)
    }

    this.publish()
  }

  /**
   * Delete a spool and every clip on it.
   *
   * **The default spool refuses**: it is the buffer everything is captured into when the user has
   * made no other choice, so there has to be one (PLAN.md 2). It can be cleared instead.
   */
  deleteSpool(spoolId: string): void {
    const target = this.allSpools().find((spool) => spool.id === spoolId)
    if (target === undefined || target.kind === 'default') return

    this.otherSpools = this.otherSpools.filter((spool) => spool.id !== spoolId)
    this.store?.deleteSpool(spoolId)

    // The active spool cannot be one that no longer exists. Switching away has to *discard* what
    // it leaves rather than keep it, which is the one way this differs from an ordinary switch.
    if (this.state.spool.id === spoolId) {
      const fallback = this.otherSpools.find((spool) => spool.kind === 'default')
      if (fallback !== undefined) this.activate(fallback, { keepLeaving: false })
    }

    this.publish()
  }

  /** Switch which spool captures, serves, and is arranged. */
  setActiveSpool(spoolId: string): void {
    if (spoolId === this.state.spool.id) return

    const next = this.otherSpools.find((spool) => spool.id === spoolId)
    if (next === undefined) return

    this.activate(next)
    this.publish()
  }

  /**
   * Remove one clip. The cursor moves per PLAN.md 3 — to the next clip in the mode's direction,
   * clamped to the nearest end — because deletion is something the user did, and the spool has to
   * stay usable afterwards.
   */
  deleteClip(clipId: string): void {
    this.state = { ...this.state, spool: deleteClip(this.state.spool, clipId) }
    this.publish()
  }

  /** Empty a spool without removing it. Available for the default spool, which cannot be deleted. */
  clearSpool(spoolId: string): void {
    if (spoolId === this.state.spool.id) {
      this.state = { ...this.state, spool: clear(this.state.spool) }
      // The next copy is not a duplicate of something that is no longer there.
      this.state = { ...this.state, lastCapturedText: null }
    } else {
      this.otherSpools = this.otherSpools.map((spool) =>
        spool.id === spoolId ? clear(spool) : spool
      )
      const spool = this.otherSpools.find((candidate) => candidate.id === spoolId)
      if (spool !== undefined) this.store?.saveSpool(spool)
    }

    this.publish()
  }

  /**
   * Set how long clips live on a spool (PLAN.md 11, M9), and apply it at once so the user sees the
   * effect of what they chose rather than waiting for the next capture to reveal it.
   */
  setRetention(spoolId: string, hours: number | null): void {
    if (!isRetentionHours(hours)) return

    if (spoolId === this.state.spool.id) {
      this.state = { ...this.state, spool: { ...this.state.spool, retentionHours: hours } }
      this.expireActive()
    } else {
      this.otherSpools = this.otherSpools.map((spool) =>
        spool.id === spoolId ? expireOne({ ...spool, retentionHours: hours }, new Date()) : spool
      )
      const spool = this.otherSpools.find((candidate) => candidate.id === spoolId)
      if (spool !== undefined) this.store?.saveSpool(spool)
    }

    this.publish()
  }

  /** Revoke a standing answer, so the next clip from that application asks again (PLAN.md 4). */
  revokeSourceRule(sourceApp: string): void {
    const rules = new Map(this.state.sourceRules)
    if (!rules.delete(sourceApp)) return

    this.state = { ...this.state, sourceRules: rules }
    this.publish()
  }

  /** How long a prompt waits before answering itself with Skip (PLAN.md 4). */
  setConsentTimeout(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 600) return

    this.settings = { ...this.settings, consentTimeoutMs: Math.round(seconds) * 1000 }
    this.publish()
  }

  getConsentTimeoutSeconds(): number {
    return Math.round(this.settings.consentTimeoutMs / 1000)
  }

  /** Close the store so its file can be removed. The failsafe needs the handle gone (M9). */
  closeStore(): void {
    this.store?.close()
    this.store = null
  }

  /**
   * Delete several spools at once, in one transaction (PLAN.md 9).
   *
   * Only ever what the user checked: nothing is reclaimed that someone did not choose, and there is
   * no undo buffer, because it would hold exactly the bytes they were trying to free (PLAN.md 12).
   */
  deleteSpools(spoolIds: readonly string[]): void {
    const removable = spoolIds.filter((id) => {
      const spool = this.allSpools().find((candidate) => candidate.id === id)
      return (
        spool !== undefined &&
        spool.kind !== 'default' &&
        // Starred spools are not deletable this way. Only the user unstars, and only Reset
        // everything overrides it (PLAN.md 10).
        !spool.isStarred &&
        spool.id !== this.state.spool.id
      )
    })
    if (removable.length === 0) return

    this.otherSpools = this.otherSpools.filter((spool) => !removable.includes(spool.id))
    this.store?.deleteSpools(removable)
    this.capacityPrompt = null
    // Recounting is what lifts the gate: enough deleted, and capture is on again at once.
    this.refreshCapacity()
    this.publish()
  }

  /**
   * Pause capture (PLAN.md 9): the door that deletes nothing.
   *
   * The listener stops and the tray says so, until the user resumes or frees space another way.
   */
  pauseCapture(): void {
    this.paused = true
    this.capacityPrompt = null
    this.publish()
  }

  /** Resume, whether it was paused deliberately or the store simply dropped back under. */
  resumeCapture(): void {
    this.paused = false
    this.publish()
  }

  isPaused(): boolean {
    return this.paused
  }

  /** Whether the store has reached the floor, where capture stops (PLAN.md 9). */
  private atFloor(): boolean {
    return shouldGate(closestMeasure(this.capacitySnapshot()))
  }

  /** Not now: nothing is deleted, and this measure stays quiet until the floor (PLAN.md 9). */
  dismissCapacityAdvice(): void {
    if (this.capacityPrompt !== null) this.snoozed.add(this.capacityPrompt)
    this.capacityPrompt = null
    this.publish()
  }

  /**
   * Star or unstar a spool (PLAN.md 10).
   *
   * Starring is the commitment and can be refused — by the five-star cap, by the reserve, or
   * because it is the default spool — always with a message naming the limit and never deleting
   * anything. **Unstarring is always available and never asks for confirmation**: releasing a
   * promise is not the same act as making one.
   */
  setStarred(spoolId: string, starred: boolean): void {
    const target = this.allSpools().find((spool) => spool.id === spoolId)
    if (target === undefined || target.isStarred === starred) return

    if (starred) {
      const decision = canStar(this.starrable(), spoolId)
      if (!decision.ok) {
        this.notice = { category: 'unsupported', message: decision.message }
        this.publish()
        return
      }
    }

    this.replaceSpool(spoolId, (spool) => ({ ...spool, isStarred: starred }))
    this.publish()
  }

  /**
   * Clear spools: deletes unstarred spools and spares the starred ones (PLAN.md 10).
   *
   * The everyday command, as distinct from Reset everything — which is the only operation that
   * touches a starred spool without it being unstarred first.
   */
  clearSpools(): void {
    const { clearing } = clearableSpools(
      this.allSpools().map((spool) => ({
        id: spool.id,
        isStarred: spool.isStarred,
        isDefault: spool.kind === 'default'
      }))
    )

    const removable = clearing
      .map((spool) => spool.id)
      .filter((id) => id !== this.state.spool.id)
    if (removable.length === 0) return

    this.otherSpools = this.otherSpools.filter((spool) => !removable.includes(spool.id))
    this.store?.deleteSpools(removable)
    this.refreshCapacity()
    this.publish()
  }

  /** Change direction. The cursor stays on the clip it was on (PLAN.md 3). */
  toggleMode(): void {
    const next: Mode = this.state.spool.mode === 'fifo' ? 'lifo' : 'fifo'
    this.state = { ...this.state, spool: this.touch(setMode(this.state.spool, next)) }
    this.publish()
  }

  /** Apply the active spool's retention limit, publishing only if something actually went. */
  private expireActive(): void {
    const aged = expireOne(this.state.spool, new Date())
    if (aged === this.state.spool) return

    this.state = { ...this.state, spool: aged }
    this.publish()
  }

  /** Re-count what the store holds, and speak if a measure has reached the advisory level. */
  private refreshCapacity(): void {
    if (this.store === null) return

    this.sizes = this.store.spoolSizes()
    this.storedBytes = this.store.storeBytes()

    const measure = closestMeasure(this.capacitySnapshot())

    if (shouldGate(measure)) {
      // The floor ignores the snooze: dismissing at 90% buys quiet until here, and no further.
      // Pausing is what closes this one, and freeing space is what ends it.
      if (!this.paused) this.capacityPrompt = measure.name
      return
    }

    // Back under the floor: capture resumes at once, with no restart, however it was stopped.
    if (this.paused) this.paused = false

    if (shouldAdvise(measure) && !this.snoozed.has(measure.name)) {
      this.capacityPrompt = measure.name
    }
  }

  private capacitySnapshot() {
    return {
      storeBytes: this.storedBytes,
      savedSpools: this.allSpools().filter((spool) => spool.kind !== 'default').length,
      clipsInActiveSpool: this.state.spool.clips.length
    }
  }

  /** Every spool the advisor could offer, with what it holds. */
  private capacityCandidates(): CapacityCandidate[] {
    const sizeOf = new Map(this.sizes.map((size) => [size.spoolId, size]))

    return this.allSpools().map((spool) => {
      const size = sizeOf.get(spool.id)
      return {
        id: spool.id,
        name: spool.name,
        clips: size?.clips ?? spool.clips.length,
        bytes:
          size?.bytes ?? spool.clips.reduce((total, clip) => total + clip.byteLength, 0),
        lastUsedAt: spool.lastUsedAt,
        // A starred spool is never a candidate, at any threshold: the app does not ask for a
        // promise back under pressure (PLAN.md 10).
        isDefault: spool.kind === 'default' || spool.isStarred,
        isActive: spool.id === this.state.spool.id
      }
    })
  }

  /** Mark a spool as used now, which is what the advisor ranks by (PLAN.md 9). */
  private touch(spool: Spool): Spool {
    return { ...spool, lastUsedAt: new Date().toISOString() }
  }

  /** Every spool with what it holds, which is what the star rules are measured against. */
  private starrable(): StarrableSpool[] {
    const sizeOf = new Map(this.sizes.map((size) => [size.spoolId, size.bytes]))

    return this.allSpools().map((spool) => ({
      id: spool.id,
      isDefault: spool.kind === 'default',
      isStarred: spool.isStarred,
      bytes:
        sizeOf.get(spool.id) ??
        spool.clips.reduce((total, clip) => total + clip.byteLength, 0)
    }))
  }

  /** Edit one spool, whether it is the active one or not, and write it through. */
  private replaceSpool(spoolId: string, change: (spool: Spool) => Spool): void {
    if (spoolId === this.state.spool.id) {
      this.state = { ...this.state, spool: change(this.state.spool) }
      this.store?.saveSpool(this.state.spool)
      this.savedSpool = this.state.spool
      return
    }

    this.otherSpools = this.otherSpools.map((spool) =>
      spool.id === spoolId ? change(spool) : spool
    )
    const changed = this.otherSpools.find((spool) => spool.id === spoolId)
    if (changed !== undefined) this.store?.saveSpool(changed)
  }

  private allSpools(): Spool[] {
    return [this.state.spool, ...this.otherSpools]
  }

  /**
   * Swap which spool the pipeline is working on.
   *
   * `keepLeaving` is false in exactly one case — the active spool has just been deleted, and
   * putting it back would undo the deletion the user asked for.
   */
  private activate(next: Spool, { keepLeaving = true }: { keepLeaving?: boolean } = {}): void {
    const leaving = this.state.spool
    const remaining = this.otherSpools.filter((spool) => spool.id !== next.id)

    this.otherSpools = keepLeaving ? [...remaining, leaving] : remaining
    // Duplicate suppression compares against the last capture *in this spool*, so it resets.
    this.state = { ...this.state, spool: this.touch(next), lastCapturedText: null }
    this.savedSpool = null
  }

  getState(): AppState {
    return {
      spool: toSpoolView(this.state.spool),
      notice: this.notice,
      capture: this.capture,
      storage: this.storage,
      separator: this.settings.separator,
      spools: starredFirst(
        this.allSpools().map((spool) => ({
          id: spool.id,
          name: spool.name,
          count: spool.clips.length,
          isActive: spool.id === this.state.spool.id,
          isDefault: spool.kind === 'default',
          retentionHours: spool.retentionHours,
          isStarred: spool.isStarred
        }))
      ),
      pendingJoin:
        this.pendingJoin === null
          ? null
          : { byteLength: this.pendingJoin.byteLength, clips: this.pendingJoin.clips },
      capacity: this.capacityView(),
      firstRun: this.firstRun,
      prompt: this.promptView(),
      privacy: {
        heuristics: HEURISTIC_RULES,
        consentTimeoutSeconds: Math.round(this.settings.consentTimeoutMs / 1000),
        sourceRules: [...this.state.sourceRules].map(([sourceApp, action]) => ({
          sourceApp,
          action
        })),
        limits: {
          defaultSpoolClips: DEFAULT_SPOOL_CLIP_CAP,
          savedSpoolClips: SAVED_SPOOL_CLIP_CAP,
          savedSpools: SAVED_SPOOL_CAP,
          clipBytes: CLIP_BYTE_CAP,
          storeBytes: STORE_BYTE_BUDGET
        },
        dataFilePath: this.storage.path
      }
    }
  }

  /** What the modal and the Storage panel both read (PLAN.md 9). */
  private capacityView() {
    const measure = closestMeasure(this.capacitySnapshot())
    const gated = shouldGate(measure)
    // At the floor the question is what frees the most, fastest; at 90% it is what the user has
    // finished with. That difference in ordering is the point (PLAN.md 9).
    const ranked = rankCandidates(this.capacityCandidates(), gated ? 'largest' : 'oldest_used')

    return {
      measure: measure.name,
      used: measure.used,
      cap: measure.cap,
      ratio: measure.ratio,
      description: describeMeasure(measure),
      advising: shouldAdvise(measure),
      gated,
      paused: this.paused,
      overFloorBytes: bytesOverFloor(this.storedBytes, STORE_BYTE_BUDGET),
      prompting: this.capacityPrompt !== null,
      candidates: ranked.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        clips: candidate.clips,
        bytes: candidate.bytes,
        lastUsedAt: candidate.lastUsedAt
      }))
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
      timeoutSeconds: Math.round(this.settings.consentTimeoutMs / 1000)
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
      }, this.settings.consentTimeoutMs)
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

/** A spool always has a name, even when the user did not give it one. */
function cleanName(name: string): string {
  const trimmed = name.trim()
  return trimmed.length === 0 ? 'New spool' : trimmed
}

/** Apply one spool's retention limit, returning the same object when nothing aged out. */
function expireOne(spool: Spool, now: Date): Spool {
  const { spool: aged, expired } = expireClips(spool, spool.retentionHours, now)
  return expired.length === 0 ? spool : aged
}
