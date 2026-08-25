import { contextBridge, ipcRenderer } from 'electron'
import { describeAction, type Platform } from '../main/accelerators'
import {
  CHANNELS,
  type AppState,
  type ConsentChoice,
  type SeparatorKind,
  type WindowStateName
} from '../shared/ipc'

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
  pasteAllHotkey: describeAction('pasteAll', process.platform as Platform),
  modeHotkey: describeAction('toggleMode', process.platform as Platform),

  /** The state as it stands right now, for a renderer that has just mounted. */
  getState: (): Promise<AppState> => ipcRenderer.invoke(CHANNELS.getState),

  /** Answer the consent prompt (PLAN.md 4). */
  answerConsent: (choice: ConsentChoice): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.answerConsent, choice),

  /** Throw away a store that cannot be opened and begin again (PLAN.md 11, M6). */
  startFreshStore: (): Promise<void> => ipcRenderer.invoke(CHANNELS.startFreshStore),

  /** Write every clip in the active spool to the clipboard as one item (PLAN.md 3). */
  pasteWholeSpool: (confirmed = false): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.pasteWholeSpool, confirmed),
  cancelWholeSpoolPaste: (): Promise<void> => ipcRenderer.invoke(CHANNELS.cancelWholeSpoolPaste),

  /** Apply an arrangement to the active spool, or keep it as a new one. */
  saveArrangement: (clipIds: readonly string[]): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.saveArrangement, clipIds),
  createSpoolFromArrangement: (name: string, clipIds: readonly string[]): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.createSpoolFromArrangement, name, clipIds),

  setSeparator: (separator: SeparatorKind): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setSeparator, separator),
  setWindowState: (state: WindowStateName): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setWindowState, state),

  /** Managing spools and clips (PLAN.md 11, M8). */
  createSpool: (name: string): Promise<string | null> =>
    ipcRenderer.invoke(CHANNELS.createSpool, name),
  renameSpool: (spoolId: string, name: string): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.renameSpool, spoolId, name),
  deleteSpool: (spoolId: string): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.deleteSpool, spoolId),
  setActiveSpool: (spoolId: string): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setActiveSpool, spoolId),
  deleteClip: (clipId: string): Promise<void> => ipcRenderer.invoke(CHANNELS.deleteClip, clipId),
  clearSpool: (spoolId: string): Promise<void> => ipcRenderer.invoke(CHANNELS.clearSpool, spoolId),

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
