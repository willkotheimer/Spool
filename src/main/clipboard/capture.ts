import { createClip } from '../core/clip'
import { CLIP_BYTE_CAP } from '../core/limits'
import { capture } from '../core/spool'
import type { Clip, Spool } from '../core/types'
import { admit, type ClipboardSnapshot } from '../detect/admit'
import { wipe } from '../detect/bytes'
import { decideConsent, noSourceRules, type SourceRules } from '../detect/consent'
import { categoryForDecline, noticeFor, type Notice, type NoticeLedger } from '../detect/notices'
import { classify, type Sensitivity } from '../detect/sensitivity'

/**
 * The capture pipeline (PLAN.md 11, M3 and M5): one clipboard change in, one decision out.
 *
 * Pure but for the two functions it is handed — identity and time come from the caller, exactly as
 * they do in `core/`. The watcher supplies snapshots and the session holds the state; everything
 * between those two is here, where it can be tested without a clipboard.
 *
 * **Content is bytes until the moment it is kept.** The format check runs first, then the
 * sensitivity check, and only a clip that is going to be stored is ever turned into a string — a
 * JavaScript string cannot be wiped, so a declined secret must never become one (PLAN.md 4).
 */

/** Everything a capture decision reads, and everything it can change. */
export interface CaptureState {
  readonly spool: Spool
  /** The last text actually captured, for consecutive-duplicate suppression. */
  readonly lastCapturedText: string | null
  /** Which decline categories have already been mentioned this session. */
  readonly ledger: NoticeLedger
  /**
   * What this app just wrote to the clipboard by serving, waiting to be recognised on its way back
   * (PLAN.md 11, M4). Serving writes to the clipboard, which fires the very listener M3 built — so
   * without this a serve re-captures its own clip as though the user had copied it.
   */
  readonly pendingSelfWrite: string | null
  /** Standing per-application answers to the prompt (PLAN.md 4). In memory until M6. */
  readonly sourceRules: SourceRules
}

/** A clip held in memory, unwritten, while the user decides (PLAN.md 4). */
export interface PendingConsent {
  readonly bytes: Uint8Array
  readonly sourceApp: string | null
  readonly sensitivity: Sensitivity
  readonly capturedAt: string
}

export interface CaptureOutcome {
  readonly state: CaptureState
  /** The clip that was appended, or null when nothing was. */
  readonly captured: Clip | null
  /** Rolled out of the default buffer to make room. */
  readonly evicted: readonly Clip[]
  /** What to tell the user, or null — either because nothing is wrong or because it was said. */
  readonly notice: Notice | null
  /** A clip waiting on an answer. Memory-only and marked pending until the user says (PLAN.md 4). */
  readonly pending: PendingConsent | null
  /** Why nothing was captured, for the log and for tests. */
  readonly skipped:
    | 'declined'
    | 'duplicate'
    | 'self_write'
    | 'too_large'
    | 'spool_full'
    | 'source_rule'
    | 'awaiting_consent'
    | null
}

export interface CaptureDeps {
  /** ISO 8601 timestamp for the clip. */
  readonly now: () => string
  /** A fresh clip id. */
  readonly newId: () => string
}

const decoder = new TextDecoder()

export function captureSnapshot(
  state: CaptureState,
  snapshot: ClipboardSnapshot,
  deps: CaptureDeps
): CaptureOutcome {
  const nothing = { captured: null, evicted: [] as readonly Clip[], pending: null }

  // The pending self-write is consumed by whichever clipboard change arrives next, matching or
  // not. This is an identity check rather than a timing window: a slow machine beats a timer, and
  // the plan says so explicitly.
  const pendingSelfWrite = state.pendingSelfWrite
  const cleared = pendingSelfWrite === null ? state : { ...state, pendingSelfWrite: null }

  const admission = admit(snapshot)
  if (!admission.admit) {
    const category = categoryForDecline(admission.reason)
    const said = category === null ? null : noticeFor(cleared.ledger, category)

    // A decline leaves the spool, the cursor, and the notice count untouched.
    return {
      ...nothing,
      state: said === null ? cleared : { ...cleared, ledger: said.ledger },
      notice: said?.notice ?? null,
      skipped: 'declined'
    }
  }

  const bytes = admission.bytes

  // Over the cap, and therefore not captured. Checked on the bytes so that several megabytes of
  // text never has to become a string to be turned away.
  if (bytes.length > CLIP_BYTE_CAP) {
    const said = noticeFor(cleared.ledger, 'size', { bytes: bytes.length, limit: CLIP_BYTE_CAP })
    return {
      ...nothing,
      state: said === null ? cleared : { ...cleared, ledger: said.ledger },
      notice: said?.notice ?? null,
      skipped: 'too_large'
    }
  }

  const sensitivity = classify(
    {
      formats: snapshot.formats,
      canIncludeInClipboardHistory: snapshot.canIncludeInClipboardHistory ?? null
    },
    bytes
  )
  const decision = decideConsent(sensitivity, snapshot.sourceApp ?? null, cleared.sourceRules)

  if (decision.kind === 'skip') {
    // A standing "always skip" answer. Nothing is written, and the bytes go now.
    wipe(bytes)
    return { ...nothing, state: cleared, notice: null, skipped: 'source_rule' }
  }

  if (decision.kind === 'prompt') {
    // Memory-only and marked pending until the user answers. Not decoded: it may never be kept.
    return {
      ...nothing,
      state: cleared,
      notice: null,
      pending: {
        bytes,
        sourceApp: snapshot.sourceApp ?? null,
        sensitivity: decision.sensitivity,
        capturedAt: deps.now()
      },
      skipped: 'awaiting_consent'
    }
  }

  return keep(cleared, bytes, snapshot.sourceApp ?? null, false, deps, pendingSelfWrite)
}

/**
 * File a clip that is going to be stored. This is the one place bytes become a string, and it is
 * only ever reached once the answer is Keep — or once there was nothing to ask about.
 */
export function keep(
  state: CaptureState,
  bytes: Uint8Array,
  sourceApp: string | null,
  wasFlagged: boolean,
  deps: CaptureDeps,
  pendingSelfWrite: string | null = null,
  capturedAt?: string
): CaptureOutcome {
  const nothing = { captured: null, evicted: [] as readonly Clip[], pending: null }
  const text = decoder.decode(bytes)

  if (text === pendingSelfWrite) {
    // Our own serve, arriving back as a clipboard change. Nothing happened here.
    return { ...nothing, state, notice: null, skipped: 'self_write' }
  }

  if (state.lastCapturedText !== null && text === state.lastCapturedText) {
    return { ...nothing, state, notice: null, skipped: 'duplicate' }
  }

  const clip = createClip({
    id: deps.newId(),
    content: text,
    capturedAt: capturedAt ?? deps.now(),
    sourceApp,
    wasFlagged
  })

  const result = capture(state.spool, clip)

  if (!result.ok) {
    // A saved spool refusing at its cap arrives with saved spools at M8, and it gets its own
    // wording there. The default spool rolls, so the size case is the only one reachable here —
    // and it is already handled above, on the bytes.
    const said =
      result.reason === 'clip_too_large'
        ? noticeFor(state.ledger, 'size', { bytes: clip.byteLength, limit: CLIP_BYTE_CAP })
        : null

    return {
      ...nothing,
      state: said === null ? state : { ...state, ledger: said.ledger },
      notice: said?.notice ?? null,
      skipped: result.reason === 'clip_too_large' ? 'too_large' : 'spool_full'
    }
  }

  return {
    state: { ...state, spool: result.spool, lastCapturedText: text },
    captured: clip,
    evicted: result.evicted,
    notice: null,
    pending: null,
    skipped: null
  }
}

/** A fresh state, for the session and for tests. */
export function initialCaptureState(spool: Spool, ledger: NoticeLedger): CaptureState {
  return {
    spool,
    lastCapturedText: null,
    ledger,
    pendingSelfWrite: null,
    sourceRules: noSourceRules
  }
}
