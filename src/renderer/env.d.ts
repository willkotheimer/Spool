/// <reference types="vite/client" />

import type { AppState } from '../shared/ipc'

declare global {
  interface SpoolApi {
    readonly platform: 'win32' | 'darwin' | 'linux'
    readonly summonHotkey: string
    getState(): Promise<AppState>
    onState(listener: (state: AppState) => void): () => void
  }

  interface Window {
    /** The contextBridge surface from src/preload. The renderer's only path to main (PLAN.md 6). */
    readonly spool: SpoolApi
  }
}
