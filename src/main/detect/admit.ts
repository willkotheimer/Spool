import { hasFileReference, hasImage, hasPlainText } from './formats'

/**
 * The admission rule of PLAN.md 4: what counts as text, and what happens to everything else.
 *
 * **Text-flavour-first, not type detection.** A clipboard normally carries several representations
 * of the same copy at once — a browser paragraph arrives as text, HTML, and sometimes an inline
 * image together. Asking "does this contain an image" would wrongly decline that paragraph, and
 * would decline a range of spreadsheet cells, which is one of the most useful things to capture. So
 * the question is only ever "is there a plain-text flavour", and every other representation is
 * ignored.
 *
 * The format check runs **before** the sensitivity check of M5: there is no point classifying
 * something that will not be stored either way.
 */

/** What the OS handed over when the clipboard changed. */
export interface ClipboardSnapshot {
  /** Format names the OS reported, in no particular order. */
  readonly formats: readonly string[]
  /** The plain-text flavour, if the clipboard offered one. */
  readonly text: string | null
  /** The application that owns the copy, where the OS exposes it. */
  readonly sourceApp?: string | null
}

/** Why a copy was not captured. `empty` is the one that produces no notice. */
export type DeclineReason = 'file' | 'image' | 'unsupported' | 'empty'

export type Admission =
  | { readonly admit: true; readonly text: string }
  | { readonly admit: false; readonly reason: DeclineReason }

export function admit(snapshot: ClipboardSnapshot): Admission {
  if (hasPlainText(snapshot.formats) && snapshot.text !== null && snapshot.text.length > 0) {
    return { admit: true, text: snapshot.text }
  }

  // A clipboard with no text flavour at all is a non-text copy. Name it as precisely as the
  // formats allow, because "Files aren't captured" and "Images aren't captured" are different
  // things to be told.
  if (hasFileReference(snapshot.formats)) return { admit: false, reason: 'file' }
  if (hasImage(snapshot.formats)) return { admit: false, reason: 'image' }
  if (snapshot.formats.length === 0) return { admit: false, reason: 'empty' }

  return { admit: false, reason: 'unsupported' }
}

/**
 * Duplicate suppression: an identical consecutive clip is ignored (PLAN.md 11, M3).
 *
 * Consecutive, not global — copying the same value again an hour and forty clips later is a
 * deliberate act, and the spool is a thing the user arranges rather than a set.
 */
export function isDuplicate(text: string, lastCapturedText: string | null): boolean {
  return lastCapturedText !== null && text === lastCapturedText
}
