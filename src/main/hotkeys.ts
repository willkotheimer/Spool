import { globalShortcut } from 'electron'
import {
  ACTIONS,
  defaultAccelerators,
  describeAccelerator,
  type Action,
  type Platform
} from './accelerators'
import { reportHotkeyStatus, type HotkeyStatus } from './tray'

export type HotkeyHandlers = Record<Action, () => void>

function claim(accelerator: string, handler: () => void): boolean {
  try {
    return globalShortcut.register(accelerator, handler)
  } catch {
    return false
  }
}

/**
 * Claim the global hotkeys. Registration can fail when another application — or the shell itself —
 * already owns a combination, and that failure is reported rather than swallowed (PLAN.md 8). An
 * action with several bindings works as long as one of them is claimed; the refused ones are still
 * named, so the user is never left guessing which key is live.
 */
export function registerHotkeys(
  handlers: HotkeyHandlers,
  platform: Platform = process.platform as Platform
): HotkeyStatus[] {
  const statuses = ACTIONS.map((action): HotkeyStatus => {
    const claimed: string[] = []
    const refused: string[] = []

    for (const accelerator of defaultAccelerators(action, platform)) {
      const described = describeAccelerator(accelerator, platform)
      if (claim(accelerator, handlers[action])) claimed.push(described)
      else refused.push(described)
    }

    return { action, claimed, refused }
  })

  reportHotkeyStatus(statuses)
  return statuses
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
