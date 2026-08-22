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
