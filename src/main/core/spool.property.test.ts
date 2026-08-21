import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createClip } from './clip'
import { capture, clipCap, createSpool, deleteClip, reorder, serve, setMode } from './spool'
import type { Clip, Mode, Spool, SpoolKind } from './types'

/**
 * The property test of PLAN.md 11, M2. Two invariants have to survive any series of captures,
 * reorders, deletes, mode changes, and cap-triggered evictions:
 *
 *   1. The cursor points at a clip that exists, or is null when the spool is empty. Never a stale
 *      id, never an index that has drifted out of range.
 *   2. Clip count never exceeds the spool's cap — rolling for the default buffer, refusing for a
 *      saved spool.
 *
 * Both kinds are generated, and each run **asserts that it reached the cap**: a property that never
 * fills a spool would pass while proving nothing about the rules that only apply when it is full.
 * That check is the difference between covering eviction and merely claiming to.
 */

type Operation =
  | { kind: 'capture' }
  | { kind: 'serve' }
  | { kind: 'delete'; at: number }
  | { kind: 'reorder'; from: number; to: number }
  | { kind: 'setMode'; mode: Mode }

const operation = fc.oneof(
  // Weighted towards capture so runs push into the caps, where rolling and refusing live.
  { arbitrary: fc.constant<Operation>({ kind: 'capture' }), weight: 6 },
  { arbitrary: fc.constant<Operation>({ kind: 'serve' }), weight: 2 },
  { arbitrary: fc.nat({ max: 200 }).map<Operation>((at) => ({ kind: 'delete', at })), weight: 2 },
  {
    arbitrary: fc
      .tuple(fc.nat({ max: 200 }), fc.nat({ max: 200 }))
      .map<Operation>(([from, to]) => ({ kind: 'reorder', from, to })),
    weight: 2
  },
  {
    arbitrary: fc.constantFrom<Mode>('fifo', 'lifo').map<Operation>((mode) => ({
      kind: 'setMode',
      mode
    })),
    weight: 1
  }
)

const clipAt = (sequence: number): Clip =>
  createClip({
    id: `clip-${sequence}`,
    content: `content ${sequence}`,
    capturedAt: '2026-08-20T12:00:00.000Z'
  })

interface Reached {
  eviction: boolean
  refusal: boolean
  empty: boolean
}

function apply(spool: Spool, operation: Operation, sequence: number, reached: Reached): Spool {
  switch (operation.kind) {
    case 'capture': {
      const result = capture(spool, clipAt(sequence))
      if (result.ok && result.evicted.length > 0) reached.eviction = true
      if (!result.ok) reached.refusal = true
      return result.spool
    }
    case 'serve':
      return serve(spool).spool
    case 'delete': {
      // Address a clip by position so deletes land on real clips however the spool has grown.
      const target = spool.clips[operation.at % Math.max(spool.clips.length, 1)]
      const next = target ? deleteClip(spool, target.id) : spool
      if (next.clips.length === 0) reached.empty = true
      return next
    }
    case 'reorder': {
      const count = Math.max(spool.clips.length, 1)
      return reorder(spool, operation.from % count, operation.to % count)
    }
    case 'setMode':
      return setMode(spool, operation.mode)
  }
}

function checkInvariants(spool: Spool): void {
  // 1. The cursor is an identity that resolves, or null on an empty spool.
  if (spool.clips.length === 0) {
    expect(spool.cursorClipId).toBeNull()
  } else {
    expect(spool.cursorClipId).not.toBeNull()
    expect(spool.clips.some((clip) => clip.id === spool.cursorClipId)).toBe(true)
  }

  // 2. The cap holds, whether this spool rolls or refuses.
  expect(spool.clips.length).toBeLessThanOrEqual(clipCap(spool.kind))

  // Clips stay unique and the array stays dense, which is what the store relies on instead of a
  // UNIQUE (spool_id, position) constraint (PLAN.md 7).
  expect(new Set(spool.clips.map((clip) => clip.id)).size).toBe(spool.clips.length)
}

/** A spool seeded anywhere from empty to full, so short runs still meet the cap. */
function seededSpool(kind: SpoolKind, mode: Mode, fill: number): Spool {
  return createSpool({
    id: 'spool',
    name: 'Property',
    kind,
    mode,
    clips: Array.from({ length: fill }, (_, i) => clipAt(-i - 1))
  })
}

function runProperty(kind: SpoolKind): Reached {
  const reached: Reached = { eviction: false, refusal: false, empty: false }

  fc.assert(
    fc.property(
      fc.array(operation, { minLength: 20, maxLength: 300 }),
      fc.constantFrom<Mode>('fifo', 'lifo'),
      fc.nat({ max: clipCap(kind) }),
      (operations, mode, fill) => {
        let spool = seededSpool(kind, mode, fill)
        checkInvariants(spool)

        operations.forEach((op, index) => {
          spool = apply(spool, op, index, reached)
          checkInvariants(spool)
        })
      }
    ),
    { numRuns: 300 }
  )

  return reached
}

describe('spool invariants over arbitrary operation sequences', () => {
  it('hold for the default spool, which rolls at its cap', () => {
    const reached = runProperty('default')

    expect(reached.eviction, 'the run never filled the buffer, so rolling went untested').toBe(true)
    expect(reached.empty).toBe(true)
  })

  it('hold for a saved spool, which refuses at its cap', () => {
    const reached = runProperty('saved')

    expect(reached.refusal, 'the run never filled the spool, so refusing went untested').toBe(true)
    expect(reached.empty).toBe(true)
  })
})

describe('serving never removes a clip', () => {
  it('leaves the clip list identical however many times it is served', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.integer({ min: 0, max: 200 }),
        fc.constantFrom<Mode>('fifo', 'lifo'),
        (clipCount, serves, mode) => {
          let spool = seededSpool('saved', mode, clipCount)
          const before = spool.clips.map((clip) => clip.id)

          for (let i = 0; i < serves; i++) {
            const result = serve(spool)
            expect(result.ok).toBe(true)
            if (result.ok) spool = result.spool
          }

          expect(spool.clips.map((clip) => clip.id)).toEqual(before)
        }
      ),
      { numRuns: 100 }
    )
  })
})
