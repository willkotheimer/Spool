import { describe, expect, it } from 'vitest'
import { wipe } from './bytes'
import { classify, declaredConcealed, looksLikeSecret } from './sensitivity'

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('Tier 1 — declared (PLAN.md 4)', () => {
  it('trusts the Windows exclusion format', () => {
    const result = declaredConcealed({
      formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
      canIncludeInClipboardHistory: null
    })

    expect(result?.tier).toBe(1)
  })

  it('trusts CanIncludeInClipboardHistory when it says no', () => {
    expect(
      declaredConcealed({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: 0 })?.tier
    ).toBe(1)
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
      })?.tier
    ).toBe(1)
  })

  it('says nothing about an ordinary copy', () => {
    expect(declaredConcealed({ formats: ['CF_UNICODETEXT'], canIncludeInClipboardHistory: null }))
      .toBeNull()
  })

  it('beats a Tier 2 guess, because one is a statement and the other is a shape', () => {
    const result = classify(
      { formats: ['ExcludeClipboardContentFromMonitorProcessing'], canIncludeInClipboardHistory: 0 },
      bytes('just some ordinary text')
    )

    expect(result?.tier).toBe(1)
  })
})

describe('Tier 2 — heuristics (PLAN.md 4)', () => {
  it.each([
    ['a PEM block', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END'],
    ['a JWT', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K'],
    ['an OpenAI key', 'sk-proj-abc123def456ghi789jkl012mno345pqr'],
    ['an AWS access key', 'AKIAIOSFODNN7EXAMPLE'],
    ['a GitHub token', 'ghp_16C7e42F292c6912E7710c838347Ae178B4a'],
    ['a GitHub fine-grained token', 'github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz'],
    ['a Slack token', 'xoxb-123456789012-1234567890123-abcdefgh'],
    ['a Google API key', 'AIzaSyD-abc123DEF456ghi789JKL012mno345PQ'],
    ['a SQL Server connection string', 'Server=tcp:db.example.com;Database=app;Password=hunter2;'],
    ['a lowercase pwd= connection string', 'host=db;user=app;pwd=s3cret;'],
    ['a random-looking secret', 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY']
  ])('flags %s', (_name, content) => {
    expect(looksLikeSecret(bytes(content))?.tier).toBe(2)
  })

  it('names which rule matched, so the prompt can say why', () => {
    expect(looksLikeSecret(bytes('AKIAIOSFODNN7EXAMPLE'))?.rule).toMatch(/AWS/)
    expect(looksLikeSecret(bytes('-----BEGIN CERTIFICATE-----'))?.rule).toMatch(/PEM/)
  })
})

describe('Tier 2 negatives — what must not trip (PLAN.md 11, M5)', () => {
  it.each([
    ['ordinary prose', 'The quick brown fox jumps over the lazy dog, and then does it again.'],
    ['a single sentence', 'Remember to call the plumber about the leak on Tuesday morning.'],
    ['a URL', 'https://github.com/willkotheimer/Spool/blob/main/PLAN.md#milestones'],
    ['a long URL with a query', 'https://example.com/search?q=clipboard+manager&page=2&sort=recent'],
    ['a bare domain', 'www.example.com/some/deep/path/to/a/document'],
    ['a code snippet', 'const spool = createSpool({ id: "default", mode: "fifo" })'],
    ['an import line', "import { captureSnapshot } from './clipboard/capture'"],
    ['a camelCase identifier', 'getUserAccountSettingsFromDatabase'],
    ['a file path', 'C:/Users/wkoth/source/repos/Spool/src/main/detect'],
    ['a short word', 'password'],
    ['a phone number', '+1 (555) 010-9999'],
    ['an email address', 'someone@example.com'],
    ['a hex colour', '#3b82f6'],
    ['a date', '2026-08-22T15:00:00.000Z']
  ])('leaves %s alone', (_name, content) => {
    expect(looksLikeSecret(bytes(content))).toBeNull()
  })

  it('leaves an empty or blank clipboard alone', () => {
    expect(looksLikeSecret(bytes(''))).toBeNull()
    expect(looksLikeSecret(bytes('   \n  '))).toBeNull()
  })
})

describe('wiping (PLAN.md 4)', () => {
  it('zeroes the bytes in place, so the buffer that held a secret no longer does', () => {
    const secret = bytes('AKIAIOSFODNN7EXAMPLE')
    expect(looksLikeSecret(secret)).not.toBeNull()

    wipe(secret)

    expect(secret.every((byte) => byte === 0)).toBe(true)
  })

  it('does not mind being handed nothing', () => {
    expect(() => wipe(null)).not.toThrow()
  })
})

describe('the path exclusion stays narrow', () => {
  it('still flags a secret that merely contains slashes', () => {
    // The AWS secret key shape: slashes throughout, but not a path.
    expect(looksLikeSecret(bytes('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'))?.tier).toBe(2)
  })

  it.each([
    ['a Windows path', 'C:/Users/wkoth/source/repos/Spool/src/main/detect'],
    ['a backslash path', 'C:\\Users\\wkoth\\AppData\\Local\\Programs\\Spool'],
    ['a POSIX path', '/usr/local/share/SpoolThings/Config'],
    ['a UNC path', '\\\\fileserver\\Shared\\Reports\\Q3Summary']
  ])('leaves %s alone', (_name, content) => {
    expect(looksLikeSecret(bytes(content))).toBeNull()
  })
})
