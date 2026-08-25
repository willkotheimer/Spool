import type { SeparatorKind } from '../../shared/ipc'

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
