import { describe, expect, it } from 'vitest'
import { formatBytes, lastUsedLabel, percentFull } from './CapacityHelper'

const NOW = new Date('2026-08-26T12:00:00.000Z')
const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

describe('lastUsedLabel', () => {
  it('says plainly when a spool has never been used', () => {
    expect(lastUsedLabel(null, NOW)).toBe('never used')
    expect(lastUsedLabel('not a date', NOW)).toBe('never used')
  })

  it('reads in days up to a month, then in months', () => {
    expect(lastUsedLabel(daysAgo(0), NOW)).toBe('used today')
    expect(lastUsedLabel(daysAgo(1), NOW)).toBe('used yesterday')
    expect(lastUsedLabel(daysAgo(9), NOW)).toBe('used 9 days ago')
    expect(lastUsedLabel(daysAgo(31), NOW)).toBe('used a month ago')
    expect(lastUsedLabel(daysAgo(75), NOW)).toBe('used 2 months ago')
  })
})

describe('formatBytes', () => {
  it('reads in the largest unit that leaves a number worth reading', () => {
    expect(formatBytes(82 * 1024 * 1024)).toBe('82 MB')
    expect(formatBytes(1536 * 1024)).toBe('1.5 MB')
    expect(formatBytes(4096)).toBe('4 KB')
    expect(formatBytes(120)).toBe('120 bytes')
  })
})

describe('percentFull', () => {
  it('rounds, and never reads past full or below empty', () => {
    expect(percentFull(0.904)).toBe('90%')
    expect(percentFull(1.4)).toBe('100%')
    expect(percentFull(-0.2)).toBe('0%')
  })
})
