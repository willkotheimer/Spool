/**
 * Byte-level helpers for the sensitivity detectors (PLAN.md 4).
 *
 * These work on `Uint8Array` and never build a string, which is the whole point: a JavaScript
 * string is immutable and garbage-collected, so a secret that becomes one cannot be wiped and may
 * outlive the user's decision — possibly into a swap file. Detection therefore happens on the bytes
 * the addon handed over, and the bytes are what gets zeroed on Skip.
 *
 * ASCII-only comparisons are enough for every pattern in §4: PEM headers, base64url, key prefixes,
 * and connection-string keywords are all ASCII, and UTF-8 encodes ASCII as itself, so a multi-byte
 * character can never be mistaken for one of them.
 */

const encoder = new TextEncoder()

/** The ASCII bytes of a literal, for comparing against clipboard content. */
export function ascii(literal: string): Uint8Array {
  return encoder.encode(literal)
}

const isUpper = (byte: number): boolean => byte >= 0x41 && byte <= 0x5a
const isLower = (byte: number): boolean => byte >= 0x61 && byte <= 0x7a

/** Lowercase one ASCII byte, leaving everything else alone. */
const foldCase = (byte: number): number => (isUpper(byte) ? byte + 0x20 : byte)

export function isWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x0b
}

export function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39
}

/** Does `haystack` begin with `needle`, ignoring leading whitespace? */
export function startsWith(haystack: Uint8Array, needle: Uint8Array): boolean {
  let start = 0
  while (start < haystack.length && isWhitespace(haystack[start])) start += 1
  if (haystack.length - start < needle.length) return false

  for (let i = 0; i < needle.length; i += 1) {
    if (haystack[start + i] !== needle[i]) return false
  }
  return true
}

/** Does `haystack` contain `needle` anywhere? `fold` compares case-insensitively. */
export function includes(haystack: Uint8Array, needle: Uint8Array, fold = false): boolean {
  return indexOf(haystack, needle, fold) !== -1
}

export function indexOf(haystack: Uint8Array, needle: Uint8Array, fold = false, from = 0): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1

  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      const a = fold ? foldCase(haystack[i + j]) : haystack[i + j]
      const b = fold ? foldCase(needle[j]) : needle[j]
      if (a !== b) continue outer
    }
    return i
  }
  return -1
}

/** The content with leading and trailing whitespace removed — a view, not a copy. */
export function trim(bytes: Uint8Array): Uint8Array {
  let start = 0
  let end = bytes.length
  while (start < end && isWhitespace(bytes[start])) start += 1
  while (end > start && isWhitespace(bytes[end - 1])) end -= 1
  return bytes.subarray(start, end)
}

export function hasWhitespace(bytes: Uint8Array): boolean {
  for (const byte of bytes) if (isWhitespace(byte)) return true
  return false
}

/** How many of the four character classes appear: lower, upper, digit, and everything else. */
export function characterClasses(bytes: Uint8Array): number {
  let lower = false
  let upper = false
  let digit = false
  let symbol = false

  for (const byte of bytes) {
    if (isLower(byte)) lower = true
    else if (isUpper(byte)) upper = true
    else if (isDigit(byte)) digit = true
    else symbol = true
  }

  return [lower, upper, digit, symbol].filter(Boolean).length
}

/**
 * Shannon entropy in bits per byte. Random-looking material scores high; English prose and
 * repetitive identifiers score low.
 */
export function shannonEntropy(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0

  const counts = new Map<number, number>()
  for (const byte of bytes) counts.set(byte, (counts.get(byte) ?? 0) + 1)

  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / bytes.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

/**
 * Zero the bytes and drop them. Best-effort, and worth describing as exactly that: it is defeated
 * by a process dump or a swapped page, and it is still far better than letting a declined password
 * become an indefinitely-lived string (PLAN.md 4).
 */
export function wipe(bytes: Uint8Array | null): void {
  bytes?.fill(0)
}
