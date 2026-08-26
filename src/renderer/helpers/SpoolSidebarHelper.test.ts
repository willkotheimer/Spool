import { describe, expect, it } from 'vitest'
import type { SpoolSummary } from '../../shared/ipc'
import { clearSpoolsLabel } from './SpoolSidebarHelper'

const spool = (over: Partial<SpoolSummary> & { id: string }): SpoolSummary => ({
  name: over.id,
  count: 0,
  isActive: false,
  isDefault: false,
  isStarred: false,
  retentionHours: null,
  ...over
})

describe('clearSpoolsLabel (PLAN.md 10)', () => {
  it('states what it spares, so the button can be trusted without checking first', () => {
    const spools = [
      spool({ id: 'default', isDefault: true }),
      ...Array.from({ length: 12 }, (_, i) => spool({ id: `plain-${i}` })),
      ...Array.from({ length: 3 }, (_, i) => spool({ id: `starred-${i}`, isStarred: true }))
    ]

    expect(clearSpoolsLabel(spools)).toBe('Clear 12 spools \u00b7 3 starred kept')
  })

  it('says nothing about starred spools when there are none', () => {
    expect(clearSpoolsLabel([spool({ id: 'one' }), spool({ id: 'two' })])).toBe('Clear 2 spools')
  })

  it('reads singular for one spool', () => {
    expect(clearSpoolsLabel([spool({ id: 'only' })])).toBe('Clear 1 spool')
  })

  it('offers nothing when there is nothing to clear', () => {
    expect(clearSpoolsLabel([spool({ id: 'default', isDefault: true })])).toBeNull()
    expect(clearSpoolsLabel([spool({ id: 'starred', isStarred: true })])).toBeNull()
  })
})
