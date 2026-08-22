import { contextBridge, ipcRenderer } from 'electron'
import { describeAction, type Platform } from '../main/accelerators'
import { CHANNELS, type AppState, type ConsentChoice } from '../shared/ipc'

/**
 * The only path between main and renderer (PLAN.md 6). Everything the renderer can reach is listed
 * here; with `contextIsolation` and `sandbox` on, this surface is a security control rather than
 * tidiness. The modules it imports are pure TypeScript with no I/O, so reading them here crosses
 * no layer.
 */
const api = {
  platform: process.platform as Platform,
  summonHotkey: describeAction('summon', process.platform as Platform),
  serveHotkey: describeAction('serve', process.platform as Platform),
  modeHotkey: describeAction('toggleMode', process.platform as Platform),

  /** The state as it stands right now, for a renderer that has just mounted. */
  getState: (): Promise<AppState> => ipcRenderer.invoke(CHANNELS.getState),

  /** Answer the consent prompt (PLAN.md 4). */
  answerConsent: (choice: ConsentChoice): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.answerConsent, choice),

  /** Every subsequent state. Returns its own unsubscribe, so React can clean up. */
  onState: (listener: (state: AppState) => void): (() => void) => {
    const handler = (_event: unknown, state: AppState): void => listener(state)
    ipcRenderer.on(CHANNELS.state, handler)
    return () => {
      ipcRenderer.removeListener(CHANNELS.state, handler)
    }
  }
} as const

export type SpoolApi = typeof api

contextBridge.exposeInMainWorld('spool', api)
