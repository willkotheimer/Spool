/**
 * The vocabulary of a hotkey, shared by both sides (PLAN.md 6, 8).
 *
 * It lives here rather than in `main/accelerators.ts` because the rebinding UI has to offer these
 * choices and the renderer never reaches into main. Pure data and two string functions — no
 * behaviour that could differ between the process that registers a combination and the process that
 * asks for one.
 */

/** The modifier families offered when rebinding, with the hazard each one carries. */
export const MODIFIER_CHOICES: readonly {
  readonly value: string
  readonly label: string
  readonly hazard: string | null
}[] = [
  { value: 'Super+Alt', label: 'Win + Alt', hazard: null },
  {
    value: 'Control+Alt',
    label: 'Ctrl + Alt',
    hazard: 'This is AltGr on international keyboards, where it types accented characters.'
  },
  { value: 'Control+Shift+Alt', label: 'Ctrl + Shift + Alt', hazard: null },
  { value: 'Super+Control+Alt', label: 'Win + Ctrl + Alt', hazard: null }
]

/** The keys offered when rebinding. Letters only: digits and punctuation move between layouts. */
export const KEY_CHOICES: readonly string[] = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/** Put a modifier family and a key back together into an Electron accelerator. */
export function buildAccelerator(modifier: string, key: string): string {
  return `${modifier}+${key}`
}

/** Split an accelerator into the parts the rebinding UI edits. */
export function splitAccelerator(accelerator: string): { modifier: string; key: string } {
  const cut = accelerator.lastIndexOf('+')
  return cut === -1
    ? { modifier: MODIFIER_CHOICES[0].value, key: accelerator }
    : { modifier: accelerator.slice(0, cut), key: accelerator.slice(cut + 1) }
}
