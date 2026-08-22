/**
 * Default global hotkeys (PLAN.md 8, "Hotkeys"). Pure: platform in, accelerators out.
 *
 * The defaults deliberately avoid paste-adjacent combinations, and on Windows they avoid the
 * `Win+Shift+*` family the shell reserves for itself. Summon carries two bindings — `V` for the
 * paste-adjacent muscle memory, `C` for "clipboard" — because either is a reasonable thing to
 * reach for. The rest take one binding each.
 */
export type Platform = 'win32' | 'darwin' | 'linux'

export type Action = 'summon' | 'serve' | 'toggleMode'

const WINDOWS_MODIFIER = 'Super+Alt'
const MAC_MODIFIER = 'Control+Alt'

const KEYS: Record<Action, readonly string[]> = {
  summon: ['V', 'C'],
  serve: ['N'],
  toggleMode: ['M']
}

/** Every action, in the order the tray lists them. */
export const ACTIONS: readonly Action[] = ['summon', 'serve', 'toggleMode']

/** What each action is called where a person reads it. */
export const ACTION_LABELS: Record<Action, string> = {
  summon: 'Summon',
  serve: 'Serve next clip',
  toggleMode: 'Toggle FIFO / LIFO'
}

/** Every accelerator a platform binds to an action. Non-Windows platforms follow the macOS shape. */
export function defaultAccelerators(action: Action, platform: Platform): string[] {
  const modifier = platform === 'win32' ? WINDOWS_MODIFIER : MAC_MODIFIER
  return KEYS[action].map((key) => `${modifier}+${key}`)
}

/** How one accelerator should read to a user on this platform. */
export function describeAccelerator(accelerator: string, platform: Platform): string {
  return platform === 'darwin'
    ? accelerator.replace('Control', 'Ctrl').replace('Alt', 'Option')
    : accelerator.replace('Super', 'Win')
}

/** How an action's whole set of bindings should read — "Win+Alt+V or Win+Alt+C". */
export function describeAction(action: Action, platform: Platform): string {
  const described = defaultAccelerators(action, platform).map((accelerator) =>
    describeAccelerator(accelerator, platform)
  )
  return described.join(' or ')
}
