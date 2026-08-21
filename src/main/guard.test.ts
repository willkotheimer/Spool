import { describe, expect, it } from 'vitest'
import {
  GUARDED_CALLS,
  NetworkAccessError,
  devServerOrigins,
  installNetworkGuard,
  isAllowed
} from './guard'

// Node's networking cannot be removed the way a crate can, so the guarantee is that every entry
// point throws (PLAN.md 5c). These tests are that guarantee, not a description of it.
installNetworkGuard()

describe('installNetworkGuard', () => {
  it.each(GUARDED_CALLS)('%s throws instead of connecting', (_name, call) => {
    expect(call).toThrow(NetworkAccessError)
  })

  it('names the API in the error so a crash report says what happened', () => {
    expect(() => globalThis.fetch('https://example.com')).toThrow(/fetch/)
  })

  it('is idempotent', () => {
    installNetworkGuard()
    installNetworkGuard()
    expect(() => globalThis.fetch('https://example.com')).toThrow(NetworkAccessError)
  })
})

describe('isAllowed', () => {
  const dev = devServerOrigins('http://localhost:5173/')

  it('cancels every remote origin when nothing is allowed', () => {
    for (const url of [
      'https://example.com/',
      'http://example.com/',
      'ws://example.com/',
      'https://telemetry.example.com/v1/events'
    ]) {
      expect(isAllowed(url, [])).toBe(false)
    }
  })

  it('lets the renderer read its own local bytes', () => {
    expect(isAllowed('file:///C:/app/out/renderer/index.html', [])).toBe(true)
    expect(isAllowed('devtools://devtools/bundled/inspector.html', [])).toBe(true)
    expect(isAllowed('data:image/png;base64,iVBOR', [])).toBe(true)
  })

  it('allows the dev server origin only when one was passed', () => {
    expect(isAllowed('http://localhost:5173/src/main.tsx', dev)).toBe(true)
    expect(isAllowed('ws://localhost:5173/', dev)).toBe(true)
    expect(isAllowed('http://localhost:5173/src/main.tsx', [])).toBe(false)
  })

  it('does not let a lookalike host through on the dev allowance', () => {
    expect(isAllowed('http://localhost:5173.example.com/', dev)).toBe(false)
    expect(isAllowed('http://evil.com/?x=http://localhost:5173/', dev)).toBe(false)
  })
})
