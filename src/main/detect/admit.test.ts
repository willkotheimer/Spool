import { describe, expect, it } from 'vitest'
import { admit, isDuplicate, type ClipboardSnapshot } from './admit'

const snapshot = (formats: string[], text: string | null = null): ClipboardSnapshot => ({
  formats,
  bytes: text === null ? null : new TextEncoder().encode(text)
})

/** Admission hands back bytes, never a string (PLAN.md 4) — decode to read them in a test. */
const admittedText = (result: ReturnType<typeof admit>): string | null =>
  result.admit ? new TextDecoder().decode(result.bytes) : null

// The worked cases of PLAN.md 4 — "because these are what implementations get wrong".
describe('the worked cases (PLAN.md 4)', () => {
  it('captures the text of a browser paragraph carrying an inline image', () => {
    const result = admit(
      snapshot(['CF_UNICODETEXT', 'CF_TEXT', 'HTML Format', 'CF_DIB'], 'A paragraph.')
    )

    expect(admittedText(result)).toBe('A paragraph.')
  })

  it('captures the tab-delimited flavour of a range of Excel cells', () => {
    const excel = snapshot(
      ['CF_UNICODETEXT', 'HTML Format', 'Biff12', 'CF_DIB', 'CF_BITMAP'],
      'a\tb\tc\n1\t2\t3'
    )

    expect(admittedText(admit(excel))).toBe('a\tb\tc\n1\t2\t3')
  })

  it('captures selected text in a PDF reader', () => {
    expect(admittedText(admit(snapshot(['CF_UNICODETEXT'], 'Selected sentence.')))).toBe(
      'Selected sentence.'
    )
  })

  it('declines a region of a PDF copied as a picture', () => {
    expect(admit(snapshot(['CF_DIB', 'CF_BITMAP']))).toEqual({ admit: false, reason: 'image' })
  })

  it('declines report.pdf selected in Explorer, where no text flavour is guaranteed', () => {
    const explorer = snapshot([
      'CF_HDROP',
      'Shell IDList Array',
      'FileNameW',
      'Preferred DropEffect'
    ])

    expect(admit(explorer)).toEqual({ admit: false, reason: 'file' })
  })

  it('takes the text of an embedded object when there is one, and declines when there is not', () => {
    expect(admittedText(admit(snapshot(['Embed Source', 'CF_DIB', 'CF_UNICODETEXT'], 'Chart title')))).toBe(
      'Chart title'
    )
    expect(admit(snapshot(['Embed Source', 'CF_DIB']))).toEqual({ admit: false, reason: 'image' })
  })
})

describe('admit', () => {
  it('ignores HTML and RTF, which are text-shaped but not a plain-text flavour', () => {
    expect(admit(snapshot(['HTML Format', 'Rich Text Format']))).toEqual({
      admit: false,
      reason: 'unsupported'
    })
  })

  it('declines a screenshot', () => {
    expect(admit(snapshot(['CF_BITMAP', 'CF_DIB', 'CF_DIBV5', 'PNG']))).toEqual({
      admit: false,
      reason: 'image'
    })
  })

  it('names a file copy as a file even when an image preview rides along', () => {
    expect(admit(snapshot(['CF_HDROP', 'CF_DIB']))).toEqual({ admit: false, reason: 'file' })
  })

  it('declines an empty clipboard without anything to say about it', () => {
    expect(admit(snapshot([]))).toEqual({ admit: false, reason: 'empty' })
  })

  it('declines a text flavour that carries no text', () => {
    expect(admit(snapshot(['CF_UNICODETEXT'], ''))).toEqual({ admit: false, reason: 'unsupported' })
    expect(admit(snapshot(['CF_UNICODETEXT'], null))).toEqual({
      admit: false,
      reason: 'unsupported'
    })
  })

  it('keeps whitespace, which is a real thing to copy', () => {
    expect(admittedText(admit(snapshot(['CF_UNICODETEXT'], '\t')))).toBe('\t')
  })

  it('reads macOS pasteboard types too, for M14', () => {
    expect(admittedText(admit(snapshot(['public.utf8-plain-text'], 'from a Mac')))).toBe(
      'from a Mac'
    )
    expect(admit(snapshot(['public.file-url']))).toEqual({ admit: false, reason: 'file' })
  })
})

describe('isDuplicate', () => {
  it('ignores an identical consecutive copy', () => {
    expect(isDuplicate('same', 'same')).toBe(true)
  })

  it('captures the same text again when something else came between', () => {
    expect(isDuplicate('same', 'different')).toBe(false)
  })

  it('captures the first clip of a session', () => {
    expect(isDuplicate('anything', null)).toBe(false)
  })
})
