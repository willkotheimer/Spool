/** Pure helpers for the privacy panel (PLAN.md 5f). No I/O, no React. */

export type Platform = 'win32' | 'darwin' | 'linux'

/**
 * What seals the database key, named as the operating system names it (PLAN.md 6).
 *
 * Windows is **DPAPI**, not the Credential Manager. Electron's `safeStorage` seals through
 * Chromium's OSCrypt, which keeps a random AES key in the app's own `Local State` file and protects
 * that key with DPAPI — the stored value literally begins with the ASCII bytes `DPAPI` followed by
 * a DPAPI blob header, and it cannot be unsealed from a different user-data directory. The
 * Credential Manager is a different facility and is not involved. Naming the wrong one would be a
 * false statement in the one screen whose whole purpose is to be checkable.
 */
export function keySealerName(platform: Platform): string {
  switch (platform) {
    case 'win32':
      return 'Windows itself, through DPAPI'
    case 'darwin':
      return 'the macOS Keychain'
    default:
      return 'the system keyring'
  }
}

/** What the panel prints for the data file, whether or not one exists yet. */
export function dataFileDescription(path: string | null): string {
  return path ?? 'No file yet — this build captures nothing, so it stores nothing.'
}

/**
 * The heuristics and the consent timeout are no longer written here: they come from the detectors
 * themselves, over the bridge (PLAN.md 5f). A panel that lists what the code actually looks for
 * cannot drift from it, and drift is exactly what would make the disclosure a lie.
 */
