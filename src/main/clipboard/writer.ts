import { createRequire } from 'node:module'
import { clipboard } from 'electron'

/**
 * Writing to the system clipboard (PLAN.md 8). Electron's clipboard module reads and writes — it
 * only cannot *notify*, which is why watching needs the native addon and writing does not.
 *
 * Kept apart from the watcher so the session can be tested with a fake, and so there is exactly one
 * place in the app that puts something on the clipboard.
 */
export function writeClipboardText(text: string): void {
  clipboard.writeText(text)
}

/**
 * Ask the addon to synthesize Ctrl+V into whatever window has focus (PLAN.md 8).
 *
 * **Windows only, and that is a decision rather than a gap.** SendInput is output: it needs no
 * permission and no keyboard hook. The macOS equivalent needs Accessibility permission, which is
 * permission to read every keystroke on the machine, and an app whose whole claim is that it cannot
 * spy on you must not ask for it. So serving pastes here and would not there.
 *
 * Returns false when nothing was sent — no foreground window, or Spool's own window is in front,
 * which the addon refuses because pasting into ourselves is never what anyone meant.
 */
export function sendPaste(): boolean {
  try {
    const require = createRequire(__filename)
    const addon = require('spool-clipboard') as { sendPaste?: () => boolean }
    return addon.sendPaste?.() ?? false
  } catch {
    return false
  }
}

/** Whether Spool's own window is in front, which decides where a clip is meant to go. */
export function foregroundIsSelf(): boolean {
  try {
    const require = createRequire(__filename)
    const addon = require('spool-clipboard') as { foregroundIsSelf?: () => boolean }
    return addon.foregroundIsSelf?.() ?? false
  } catch {
    return false
  }
}
