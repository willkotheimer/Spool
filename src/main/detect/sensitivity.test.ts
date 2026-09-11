import { describe, expect, it } from 'vitest'
import { classify, declaredConcealed } from './sensitivity'

describe('what the application declared (PLAN.md 4)', () => {
  it('trusts the Windows exclusion format', () => {
    const result = declaredConcealed({
      formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
      canIncludeInClipboardHistory: null
    })

    expect(result?.rule).toMatch(/concealed/)
  })

  it('trusts CanIncludeInClipboardHistory when it says no', () => {
    expect(
      declaredConcealed({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: 0 })?.rule
    ).toMatch(/clipboard history/)
  })

  it('does not fire when that format says yes', () => {
    expect(
      declaredConcealed({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: 1 })
    ).toBeNull()
  })

  it('trusts the macOS concealed type', () => {
    expect(
      declaredConcealed({
        formats: ['public.utf8-plain-text', 'org.nspasteboard.ConcealedType'],
        canIncludeInClipboardHistory: null
      })?.rule
    ).toMatch(/concealed/)
  })

  it('says nothing about an ordinary copy', () => {
    expect(declaredConcealed({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: null }))
      .toBeNull()
  })

  it('is the only thing that raises a prompt', () => {
    const result = classify({
      formats: ['ExcludeClipboardContentFromMonitorProcessing'],
      canIncludeInClipboardHistory: 0
    })

    expect(result?.rule).toMatch(/concealed/)
  })
})

// The heuristics that used to live here are gone. They guessed from content — PEM blocks, JWTs,
// key prefixes, connection-string keywords, high-entropy strings — and prompted on a match. They
// interrupted an ordinary workflow to report something the user already knew, and cost 147ms per
// MiB because every needle walked the whole buffer. Nothing Spool holds leaves the machine, so the
// guessing bought nothing it was worth paying for.
describe('nothing is guessed from content (PLAN.md 4)', () => {
  it('keeps a credential without asking, because copying one is an ordinary thing to do', () => {
    // Content is not even passed in any more, which is the strongest form this claim can take.
    expect(classify({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: null })).toBeNull()
    expect(classify({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: 1 })).toBeNull()
  })

  it('still asks when the application itself declared the copy concealed', () => {
    const declared = { formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: 0 }
    expect(classify(declared)?.rule).toMatch(/clipboard history/)
  })
})
