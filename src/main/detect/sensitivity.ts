import {
  ascii,
  characterClasses,
  hasWhitespace,
  includes,
  indexOf,
  isDigit,
  shannonEntropy,
  startsWith,
  trim
} from './bytes'

/**
 * The two tiers of PLAN.md 4, over bytes rather than strings.
 *
 * Different confidence, different wording: Tier 1 is what the source application *declared*, and is
 * authoritative. Tier 2 is a guess from shape, and says so. False positives are acceptable here;
 * silent capture of a secret is not.
 */

export type Tier = 1 | 2

export interface Sensitivity {
  readonly tier: Tier
  /** Which rule matched, for the privacy panel and for the prompt's second line. */
  readonly rule: string
}

/** What the OS said about concealment, separately from the content itself. */
export interface ConcealmentSignals {
  readonly formats: readonly string[]
  /**
   * The value of the Windows `CanIncludeInClipboardHistory` format, when the clipboard carried it.
   * `0` means the source application asked that this copy stay out of clipboard history — which is
   * exactly what this app is.
   */
  readonly canIncludeInClipboardHistory: number | null
}

/** Formats whose mere presence declares the content secret. */
const DECLARED_FORMATS = new Set([
  'ExcludeClipboardContentFromMonitorProcessing',
  // macOS, for M14.
  'org.nspasteboard.ConcealedType'
])

/** Tier 1 — the source application marked this as secret. Password managers do this. */
export function declaredConcealed(signals: ConcealmentSignals): Sensitivity | null {
  if (signals.formats.some((format) => DECLARED_FORMATS.has(format))) {
    return { tier: 1, rule: 'the application marked it as concealed' }
  }
  if (signals.canIncludeInClipboardHistory === 0) {
    return { tier: 1, rule: 'the application asked to be kept out of clipboard history' }
  }
  return null
}

const PEM = ascii('-----BEGIN')
const JWT = ascii('eyJ')
const DOT = ascii('.')

/** Key prefixes worth recognising by name (PLAN.md 4). */
const KEY_PREFIXES: ReadonlyArray<[label: string, prefix: Uint8Array]> = [
  ['an OpenAI-style key (sk-)', ascii('sk-')],
  ['an AWS access key (AKIA)', ascii('AKIA')],
  ['a GitHub token (ghp_)', ascii('ghp_')],
  ['a GitHub token (github_pat_)', ascii('github_pat_')],
  ['a Slack token (xoxb-)', ascii('xoxb-')],
  ['a Google API key (AIza)', ascii('AIza')]
]

const CONNECTION_KEYWORDS: ReadonlyArray<[label: string, needle: Uint8Array]> = [
  ['a connection string (Password=)', ascii('Password=')],
  ['a connection string (pwd=)', ascii('pwd=')],
  ['a connection string (Server=)', ascii('Server=')]
]

/** Entropy high enough to look generated rather than written. */
const ENTROPY_THRESHOLD = 4.0
const ENTROPY_MIN_LENGTH = 16
const ENTROPY_MAX_LENGTH = 200
const ENTROPY_MIN_CLASSES = 3

/** A URL is not a secret, and its punctuation would otherwise score like one. */
const URL_MARKERS = [ascii('://'), ascii('www.')]

/**
 * Nor is an absolute file path, which a developer copies many times a day — and a prompt that fires
 * on every one of those teaches the user to dismiss prompts, which costs more than it saves.
 *
 * Deliberately narrow: it recognises only what a path *starts* with. Checking for slashes anywhere
 * would be a hole, because an AWS secret key is full of them.
 */
function looksLikeAbsolutePath(content: Uint8Array): boolean {
  const [first, second, third] = content
  const isSlash = (byte: number | undefined): boolean => byte === 0x2f || byte === 0x5c
  const isLetter =
    first !== undefined &&
    ((first >= 0x41 && first <= 0x5a) || (first >= 0x61 && first <= 0x7a))

  // C:/… or C:\…
  if (isLetter && second === 0x3a && isSlash(third)) return true
  // /usr/… or \\server\…
  return isSlash(first)
}

/** Tier 2 — pattern or entropy match. Lower confidence, softer wording. */
export function looksLikeSecret(bytes: Uint8Array): Sensitivity | null {
  const content = trim(bytes)
  if (content.length === 0) return null

  if (startsWith(content, PEM)) return { tier: 2, rule: 'a PEM block' }
  if (isJwt(content)) return { tier: 2, rule: 'a JWT' }

  for (const [label, prefix] of KEY_PREFIXES) {
    if (includes(content, prefix)) return { tier: 2, rule: label }
  }

  for (const [label, needle] of CONNECTION_KEYWORDS) {
    if (includes(content, needle, true)) return { tier: 2, rule: label }
  }

  if (isHighEntropy(content)) return { tier: 2, rule: 'a long random-looking string' }

  return null
}

/** `eyJ` followed by two dot-separated base64url segments. */
function isJwt(content: Uint8Array): boolean {
  if (!startsWith(content, JWT)) return false

  const firstDot = indexOf(content, DOT)
  if (firstDot <= 0) return false
  const secondDot = indexOf(content, DOT, false, firstDot + 1)
  if (secondDot <= firstDot + 1) return false

  // Three segments, all base64url. The third may be empty for an unsigned token.
  return (
    isBase64Url(content.subarray(0, firstDot)) &&
    isBase64Url(content.subarray(firstDot + 1, secondDot)) &&
    isBase64Url(content.subarray(secondDot + 1))
  )
}

function isBase64Url(segment: Uint8Array): boolean {
  for (const byte of segment) {
    const alphanumeric =
      isDigit(byte) || (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a)
    if (!alphanumeric && byte !== 0x2d && byte !== 0x5f && byte !== 0x3d) return false
  }
  return true
}

function isHighEntropy(content: Uint8Array): boolean {
  if (content.length < ENTROPY_MIN_LENGTH || content.length > ENTROPY_MAX_LENGTH) return false
  if (hasWhitespace(content)) return false
  if (URL_MARKERS.some((marker) => includes(content, marker, true))) return false
  if (looksLikeAbsolutePath(content)) return false
  if (characterClasses(content) < ENTROPY_MIN_CLASSES) return false

  return shannonEntropy(content) >= ENTROPY_THRESHOLD
}

/**
 * The whole classification, in the order of PLAN.md 4: what the application declared beats what the
 * content looks like, because one is a statement and the other is a guess.
 */
export function classify(signals: ConcealmentSignals, bytes: Uint8Array): Sensitivity | null {
  return declaredConcealed(signals) ?? looksLikeSecret(bytes)
}

/** Every Tier 2 rule, for the privacy panel — the user is owed the list of what trips a prompt. */
export const HEURISTIC_RULES: ReadonlyArray<{ label: string; detail: string }> = [
  { label: 'PEM blocks', detail: 'text beginning -----BEGIN' },
  { label: 'JWTs', detail: 'eyJ followed by two dot-separated base64url segments' },
  { label: 'Known key prefixes', detail: 'sk-, AKIA, ghp_, github_pat_, xoxb-, AIza' },
  { label: 'Connection strings', detail: 'Password=, pwd=, Server=' },
  {
    label: 'High-entropy strings',
    detail: `${ENTROPY_MIN_LENGTH}–${ENTROPY_MAX_LENGTH} characters, no spaces, at least ${ENTROPY_MIN_CLASSES} character classes, and random-looking`
  }
]
