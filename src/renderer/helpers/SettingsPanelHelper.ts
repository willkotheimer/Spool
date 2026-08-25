/** Pure helpers for the settings panel. No React, no I/O (PLAN.md 6). */

/** The retention choices, as the select renders them (PLAN.md 11, M9). */
export const RETENTION_LABELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'none', label: 'Until I remove them' },
  { value: '1', label: 'One hour' },
  { value: '24', label: 'One day' },
  { value: '168', label: 'One week' },
  { value: '720', label: 'One month' }
]

/** How a spool's limit reads in a sentence. */
export function retentionLabel(hours: number | null): string {
  if (hours === null) return 'kept until removed'
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`

  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

/** A cap in the units a person reads it in. */
export function formatLimit(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib >= 1) return `${Math.round(mib * 10) / 10} MB`
  return `${Math.round(bytes / 1024)} KB`
}
