import { describe, expect, it } from 'vitest'
import { RETENTION_LABELS, formatLimit, retentionLabel } from './SettingsPanelHelper'

describe('retentionLabel', () => {
  it('says plainly when nothing expires, which is the default', () => {
    expect(retentionLabel(null)).toBe('kept until removed')
  })

  it('reads in hours below a day and days above it', () => {
    expect(retentionLabel(1)).toBe('1 hour')
    expect(retentionLabel(6)).toBe('6 hours')
    expect(retentionLabel(24)).toBe('1 day')
    expect(retentionLabel(168)).toBe('7 days')
  })
})

describe('the offered choices', () => {
  it('lead with no limit, so the safe option is the first one', () => {
    expect(RETENTION_LABELS[0].value).toBe('none')
  })

  it('are all readable back as a limit', () => {
    for (const { value } of RETENTION_LABELS.slice(1)) {
      expect(Number(value)).toBeGreaterThan(0)
      expect(retentionLabel(Number(value))).toMatch(/hour|day/)
    }
  })
})

describe('formatLimit', () => {
  it('reads caps in the units they were written in', () => {
    expect(formatLimit(1024 * 1024)).toBe('1 MB')
    expect(formatLimit(512 * 1024 * 1024)).toBe('512 MB')
    expect(formatLimit(64 * 1024)).toBe('64 KB')
  })
})
