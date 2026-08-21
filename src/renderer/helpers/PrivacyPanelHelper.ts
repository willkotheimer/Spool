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

/**
 * Where the encrypted data file lives. Encrypted persistence arrives at M6, so until it does this
 * resolves to a stated absence rather than a path — the panel must not describe a file that is not
 * there (PLAN.md 11, M1: leave the path placeholder resolving to a TODO).
 */
export const DATA_FILE_PATH: string | null = null

/** What the panel prints for the data file, whether or not one exists yet. */
export function dataFileDescription(path: string | null): string {
  return path ?? 'No file yet — this build captures nothing, so it stores nothing.'
}

/** The consent timeout of PLAN.md 4, disclosed here because the panel is where it is disclosed. */
export const CONSENT_TIMEOUT_SECONDS = 30

/** Every Tier 2 heuristic, listed so the user knows what trips a prompt (PLAN.md 4). */
export const HEURISTICS: ReadonlyArray<{ label: string; detail: string }> = [
  { label: 'PEM blocks', detail: 'text beginning -----BEGIN' },
  { label: 'JWTs', detail: 'eyJ followed by two dot-separated base64url segments' },
  { label: 'Known key prefixes', detail: 'sk-, AKIA, ghp_, github_pat_, xoxb-, AIza' },
  { label: 'Connection strings', detail: 'Password=, pwd=, Server=…;' },
  { label: 'High-entropy strings', detail: '16–200 characters, no spaces, mixed character classes' }
]
