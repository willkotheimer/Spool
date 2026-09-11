import type { SeparatorKind, SpoolView } from '../../shared/ipc'

/** Pure helpers for the expanded window. No React, no I/O (PLAN.md 6). */

const LABELS: Record<SeparatorKind, string> = {
  newline: 'A new line',
  blank_line: 'A blank line',
  tab: 'A tab',
  comma: 'A comma',
  space: 'A space',
  none: 'Nothing at all'
}

/** The separators offered, in the order they are worth reaching for (PLAN.md 3). */
export function separatorOptions(): Array<{ value: SeparatorKind; label: string }> {
  const order: SeparatorKind[] = ['newline', 'blank_line', 'tab', 'comma', 'space', 'none']
  return order.map((value) => ({ value, label: LABELS[value] }))
}

/** Bytes, in the units a person reads. */
export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib >= 1) return `${Math.round(mib * 10) / 10} MB`

  const kib = bytes / 1024
  if (kib >= 1) return `${Math.round(kib * 10) / 10} KB`
  return `${bytes} bytes`
}

/**
 * What the whole-spool button says it will take (PLAN.md 3).
 *
 * It names the number in play rather than the number in the spool, because the button and the
 * hotkey must agree: `Win+Alt+V` pastes exactly what this says. "All 15" when nothing is chosen,
 * "3 of 15" when a subset is — the total stays visible so the selection is legible as a narrowing
 * rather than as the whole truth.
 */
export function pasteAllLabel(spool: SpoolView): string {
  if (!spool.hasSelection) return `Put all ${spool.count} on the clipboard`
  return `Put ${spool.inPlay} of ${spool.count} on the clipboard`
}
