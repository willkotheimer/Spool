/**
 * What the source application declared about a copy (PLAN.md 4), read from the clipboard formats
 * rather than from the content.
 *
 * **Guessing from content was removed.** Spool used to also scan for PEM blocks, JWTs, key
 * prefixes, connection-string keywords and high-entropy strings, and prompt when one matched. It
 * interrupted an ordinary workflow — copying a credential is a normal thing to do, and nothing here
 * leaves the machine — to say something the user already knew. It was also the entire cost of
 * capture: 147ms per MiB, because each needle walked the whole buffer separately.
 *
 * What is kept is not a guess. `CanIncludeInClipboardHistory = 0` is an explicit statement from the
 * application that owns the secret, saying *do not persist this*; Windows' own Clipboard History
 * obeys it. Spool makes a transient thing durable, so ignoring that request would persist exactly
 * what a password manager asked it not to, and behave worse than the OS feature beside it. It costs
 * a flag check.
 */

export interface Sensitivity {
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

/** The source application marked this as secret. Password managers do this. */
export function declaredConcealed(signals: ConcealmentSignals): Sensitivity | null {
  if (signals.formats.some((format) => DECLARED_FORMATS.has(format))) {
    return { rule: 'the application marked it as concealed' }
  }
  if (signals.canIncludeInClipboardHistory === 0) {
    return { rule: 'the application asked to be kept out of clipboard history' }
  }
  return null
}

/**
 * The whole classification. One question now: did the application say so?
 *
 * It no longer takes the content, which is the point. Nothing here reads what you copied.
 */
export function classify(signals: ConcealmentSignals): Sensitivity | null {
  return declaredConcealed(signals)
}
