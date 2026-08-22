/** Pure helpers for the consent prompt. No React, no I/O (PLAN.md 6). */

/**
 * What to call the application a clip came from. Windows reports a process image name, and
 * "Always keep from 1Password" reads better than "Always keep from 1Password.exe".
 */
export function sourceName(sourceApp: string | null): string | null {
  if (sourceApp === null) return null

  const trimmed = sourceApp.replace(/\.exe$/i, '').trim()
  return trimmed.length === 0 ? null : trimmed
}
