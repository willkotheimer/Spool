import type { HotkeyView } from '../../shared/ipc'

/** Pure helpers for the hotkey panel (PLAN.md 8). No I/O, no React. */

/**
 * The line at the top of the panel, or null when every key is live.
 *
 * It names the count rather than the keys, because the rows underneath already name the keys and
 * the point of this line is to be readable at a glance from the button that opened it.
 */
export function hotkeySummary(hotkeys: readonly HotkeyView[]): string | null {
  const refused = hotkeys.filter((hotkey) => !hotkey.claimed)
  if (refused.length === 0) return null

  const which = refused.map((hotkey) => hotkey.described).join(' and ')
  return refused.length === 1
    ? `${which} was refused by another application and does nothing. Pick another below.`
    : `${refused.length} hotkeys were refused by other applications and do nothing: ${which}.`
}

/**
 * What the "?" button shows without opening anything: a count of dead keys, or null when all is
 * well. A badge is the only way a refusal reaches someone who has not gone looking for it.
 */
export function refusedCount(hotkeys: readonly HotkeyView[]): number {
  return hotkeys.filter((hotkey) => !hotkey.claimed).length
}
