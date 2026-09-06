import { globalShortcut } from 'electron'
import type { HotkeyView } from '../shared/ipc'
import {
  ACTION_HINTS,
  ACTION_LABELS,
  ACTIONS,
  defaultAccelerators,
  describeAccelerator,
  resolveAccelerators,
  type Action,
  type Platform
} from './accelerators'
import { reportHotkeyStatus, type HotkeyStatus } from './tray'

export type HotkeyHandlers = Record<Action, () => void>

/** One action's binding and whether the operating system actually granted it. */
export interface HotkeyBinding {
  readonly action: Action
  /** The Electron accelerator, which is what gets stored and re-registered. */
  readonly accelerator: string
  /** The same thing as a person reads it: `Win+Alt+C`. */
  readonly described: string
  readonly claimed: boolean
}

/**
 * Kept so a rebinding can re-register everything without the caller having to hand the handlers
 * back. There is one set of global hotkeys in a process, so one module-level record is honest about
 * what is going on rather than hiding it behind an object nobody owns twice.
 */
let handlers: HotkeyHandlers | null = null
let overrides: Partial<Record<Action, string>> = {}
let platform: Platform = process.platform as Platform
let bindings: HotkeyBinding[] = []

function claim(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler)
  } catch {
    return false
  }
}

function apply(): HotkeyBinding[] {
  globalShortcut.unregisterAll()
  if (handlers === null) return []

  bindings = ACTIONS.flatMap((action) =>
    resolveAccelerators(action, platform, overrides).map((accelerator): HotkeyBinding => ({
      action,
      accelerator,
      described: describeAccelerator(accelerator, platform),
      claimed: claim(accelerator, handlers![action])
    }))
  )

  reportHotkeyStatus(toStatuses(bindings))
  return bindings
}

/** The tray wants the per-action shape; the panel wants the per-binding one. */
function toStatuses(all: readonly HotkeyBinding[]): HotkeyStatus[] {
  return ACTIONS.map((action) => {
    const mine = all.filter((binding) => binding.action === action)
    return {
      action,
      claimed: mine.filter((b) => b.claimed).map((b) => b.described),
      refused: mine.filter((b) => !b.claimed).map((b) => b.described)
    }
  })
}

/**
 * Claim the global hotkeys. Registration fails when another application — or the shell itself —
 * already owns a combination, and **that failure is surfaced rather than swallowed** (PLAN.md 8):
 * a silently dead hotkey is the worst outcome, because the user concludes the app is broken. The
 * result goes to the tray and, through the session, to the hotkey panel where it can be fixed.
 */
export function registerHotkeys(
  nextHandlers: HotkeyHandlers,
  nextOverrides: Partial<Record<Action, string>> = {},
  nextPlatform: Platform = process.platform as Platform
): HotkeyBinding[] {
  handlers = nextHandlers
  overrides = nextOverrides
  platform = nextPlatform
  return apply()
}

/**
 * Take a new combination for one action and try it. Everything is re-registered rather than only
 * the changed action, because releasing one accelerator can free another that was refused for
 * colliding with it.
 */
export function rebindHotkey(action: Action, accelerator: string): HotkeyBinding[] {
  overrides = { ...overrides, [action]: accelerator }
  return apply()
}

/** Give an action its default binding back. */
export function resetHotkey(action: Action): HotkeyBinding[] {
  const next = { ...overrides }
  delete next[action]
  overrides = next
  return apply()
}

/** What the user has chosen, for persisting to settings. */
export function hotkeyOverrides(): Partial<Record<Action, string>> {
  return { ...overrides }
}

export function currentBindings(): readonly HotkeyBinding[] {
  return bindings
}

/** What the window shows: every binding, whether it is live, and whether the user chose it. */
export function hotkeyViews(): HotkeyView[] {
  return bindings.map((binding) => ({
    action: binding.action,
    label: ACTION_LABELS[binding.action],
    hint: ACTION_HINTS[binding.action],
    accelerator: binding.accelerator,
    described: binding.described,
    claimed: binding.claimed,
    isDefault: defaultAccelerators(binding.action, platform).includes(binding.accelerator)
  }))
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
