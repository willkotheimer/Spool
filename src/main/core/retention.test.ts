import { describe, expect, it } from 'vitest'
import { createClip } from './clip'
import { expireClips, isRetentionHours } from './retention'
import { createSpool } from './spool'
import type { Clip, Mode, Spool } from './types'

const NOW = new Date('2026-08-24T12:00:00.000Z')
const hoursAgo = (hours: number): string =>
  new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString()

const clip = (id: string, ageHours: number): Clip =>
  createClip({ id, content: `content ${id}`, capturedAt: hoursAgo(ageHours) })

const spoolOf = (clips: Clip[], mode: Mode = 'fifo'): Spool =>
  createSpool({ id: 's', name: 'Test', kind: 'saved', mode, clips })

describe('age-based retention (PLAN.md 11, M9)', () => {
  it('drops clips older than the limit and keeps the rest', () => {
    const spool = spoolOf([clip('old', 30), clip('borderline', 25), clip('fresh', 2)])

    const { spool: after, expired } = expireClips(spool, 24, NOW)

    expect(expired.map((c) => c.id)).toEqual(['old', 'borderline'])
    expect(after.clips.map((c) => c.id)).toEqual(['fresh'])
  })

  it('does nothing at all without a limit, which is the default', () => {
    const spool = spoolOf([clip('ancient', 10_000)])

    expect(expireClips(spool, null, NOW)).toEqual({ spool, expired: [] })
  })

  it('keeps a clip that is exactly at the limit', () => {
    const spool = spoolOf([clip('exactly', 24)])

    expect(expireClips(spool, 24, NOW).expired).toEqual([])
  })

  it('moves the cursor per PLAN.md 3 when the clip it points at expires', () => {
    const spool = { ...spoolOf([clip('a', 40), clip('b', 30), clip('c', 1)]), cursorClipId: 'a' }

    const { spool: after } = expireClips(spool, 24, NOW)

    expect(after.clips.map((c) => c.id)).toEqual(['c'])
    expect(after.cursorClipId).toBe('c')
  })

  it('leaves the cursor alone when something else expires', () => {
    const spool = { ...spoolOf([clip('old', 40), clip('kept', 1)]), cursorClipId: 'kept' }

    expect(expireClips(spool, 24, NOW).spool.cursorClipId).toBe('kept')
  })

  it('empties a spool whose clips have all aged out, leaving a null cursor', () => {
    const spool = spoolOf([clip('a', 40), clip('b', 50)])

    const { spool: after } = expireClips(spool, 24, NOW)

    expect(after.clips).toEqual([])
    expect(after.cursorClipId).toBeNull()
  })

  it('treats an unreadable timestamp as new, because retention removes things', () => {
    const broken = { ...clip('broken', 0), capturedAt: 'not a date' }

    expect(expireClips(spoolOf([broken]), 1, NOW).expired).toEqual([])
  })

  it('ignores a nonsensical limit rather than deleting everything', () => {
    const spool = spoolOf([clip('a', 100)])

    expect(expireClips(spool, 0, NOW).expired).toEqual([])
    expect(expireClips(spool, -5, NOW).expired).toEqual([])
  })
})

describe('isRetentionHours', () => {
  it('accepts no limit and any positive number of hours', () => {
    expect(isRetentionHours(null)).toBe(true)
    expect(isRetentionHours(24)).toBe(true)
  })

  it('rejects anything that would delete on the wrong schedule', () => {
    expect(isRetentionHours(0)).toBe(false)
    expect(isRetentionHours(-1)).toBe(false)
    expect(isRetentionHours('24')).toBe(false)
    expect(isRetentionHours(Number.NaN)).toBe(false)
    expect(isRetentionHours(undefined)).toBe(false)
  })
})
