import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_SEPARATOR, type SeparatorKind } from './core/join'

/**
 * Preferences, kept apart from the clips (PLAN.md 3, 8).
 *
 * **Deliberately not in the database.** The §7 schema's versions are spoken for — `last_used_at` at
 * M10, `is_starred` at M11 — and a separator choice is not user data: it is a preference, it is not
 * sensitive, and it must be readable before the encrypted store opens so that a store which fails
 * to open still leaves a usable window behind. So: one small JSON file next to the database.
 */

export type WindowState = 'compact' | 'expanded'

export interface Settings {
  /** How clips are joined when the whole spool is pasted (PLAN.md 3). */
  readonly separator: SeparatorKind
  /** Which state the window was last in. The app remembers (PLAN.md 8). */
  readonly window: WindowState
}

export const DEFAULT_SETTINGS: Settings = {
  separator: DEFAULT_SEPARATOR,
  window: 'compact'
}

export function settingsPath(userDataDirectory: string): string {
  return join(userDataDirectory, 'settings.json')
}

const SEPARATORS: readonly SeparatorKind[] = [
  'newline',
  'blank_line',
  'tab',
  'comma',
  'space',
  'none'
]

/**
 * Read the file, taking only what is recognised. A settings file that has been hand-edited into
 * nonsense should cost the user their preferences, not their app.
 */
export function loadSettings(path: string): Settings {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return DEFAULT_SETTINGS
  }

  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS
  const raw = parsed as Partial<Record<keyof Settings, unknown>>

  return {
    separator: SEPARATORS.includes(raw.separator as SeparatorKind)
      ? (raw.separator as SeparatorKind)
      : DEFAULT_SETTINGS.separator,
    window: raw.window === 'expanded' ? 'expanded' : 'compact'
  }
}

export function saveSettings(path: string, settings: Settings): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n')
}
