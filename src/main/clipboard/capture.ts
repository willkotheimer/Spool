import { createClip } from '../core/clip'
import { CLIP_BYTE_CAP } from '../core/limits'
import { capture } from '../core/spool'
import type { Clip, Spool } from '../core/types'
import { admit, isDuplicate, type ClipboardSnapshot } from '../detect/admit'
import { categoryForDecline, noticeFor, type Notice, type NoticeLedger } from '../detect/notices'

/**
 * The capture pipeline (PLAN.md 11, M3): one clipboard change in, one decision out.
 *
 * Pure but for the two functions it is handed — identity and time come from the caller, exactly as
 * they do in `core/`. The watcher supplies snapshots and the session holds the state; everything
 * between those two is here, where it can be tested without a clipboard.
 *
 * The order is the order of PLAN.md 4: admission first, because there is no point going further
 * with something that will not be stored either way; then duplicate suppression; then the caps,
 * which are the core's business.
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
   * without this a serve re-captures its own clip as though the user had copied it, which is a
   * duplicate on every serve and, in `lifo`, a spool that grows every time it is used.
   */
  readonly pendingSelfWrite: string | null
}

export interface CaptureOutcome {
  readonly state: CaptureState
  /** The clip that was appended, or null when nothing was. */
  readonly captured: Clip | null
  /** Rolled out of the default buffer to make room. */
  readonly evicted: readonly Clip[]
  /** What to tell the user, or null — either because nothing is wrong or because it was said. */
  readonly notice: Notice | null
  /** Why nothing was captured, for the log and for tests. */
  readonly skipped: 'declined' | 'duplicate' | 'self_write' | 'too_large' | 'spool_full' | null
}

export interface CaptureDeps {
  /** ISO 8601 timestamp for the clip. */
  readonly now: () => string
  /** A fresh clip id. */
  readonly newId: () => string
}

export function captureSnapshot(
  state: CaptureState,
  snapshot: ClipboardSnapshot,
  deps: CaptureDeps
): CaptureOutcome {
  const unchanged = { captured: null, evicted: [] as readonly Clip[] }

  // The pending self-write is consumed by whichever clipboard change arrives next, matching or
  // not. This is an identity check rather than a timing window: a slow machine beats a timer, and
  // the plan says so explicitly.
  const pendingSelfWrite = state.pendingSelfWrite
  const cleared = pendingSelfWrite === null ? state : { ...state, pendingSelfWrite: null }

  const admission = admit(snapshot)
  if (!admission.admit) {
    const category = categoryForDecline(admission.reason)
    const said = category === null ? null : noticeFor(state.ledger, category)

    // A decline leaves the spool, the cursor, and the notice count untouched.
    return {
      ...unchanged,
      state: said === null ? cleared : { ...cleared, ledger: said.ledger },
      notice: said?.notice ?? null,
      skipped: 'declined'
    }
  }

  if (admission.text === pendingSelfWrite) {
    // Our own serve, arriving back as a clipboard change. Nothing happened here.
    return { ...unchanged, state: cleared, notice: null, skipped: 'self_write' }
  }

  if (isDuplicate(admission.text, cleared.lastCapturedText)) {
    return { ...unchanged, state: cleared, notice: null, skipped: 'duplicate' }
  }

  const clip = createClip({
    id: deps.newId(),
    content: admission.text,
    capturedAt: deps.now(),
    sourceApp: snapshot.sourceApp ?? null
  })

  const result = capture(cleared.spool, clip)

  if (!result.ok) {
    // A saved spool refusing at its cap arrives with saved spools at M8, and it gets its own
    // wording there. The default spool rolls, so at M3 this branch is only the size case — which
    // reads differently from a format decline, and says the real numbers.
    const said =
      result.reason === 'clip_too_large'
        ? noticeFor(cleared.ledger, 'size', { bytes: clip.byteLength, limit: CLIP_BYTE_CAP })
        : null

    return {
      ...unchanged,
      state: said === null ? cleared : { ...cleared, ledger: said.ledger },
      notice: said?.notice ?? null,
      skipped: result.reason === 'clip_too_large' ? 'too_large' : 'spool_full'
    }
  }

  return {
    state: { ...cleared, spool: result.spool, lastCapturedText: admission.text },
    captured: clip,
    evicted: result.evicted,
    notice: null,
    skipped: null
  }
}
