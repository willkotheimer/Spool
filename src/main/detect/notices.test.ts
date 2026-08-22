import { describe, expect, it } from 'vitest'
import { CLIP_BYTE_CAP } from '../core/limits'
import { categoryForDecline, emptyLedger, formatBytes, noticeFor } from './notices'

describe('noticeFor', () => {
  it('says it once per category per session', () => {
    const first = noticeFor(emptyLedger, 'image')
    expect(first?.notice.message).toBe("Images aren't captured in this version")

    // Twenty screenshots produce one notice (PLAN.md 4).
    let ledger = first!.ledger
    for (let i = 0; i < 20; i++) {
      expect(noticeFor(ledger, 'image')).toBeNull()
    }

    // A different category is still worth saying.
    const file = noticeFor(ledger, 'file')
    expect(file?.notice.message).toBe("Files aren't captured in this version")
    ledger = file!.ledger
    expect(noticeFor(ledger, 'file')).toBeNull()
    expect(noticeFor(ledger, 'image')).toBeNull()
  })

  it('reads differently for size than for a format decline', () => {
    const size = noticeFor(emptyLedger, 'size', { bytes: 4.2 * 1024 * 1024, limit: CLIP_BYTE_CAP })

    expect(size?.notice.message).toBe('That copy was 4.2 MB, over the 1 MB limit for one clip')
    // The size case is not about what kind of thing was copied, and must not read like it is.
    expect(size?.notice.message).not.toMatch(/aren't captured/)
  })

  it('leaves the ledger it was given alone', () => {
    const result = noticeFor(emptyLedger, 'image')

    expect(result).not.toBeNull()
    expect(emptyLedger.size).toBe(0)
  })
})

describe('formatBytes', () => {
  it('reads in the largest unit that leaves a number worth reading', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(512)).toBe('512 bytes')
  })
})

describe('categoryForDecline', () => {
  it('has nothing to say about an empty clipboard', () => {
    expect(categoryForDecline('empty')).toBeNull()
  })

  it('passes every other decline through as its own category', () => {
    expect(categoryForDecline('file')).toBe('file')
    expect(categoryForDecline('image')).toBe('image')
    expect(categoryForDecline('unsupported')).toBe('unsupported')
  })
})
