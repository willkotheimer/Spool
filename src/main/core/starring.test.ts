import { describe, expect, it } from 'vitest'
import { STARRED_SPOOL_CAP, STORE_BYTE_BUDGET } from './limits'
import {
  STARRED_BYTE_RESERVE,
  canStar,
  clearableSpools,
  starredBytes,
  starredFirst,
  starredReserveReached,
  type StarrableSpool
} from './starring'

const MIB = 1024 * 1024

const spool = (over: Partial<StarrableSpool> & { id: string }): StarrableSpool => ({
  isDefault: false,
  isStarred: false,
  bytes: MIB,
  ...over
})

describe('what may be starred (PLAN.md 10)', () => {
  it('stars an ordinary saved spool', () => {
    expect(canStar([spool({ id: 'a' })], 'a')).toEqual({ ok: true })
  })

  it('refuses the default spool, which is a buffer rather than an artifact', () => {
    const decision = canStar([spool({ id: 'default', isDefault: true })], 'default')

    expect(decision.ok).toBe(false)
    expect(decision.ok === false && decision.reason).toBe('default_spool')
    expect(decision.ok === false && decision.message).toMatch(/buffer/i)
  })

  it('refuses the sixth star, naming the limit that stopped it', () => {
    const spools = [
      ...Array.from({ length: STARRED_SPOOL_CAP }, (_, i) =>
        spool({ id: `starred-${i}`, isStarred: true })
      ),
      spool({ id: 'hopeful' })
    ]

    const decision = canStar(spools, 'hopeful')

    expect(decision.ok).toBe(false)
    expect(decision.ok === false && decision.reason).toBe('star_cap')
    expect(decision.ok === false && decision.message).toContain(String(STARRED_SPOOL_CAP))
    // And it says plainly that refusing costs nothing.
    expect(decision.ok === false && decision.message).toMatch(/nothing is deleted/i)
  })

  it('refuses a star that would push starred bytes past the reserve', () => {
    const spools = [
      spool({ id: 'big', isStarred: true, bytes: STARRED_BYTE_RESERVE - 10 * MIB }),
      spool({ id: 'hopeful', bytes: 40 * MIB })
    ]

    const decision = canStar(spools, 'hopeful')

    expect(decision.ok).toBe(false)
    expect(decision.ok === false && decision.reason).toBe('reserve')
    expect(decision.ok === false && decision.message).toMatch(/half the space/i)
    expect(decision.ok === false && decision.message).toMatch(/nothing has been deleted/i)
  })

  it('allows a star that lands exactly on the reserve', () => {
    const spools = [
      spool({ id: 'big', isStarred: true, bytes: STARRED_BYTE_RESERVE - 5 * MIB }),
      spool({ id: 'hopeful', bytes: 5 * MIB })
    ]

    expect(canStar(spools, 'hopeful')).toEqual({ ok: true })
  })

  it('does not object to a spool that is already starred', () => {
    const spools = Array.from({ length: STARRED_SPOOL_CAP }, (_, i) =>
      spool({ id: `starred-${i}`, isStarred: true })
    )

    expect(canStar(spools, 'starred-0')).toEqual({ ok: true })
  })

  it('measures the reserve against real bytes, so ordinary spools never meet it', () => {
    const ordinary = Array.from({ length: STARRED_SPOOL_CAP - 1 }, (_, i) =>
      spool({ id: `s${i}`, isStarred: true, bytes: 2 * MIB })
    )

    expect(canStar([...ordinary, spool({ id: 'one more', bytes: 2 * MIB })], 'one more')).toEqual({
      ok: true
    })
  })
})

describe('the reserve arithmetic (PLAN.md 10)', () => {
  it('is half the store budget', () => {
    expect(STARRED_BYTE_RESERVE).toBe(STORE_BYTE_BUDGET / 2)
  })

  it('leaves at least 45% of the budget reclaimable at the 95% floor', () => {
    // The whole justification: starred ≤ 50%, floor at 95%, so 45% is always non-starred.
    // Compared to the byte: the two sides differ by a fraction of one in floating point, which is
    // an artifact of writing the percentages as decimals rather than anything about the reserve.
    const reclaimableAtFloor = STORE_BYTE_BUDGET * 0.95 - STARRED_BYTE_RESERVE

    expect(Math.round(reclaimableAtFloor)).toBeGreaterThanOrEqual(
      Math.round(STORE_BYTE_BUDGET * 0.45)
    )
  })

  it('knows when a starred spool must stop accepting clips', () => {
    const under = [spool({ id: 'a', isStarred: true, bytes: STARRED_BYTE_RESERVE - 1 })]
    const at = [spool({ id: 'a', isStarred: true, bytes: STARRED_BYTE_RESERVE })]

    expect(starredReserveReached(under)).toBe(false)
    expect(starredReserveReached(at)).toBe(true)
  })

  it('counts only starred spools towards it', () => {
    const spools = [
      spool({ id: 'starred', isStarred: true, bytes: 10 * MIB }),
      spool({ id: 'plain', bytes: 400 * MIB })
    ]

    expect(starredBytes(spools)).toBe(10 * MIB)
  })
})

describe('ordering and clearing (PLAN.md 10)', () => {
  const listed = [
    { id: 'default', isDefault: true, isStarred: false },
    { id: 'plain-a', isDefault: false, isStarred: false },
    { id: 'starred-a', isDefault: false, isStarred: true },
    { id: 'plain-b', isDefault: false, isStarred: false },
    { id: 'starred-b', isDefault: false, isStarred: true }
  ]

  it('sorts starred spools to the top, with the default spool above them', () => {
    expect(starredFirst(listed).map((s) => s.id)).toEqual([
      'default',
      'starred-a',
      'starred-b',
      'plain-a',
      'plain-b'
    ])
  })

  it('keeps the order stable among equals, so lists do not shuffle', () => {
    const twice = starredFirst(starredFirst(listed))

    expect(twice.map((s) => s.id)).toEqual(starredFirst(listed).map((s) => s.id))
  })

  it('clears unstarred spools and spares the starred ones', () => {
    const { clearing, sparing } = clearableSpools(listed)

    expect(clearing.map((s) => s.id)).toEqual(['plain-a', 'plain-b'])
    expect(sparing.map((s) => s.id)).toEqual(['starred-a', 'starred-b'])
  })

  it('never clears the default spool, which has to exist to catch a copy', () => {
    expect(clearableSpools(listed).clearing.some((s) => s.isDefault)).toBe(false)
  })
})
