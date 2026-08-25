/// <reference types="vite/client" />

import type { AppState, ConsentChoice, SeparatorKind, WindowStateName } from '../shared/ipc'

declare global {
  interface SpoolApi {
    readonly platform: 'win32' | 'darwin' | 'linux'
    readonly summonHotkey: string
    readonly serveHotkey: string
    readonly pasteAllHotkey: string
    readonly modeHotkey: string
    getState(): Promise<AppState>
    answerConsent(choice: ConsentChoice): Promise<void>
    startFreshStore(): Promise<void>
    pasteWholeSpool(confirmed?: boolean): Promise<void>
    cancelWholeSpoolPaste(): Promise<void>
    saveArrangement(clipIds: readonly string[]): Promise<void>
    createSpoolFromArrangement(name: string, clipIds: readonly string[]): Promise<void>
    setSeparator(separator: SeparatorKind): Promise<void>
    setWindowState(state: WindowStateName): Promise<void>
    createSpool(name: string): Promise<string | null>
    renameSpool(spoolId: string, name: string): Promise<void>
    deleteSpool(spoolId: string): Promise<void>
    setActiveSpool(spoolId: string): Promise<void>
    deleteClip(clipId: string): Promise<void>
    clearSpool(spoolId: string): Promise<void>
    onState(listener: (state: AppState) => void): () => void
  }

  interface Window {
    /** The contextBridge surface from src/preload. The renderer's only path to main (PLAN.md 6). */
    readonly spool: SpoolApi
  }
}
