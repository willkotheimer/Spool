/**
 * The network kill switch (PLAN.md 5c). Imported before anything else in the main process.
 *
 * Node's `http`, `https`, `net`, `dgram`, and `fetch` are built into the Electron runtime and cannot
 * be removed, so this app cannot claim "no networking library is present". What it does instead is
 * revoke the capability at startup and prove the revocation by test: every entry point becomes a
 * function that throws, so an attempt to reach the network is a named crash rather than a packet.
 *
 * This is the one file in `src/` allowed to name those APIs. `scripts/check-no-network.mjs` exempts
 * it and its test by path, and fails the build on any other file that reaches for them.
 */
import dgram from 'node:dgram'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { Session } from 'electron'

/** Thrown in place of every outbound connection. Named so a crash report says what happened. */
export class NetworkAccessError extends Error {
  constructor(api: string) {
    super(
      `Spool blocked a network call to ${api}. This application has no network features by design ` +
        `(PLAN.md 1, invariant 1). Reaching this error means code tried to open a connection.`
    )
    this.name = 'NetworkAccessError'
  }
}

function refuse(api: string): (...args: unknown[]) => never {
  return () => {
    throw new NetworkAccessError(api)
  }
}

let installed = false

/**
 * Replace every outbound entry point with a thrower. Idempotent: calling it twice is harmless, so
 * a test can assert the state without caring whether the app already ran it.
 */
export function installNetworkGuard(): void {
  if (installed) return
  installed = true

  http.request = refuse('http.request') as unknown as typeof http.request
  http.get = refuse('http.get') as unknown as typeof http.get
  https.request = refuse('https.request') as unknown as typeof https.request
  https.get = refuse('https.get') as unknown as typeof https.get
  net.connect = refuse('net.connect') as unknown as typeof net.connect
  net.createConnection = refuse('net.createConnection') as unknown as typeof net.createConnection
  dgram.createSocket = refuse('dgram.createSocket') as unknown as typeof dgram.createSocket
  globalThis.fetch = refuse('fetch') as unknown as typeof globalThis.fetch
}

/** Every API the guard revokes, for the test that proves each one throws. */
export const GUARDED_CALLS: ReadonlyArray<[name: string, call: () => unknown]> = [
  ['fetch', () => globalThis.fetch('http://example.com')],
  ['http.request', () => http.request('http://example.com')],
  ['http.get', () => http.get('http://example.com')],
  ['https.request', () => https.request('https://example.com')],
  ['https.get', () => https.get('https://example.com')],
  ['net.connect', () => net.connect(80, 'example.com')],
  ['net.createConnection', () => net.createConnection(80, 'example.com')],
  ['dgram.createSocket', () => dgram.createSocket('udp4')]
]

/**
 * Session-level blocking (PLAN.md 5b): cancel every request the renderer can originate.
 *
 * Chromium routes more than network traffic through this handler — the packaged renderer loads its
 * own HTML, JS, and CSS over `file:`, and DevTools loads over `devtools:` — so the rule is by
 * scheme: anything that leaves the machine is cancelled, anything that reads local bytes is not.
 *
 * In development the renderer is served by Vite over http://localhost, so that one origin is also
 * allowed through; otherwise the app cannot load at all. The allowance is derived from
 * `ELECTRON_RENDERER_URL`, which electron-vite sets only when it starts a dev server, and it is
 * ignored in a packaged build so it can never widen the shipped guarantee.
 */

/** Schemes that read local bytes rather than reaching the network. Never cancelled. */
const LOCAL_SCHEMES = ['file:', 'devtools:', 'blob:', 'data:', 'about:']

export function blockSessionRequests(
  session: Session,
  devServerUrl?: string,
  isPackaged = true
): void {
  const allowed = !isPackaged && devServerUrl ? devServerOrigins(devServerUrl) : []

  session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowed(details.url, allowed) })
  })
}

/** The dev server speaks http for modules and ws for hot reload; both live on the same origin. */
export function devServerOrigins(devServerUrl: string): string[] {
  const { host } = new URL(devServerUrl)
  return [`http://${host}/`, `ws://${host}/`]
}

/** Exported for test: the rule the session handler applies to one URL. */
export function isAllowed(url: string, allowedPrefixes: readonly string[]): boolean {
  if (LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme))) return true
  return allowedPrefixes.some((prefix) => url.startsWith(prefix))
}
