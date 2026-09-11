/**
 * Working on clipboard bytes rather than strings (PLAN.md 4).
 *
 * This module was once a small byte-searching library — `ascii`, `startsWith`, `includes`,
 * `indexOf`, `trim`, `isDigit`, `hasWhitespace`, `characterClasses`, `shannonEntropy` — built so the
 * secret heuristics could scan a copy without ever turning it into a string. The heuristics were
 * removed, and every one of those went with them: there is nothing left that reads the content.
 *
 * `wipe` stays, and it is the one that mattered. A clip the user declines must not be left in
 * memory, and zeroing the buffer is the only thing this file does now.
 */

/**
 * Zero the bytes and drop them. Best-effort, and worth describing as exactly that: it is defeated
 * by a process dump or a swapped page, and it is still far better than letting a declined password
 * become an indefinitely-lived string (PLAN.md 4).
 */
export function wipe(bytes: Uint8Array | null): void {
  bytes?.fill(0)
}
