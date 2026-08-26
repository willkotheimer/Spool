/** Pure helpers for the capacity advisor and the Storage panel. No React, no I/O (PLAN.md 6). */

/** Bytes in the units a person reads them in. */
export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib >= 1) return `${Math.round(mib * 10) / 10} MB`

  const kib = bytes / 1024
  if (kib >= 1) return `${Math.round(kib)} KB`
  return `${bytes} bytes`
}

/**
 * When a spool was last used, in words. The advisor ranks by this, so the list has to show it —
 * "haven't been opened in over a month" is the reason the user is being asked at all (PLAN.md 9).
 */
export function lastUsedLabel(lastUsedAt: string | null, now = new Date()): string {
  if (lastUsedAt === null) return 'never used'

  const then = Date.parse(lastUsedAt)
  if (Number.isNaN(then)) return 'never used'

  const days = Math.floor((now.getTime() - then) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'used today'
  if (days === 1) return 'used yesterday'
  if (days < 30) return `used ${days} days ago`

  const months = Math.floor(days / 30)
  return months === 1 ? 'used a month ago' : `used ${months} months ago`
}

/** How full, as a percentage, for the Storage panel. */
export function percentFull(ratio: number): string {
  return `${Math.round(Math.min(Math.max(ratio, 0), 1) * 100)}%`
}
