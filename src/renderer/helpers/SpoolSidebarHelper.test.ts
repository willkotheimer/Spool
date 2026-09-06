import { describe, expect, it } from 'vitest'
import type { SpoolSummary } from '../../shared/ipc'
import { clearSpoolsLabel } from './SpoolSidebarHelper'

const spool = (over: Partial<SpoolSummary> & { id: string }): SpoolSummary => ({
  name: over.id,
  count: 0,
  isActive: false,
  isDefault: false,
  retentionHours: null,
  ...over
})

describe('clearSpoolsLabel (PLAN.md 9)', () => {
  it('names how many it will take, so the button can be trusted without checking first', () => {
    const spools = [
      spool({ id: 'default', isDefault: true }),
      ...Array.from({ length: 12 }, (_, i) => spool({ id: `plain-${i}` }))
    ]

    expect(clearSpoolsLabel(spools)).toBe('Clear 12 spools')
  })

  it('reads singular for one spool', () => {
    expect(clearSpoolsLabel([spool({ id: 'only' })])).toBe('Clear 1 spool')
  })

  it('offers nothing when only the default spool is left', () => {
    expect(clearSpoolsLabel([spool({ id: 'default', isDefault: true })])).toBeNull()
  })

  // The count and the action have to agree. They did not once: the label counted the active spool
  // and the action then skipped it, so "Clear 1 spool" did nothing at all.
  it('counts the active spool, which is cleared like any other', () => {
    expect(clearSpoolsLabel([spool({ id: 'only', isActive: true })])).toBe('Clear 1 spool')
  })
})
