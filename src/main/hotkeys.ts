import { globalShortcut } from 'electron'
import {
  defaultAccelerators,
  describeAccelerator,
  type Action,
  type Platform
} from './accelerators'
import { reportHotkeyFailure } from './tray'
import { toggleCompactWindow } from './window'

const HANDLERS: Record<Action, () => void> = {
  summon: () => toggleCompactWindow()
}

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
export function registerHotkeys(platform: Platform = process.platform as Platform): void {
  for (const action of Object.keys(HANDLERS) as Action[]) {
    const refused: string[] = []
    let claimed = 0

    for (const accelerator of defaultAccelerators(action, platform)) {
      if (claim(accelerator, HANDLERS[action])) claimed += 1
      else refused.push(describeAccelerator(accelerator, platform))
    }

    if (refused.length > 0) reportHotkeyFailure(refused, claimed > 0)
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
