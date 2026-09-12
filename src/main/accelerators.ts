/**
 * Global hotkeys (PLAN.md 8, "Hotkeys"). Pure: platform and overrides in, accelerators out.
 *
 * **The defaults are a guess and the app must not pretend otherwise.** A global accelerator is
 * granted first-come-first-served by the operating system, so which ones are available depends on
 * what else is installed. Measured on Windows 11: of the twenty-six `Win+Alt+<letter>` combinations,
 * thirteen were already owned — `N` by OneNote, and `M`, `R`, `G`, `B`, `T`, `W` by the Xbox Game
 * Bar, which ships with Windows. Two of the three original defaults were therefore dead on arrival
 * for most users rather than for unlucky ones. The answer is not a cleverer guess; it is that every
 * binding is rebindable and every refusal is said out loud.
 *
 * `Ctrl+Alt` is deliberately not the Windows default: it is `AltGr` on international layouts, where
 * `Ctrl+Alt+N`, `+A` and `+C` type `ń`, `ą` and `ć`. It is offered as a rebinding choice, carrying
 * that warning, because on a US layout it is the emptiest space available.
 */
export type Platform = 'win32' | 'darwin' | 'linux'

export {
  buildAccelerator,
  KEY_CHOICES,
  MODIFIER_CHOICES,
  splitAccelerator
} from '../shared/hotkeys'

/**
 * Toggling FIFO/LIFO is deliberately absent. It is something you do while looking at the spool, not
 * while typing in another application, so it lives on the mode pill in the window and spends no
 * global accelerator (PLAN.md 8).
 */
export type Action = 'summon' | 'serve' | 'pasteAll'

const WINDOWS_MODIFIER = 'Super+Alt'
const MAC_MODIFIER = 'Control+Alt'

/**
 * One binding each, and the letters say what they do: `C` for clipboard opens the window, `U`
 * unspools the next clip, `V` pastes — the whole spool, the way `Ctrl+V` pastes one thing.
 *
 * Serving carries the repeat gesture: press `U` again and again and clips come off in whatever
 * order the mode says. That is why pasting the whole spool is not a double-press of anything —
 * a repeated press means "give me the next one", and spending it on "give me everything at once"
 * would take the unspool gesture and hand it to the action that makes the ordering moot.
 */
const KEYS: Record<Action, readonly string[]> = {
  summon: ['C'],
  serve: ['U'],
  pasteAll: ['V']
}

/** Every action, in the order the tray and the hotkey panel list them. */
export const ACTIONS: readonly Action[] = ['summon', 'serve', 'pasteAll']

/** What each action is called where a person reads it. */
export const ACTION_LABELS: Record<Action, string> = {
  summon: 'Show or hide Spool',
  serve: 'Unspool the next clip',
  pasteAll: 'Paste the whole spool'
}

/** A line of help under each action, so the panel doubles as the reference (PLAN.md 8). */
export const ACTION_HINTS: Record<Action, string> = {
  summon: 'Press it again to send the window away.',
  serve: 'Press it repeatedly to unspool clip after clip, in the current order.',
  pasteAll: 'Puts every clip on the clipboard at once, joined by your separator.'
}

/** Every accelerator a platform binds to an action. Non-Windows platforms follow the macOS shape. */
export function defaultAccelerators(action: Action, platform: Platform): string[] {
  const modifier = platform === 'win32' ? WINDOWS_MODIFIER : MAC_MODIFIER
  return KEYS[action].map((key) => `${modifier}+${key}`)
}

/**
 * What this install should actually try to claim: the user's choice where they have made one, the
 * default otherwise. An override replaces the defaults rather than joining them — a rebinding that
 * left the refused combination in place would keep reporting a refusal the user has already dealt
 * with.
 */
export function resolveAccelerators(
  action: Action,
  platform: Platform,
  overrides: Partial<Record<Action, string>> = {}
): string[] {
  const chosen = overrides[action]
  return chosen === undefined || chosen.length === 0
    ? defaultAccelerators(action, platform)
    : [chosen]
}

/** How one accelerator should read to a user on this platform. */
export function describeAccelerator(accelerator: string, platform: Platform): string {
  return platform === 'darwin'
    ? accelerator.replace('Control', 'Ctrl').replace('Alt', 'Option')
    : accelerator.replace('Super', 'Win')
}

/** How an action's whole set of bindings should read — "Win+Alt+V or Win+Alt+C". */
export function describeAction(
  action: Action,
  platform: Platform,
  overrides: Partial<Record<Action, string>> = {}
): string {
  const described = resolveAccelerators(action, platform, overrides).map((accelerator) =>
    describeAccelerator(accelerator, platform)
  )
  return described.join(' or ')
}
