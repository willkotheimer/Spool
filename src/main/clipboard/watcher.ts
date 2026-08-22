import { createRequire } from 'node:module'
import type { ClipboardSnapshot } from '../detect/admit'

/**
 * The boundary between the capture pipeline and the operating system (PLAN.md 8).
 *
 * Everything above this interface is plain TypeScript and tested with a fake. Below it is the
 * native addon: `AddClipboardFormatListener` on Windows, and `NSPasteboard`'s `changeCount` on
 * macOS at M14. Neither platform's implementation is portable to the other, so the seam is here.
 */
export interface ClipboardWatcher {
  start(onChange: (snapshot: ClipboardSnapshot) => void): void
  stop(): void
}

/** What the addon hands back: bytes and format names, never a string (PLAN.md 4). */
interface NativeSnapshot {
  formats: string[]
  text: Buffer | null
  sourceApp: string | null
}

interface NativeAddon {
  start(callback: (snapshot: NativeSnapshot) => void): void
  stop(): void
  isSupported(): boolean
}

export type WatcherLoad =
  | { readonly ok: true; readonly watcher: ClipboardWatcher }
  | { readonly ok: false; readonly reason: string }

/**
 * Load the compiled addon.
 *
 * Resolved at runtime rather than bundled, because it is a `.node` binary rather than JavaScript.
 * A missing or unbuilt addon is reported rather than thrown: capture is the whole point of the
 * app, so the window has to be able to say that it is not working, and why.
 */
export function loadClipboardWatcher(): WatcherLoad {
  let addon: NativeAddon
  try {
    const require = createRequire(__filename)
    addon = require('spool-clipboard') as NativeAddon
  } catch (error) {
    return { ok: false, reason: `the clipboard addon could not be loaded: ${describe(error)}` }
  }

  if (!addon.isSupported()) {
    return { ok: false, reason: 'clipboard watching is not implemented on this platform yet' }
  }

  return {
    ok: true,
    watcher: {
      start(onChange) {
        addon.start((snapshot) => onChange(toSnapshot(snapshot)))
      },
      stop() {
        addon.stop()
      }
    }
  }
}

/**
 * Bytes to text, at the one place it happens.
 *
 * M5 moves the sensitivity detectors above this line so that a declined secret never becomes a
 * JavaScript string — strings are immutable and garbage-collected, so they cannot be wiped
 * (PLAN.md 4). Keeping the conversion in one function is what makes that change small.
 */
function toSnapshot(native: NativeSnapshot): ClipboardSnapshot {
  return {
    formats: native.formats,
    text: native.text === null ? null : native.text.toString('utf8'),
    sourceApp: native.sourceApp
  }
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
