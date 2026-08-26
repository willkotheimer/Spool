import { describe, expect, it } from 'vitest'
import {
  ADVISE_AT,
  closestMeasure,
  describeMeasure,
  freedBy,
  measures,
  rankCandidates,
  shouldAdvise,
  type CapacityCandidate
} from './capacity'
import { SAVED_SPOOL_CAP, SAVED_SPOOL_CLIP_CAP, STORE_BYTE_BUDGET } from './limits'

const MIB = 1024 * 1024
const empty = { storeBytes: 0, savedSpools: 0, clipsInActiveSpool: 0 }

const candidate = (over: Partial<CapacityCandidate> & { id: string }): CapacityCandidate => ({
  name: over.id,
  clips: 1,
  bytes: MIB,
  lastUsedAt: '2026-08-01T00:00:00.000Z',
  isDefault: false,
  isActive: false,
  ...over
})

describe('the three measures (PLAN.md 9)', () => {
  it('watches bytes, saved spools, and clips in the spool being captured into', () => {
    expect(measures(empty).map((m) => m.name)).toEqual(['bytes', 'spools', 'clips'])
  })

  it('reports each against its cap from PLAN.md 3', () => {
    const [bytes, spools, clips] = measures(empty)

    expect(bytes.cap).toBe(STORE_BYTE_BUDGET)
    expect(spools.cap).toBe(SAVED_SPOOL_CAP)
    expect(clips.cap).toBe(SAVED_SPOOL_CLIP_CAP)
  })

  it('picks whichever is closest to its cap, which is the one the modal names', () => {
    const nearlyFullOfBytes = { ...empty, storeBytes: STORE_BYTE_BUDGET * 0.92, savedSpools: 10 }
    expect(closestMeasure(nearlyFullOfBytes).name).toBe('bytes')

    const manySpools = { ...empty, storeBytes: MIB, savedSpools: SAVED_SPOOL_CAP - 1 }
    expect(closestMeasure(manySpools).name).toBe('spools')

    const fullSpool = { ...empty, clipsInActiveSpool: SAVED_SPOOL_CLIP_CAP - 2 }
    expect(closestMeasure(fullSpool).name).toBe('clips')
  })

  it('advises at ninety per cent, and not before', () => {
    const justUnder = closestMeasure({ ...empty, storeBytes: STORE_BYTE_BUDGET * 0.89 })
    const justOver = closestMeasure({ ...empty, storeBytes: STORE_BYTE_BUDGET * ADVISE_AT })

    expect(shouldAdvise(justUnder)).toBe(false)
    expect(shouldAdvise(justOver)).toBe(true)
  })

  it('names what the percentage is of, because a bare percentage is not usable', () => {
    const bytes = closestMeasure({ ...empty, storeBytes: 461 * MIB })
    expect(describeMeasure(bytes)).toBe('461 MB of the 512 MB this app keeps for clips')

    const spools = closestMeasure({ ...empty, savedSpools: 45 })
    expect(describeMeasure(spools)).toBe('45 of 50 saved spools')

    const clips = closestMeasure({ ...empty, clipsInActiveSpool: 90 })
    expect(describeMeasure(clips)).toBe('90 of 100 clips in the spool you are capturing into')
  })
})

describe('which spools are offered (PLAN.md 9)', () => {
  it('never proposes the default spool or the active one', () => {
    const ranked = rankCandidates([
      candidate({ id: 'default', isDefault: true }),
      candidate({ id: 'active', isActive: true }),
      candidate({ id: 'ordinary' })
    ])

    expect(ranked.map((c) => c.id)).toEqual(['ordinary'])
  })

  it('ranks oldest-used first at the advisory threshold', () => {
    const ranked = rankCandidates([
      candidate({ id: 'recent', lastUsedAt: '2026-08-20T00:00:00.000Z' }),
      candidate({ id: 'ancient', lastUsedAt: '2025-01-01T00:00:00.000Z' }),
      candidate({ id: 'middling', lastUsedAt: '2026-06-01T00:00:00.000Z' })
    ])

    expect(ranked.map((c) => c.id)).toEqual(['ancient', 'middling', 'recent'])
  })

  it('treats a spool that has never been used as the oldest', () => {
    const ranked = rankCandidates([
      candidate({ id: 'used', lastUsedAt: '2020-01-01T00:00:00.000Z' }),
      candidate({ id: 'never', lastUsedAt: null })
    ])

    expect(ranked[0].id).toBe('never')
  })

  it('ranks largest first at the floor, where the goal is bytes reclaimed quickly', () => {
    const ranked = rankCandidates(
      [
        candidate({ id: 'small', bytes: 1 * MIB, lastUsedAt: '2020-01-01T00:00:00.000Z' }),
        candidate({ id: 'huge', bytes: 90 * MIB, lastUsedAt: '2026-08-20T00:00:00.000Z' }),
        candidate({ id: 'medium', bytes: 40 * MIB })
      ],
      'largest'
    )

    expect(ranked.map((c) => c.id)).toEqual(['huge', 'medium', 'small'])
  })

  it('breaks ties by name, so the list does not shuffle between openings', () => {
    const ranked = rankCandidates([
      candidate({ id: 'b', name: 'Beta', lastUsedAt: null }),
      candidate({ id: 'a', name: 'Alpha', lastUsedAt: null })
    ])

    expect(ranked.map((c) => c.name)).toEqual(['Alpha', 'Beta'])
  })
})

describe('the running total (PLAN.md 9)', () => {
  const candidates = [
    candidate({ id: 'one', bytes: 30 * MIB }),
    candidate({ id: 'two', bytes: 52 * MIB }),
    candidate({ id: 'three', bytes: 7 * MIB })
  ]

  it('adds up exactly what checking those rows would free', () => {
    expect(freedBy(candidates, ['one', 'two'])).toEqual({ spools: 2, bytes: 82 * MIB })
  })

  it('is nothing when nothing is checked', () => {
    expect(freedBy(candidates, [])).toEqual({ spools: 0, bytes: 0 })
  })

  it('ignores an id that is not on offer', () => {
    expect(freedBy(candidates, ['one', 'a-spool-that-is-not-a-candidate'])).toEqual({
      spools: 1,
      bytes: 30 * MIB
    })
  })
})
