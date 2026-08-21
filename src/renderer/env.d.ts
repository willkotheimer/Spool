/// <reference types="vite/client" />

interface SpoolApi {
  readonly platform: 'win32' | 'darwin' | 'linux'
  readonly summonHotkey: string
}

interface Window {
  /** The contextBridge surface from src/preload. The renderer's only path to main (PLAN.md 6). */
  readonly spool: SpoolApi
}
