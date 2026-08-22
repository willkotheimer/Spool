/** Pure helpers for the privacy panel (PLAN.md 5f). No I/O, no React. */

export type Platform = 'win32' | 'darwin' | 'linux'

/** Where the database key lives, in the words the operating system uses for it (PLAN.md 6). */
export function keyStoreName(platform: Platform): string {
  switch (platform) {
    case 'win32':
      return 'Windows Credential Manager'
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
