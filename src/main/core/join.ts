import type { Spool } from './types'

/**
 * Pasting a whole spool (PLAN.md 3, "Pasting a whole spool").
 *
 * The other half of the product, and the reason reordering exists: collect a scattered set of
 * values, arrange them, and put them back into one document in the right order.
 *
 * **It joins and writes once.** Every clip is concatenated with a separator and written to the
 * clipboard as a single item; the user then pastes normally, once. Synthesising one paste per clip
 * is rejected for the same reason serve-and-paste is — it needs input-synthesis permission, and it
 * cannot know where the caret should go between clips anyway (PLAN.md 8).
 */

/** The separators offered, as a global setting (PLAN.md 3). */
export type SeparatorKind = 'newline' | 'blank_line' | 'tab' | 'comma' | 'space' | 'none'

export const DEFAULT_SEPARATOR: SeparatorKind = 'newline'

const SEPARATORS: Record<SeparatorKind, string> = {
  newline: '\n',
  blank_line: '\n\n',
  tab: '\t',
  comma: ', ',
  space: ' ',
  none: ''
}

/** How each separator reads in settings, so the list is written once. */
export const SEPARATOR_LABELS: Record<SeparatorKind, string> = {
  newline: 'New line',
  blank_line: 'Blank line',
  tab: 'Tab',
  comma: 'Comma',
  space: 'Space',
  none: 'Nothing'
}

/**
 * Total on purpose. An unrecognised kind must not fall through to `Array.join`'s own default,
 * which is a comma — measured at M7, where a bad value silently produced comma-separated output
 * that nobody had asked for. Falling back to the documented default is the honest failure.
 */
export function separatorText(kind: SeparatorKind): string {
  return SEPARATORS[kind] ?? SEPARATORS[DEFAULT_SEPARATOR]
}

/** Whether a value is one of the separators actually offered (PLAN.md 3). */
export function isSeparatorKind(value: unknown): value is SeparatorKind {
  return typeof value === 'string' && value in SEPARATORS
}

/** Above this, writing is confirmed first: the clipboard is shared with the whole machine. */
export const CONFIRM_JOIN_BYTES = 10 * 1024 * 1024

export type JoinResult =
  | { readonly ok: true; readonly text: string; readonly byteLength: number; readonly clips: number }
  /** Same wording as a single serve, because it is the same situation (PLAN.md 3). */
  | { readonly ok: false; readonly reason: 'empty' }

/**
 * Join every clip in the spool.
 *
 * Order is position order travelling in the mode's direction, and it **always starts at the
 * beginning, never at the cursor** — "paste everything" means everything, and starting mid-spool
 * would silently drop the clips behind it. The cursor does not move: this is a bulk read, not a
 * traversal.
 */
export function joinSpool(spool: Spool, separator: SeparatorKind): JoinResult {
  if (spool.clips.length === 0) return { ok: false, reason: 'empty' }

  const ordered = spool.mode === 'fifo' ? spool.clips : [...spool.clips].reverse()
  const text = ordered.map((clip) => clip.content).join(separatorText(separator))

  return {
    ok: true,
    text,
    byteLength: new TextEncoder().encode(text).length,
    clips: ordered.length
  }
}

/** Whether a joined result is large enough to be felt system-wide, and so worth confirming. */
export function needsConfirmation(byteLength: number): boolean {
  return byteLength > CONFIRM_JOIN_BYTES
}
