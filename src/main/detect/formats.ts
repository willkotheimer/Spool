/**
 * Clipboard format names, and what they tell us about a copy (PLAN.md 4).
 *
 * Pure: these are string comparisons over the format names the OS reported. Nothing here reads a
 * clipboard, and nothing here decides policy — `admit.ts` does that.
 */

/**
 * The plain-text flavours. **Not** HTML or RTF: those are text-shaped, but a copy that carries them
 * carries a plain-text flavour too, and that flavour is the one worth storing.
 */
const PLAIN_TEXT_FORMATS = new Set([
  // Windows
  'CF_UNICODETEXT',
  'CF_TEXT',
  'CF_OEMTEXT',
  // macOS, for M14
  'public.utf8-plain-text',
  'public.utf16-plain-text',
  'NSStringPboardType'
])

/**
 * A reference to a file on disk. Declined rather than stored as its path: serving it back would
 * write text where the user expects a file, and the referent can move (PLAN.md 4).
 */
const FILE_REFERENCE_FORMATS = new Set([
  // Windows
  'CF_HDROP',
  'FileName',
  'FileNameW',
  'Shell IDList Array',
  // macOS, for M14
  'public.file-url',
  'NSFilenamesPboardType'
])

/** Pixels. There is no way to tell whether a bitmap is a screenshot of a password (PLAN.md 12). */
const IMAGE_FORMATS = new Set([
  // Windows
  'CF_BITMAP',
  'CF_DIB',
  'CF_DIBV5',
  'CF_METAFILEPICT',
  'CF_ENHMETAFILE',
  'PNG',
  'JFIF',
  'GIF',
  'image/png',
  // macOS, for M14
  'public.png',
  'public.tiff',
  'public.jpeg'
])

const has = (formats: readonly string[], set: ReadonlySet<string>): boolean =>
  formats.some((format) => set.has(format))

export const hasPlainText = (formats: readonly string[]): boolean => has(formats, PLAIN_TEXT_FORMATS)
export const hasFileReference = (formats: readonly string[]): boolean =>
  has(formats, FILE_REFERENCE_FORMATS)
export const hasImage = (formats: readonly string[]): boolean => has(formats, IMAGE_FORMATS)
