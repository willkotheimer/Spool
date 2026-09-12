import { contextBridge, ipcRenderer } from 'electron'
import type { Platform } from '../main/accelerators'
import {
  CHANNELS,
  type AppState,
  type ConsentChoice,
  type HotkeyAction,
  type SelectGesture,
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

  /** Retention and control (PLAN.md 11, M9). */
  setRetention: (spoolId: string, hours: number | null): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setRetention, spoolId, hours),
  revokeSourceRule: (sourceApp: string): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.revokeSourceRule, sourceApp),
  setConsentTimeout: (seconds: number): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setConsentTimeout, seconds),
  /** Clear spools: deletes every saved spool, keeping the default one. */
  clearSpools: (): Promise<void> => ipcRenderer.invoke(CHANNELS.clearSpools),

  /** The capacity advisor (PLAN.md 9): it recommends, the user decides. */
  dismissCapacityAdvice: (): Promise<void> => ipcRenderer.invoke(CHANNELS.dismissCapacityAdvice),
  /** Whether placing something on the clipboard also pastes it where you were (PLAN.md 8). */
  setAutoPaste: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setAutoPaste, enabled),

  /** Change which clips are in play with one click (PLAN.md 3); the gesture says how. */
  selectClip: (clipId: string, gesture: SelectGesture): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.selectClip, clipId, gesture),

  /** Back to every clip. Clearing a selection and selecting all are the same act. */
  selectAllClips: (): Promise<void> => ipcRenderer.invoke(CHANNELS.selectAllClips),

  /** Change direction. On the mode pill rather than a hotkey (PLAN.md 8). */
  toggleMode: (): Promise<void> => ipcRenderer.invoke(CHANNELS.toggleMode),

  /** Try a new combination for one action; the answer says whether the OS granted it. */
  setHotkey: (action: HotkeyAction, accelerator: string): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.setHotkey, action, accelerator),

  /** Put one action back to its shipped default. */
  resetHotkey: (action: HotkeyAction): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.resetHotkey, action),

  /** The privacy statement has been read; capture may begin (PLAN.md 11, M13). */
  acknowledgePrivacy: (): Promise<void> => ipcRenderer.invoke(CHANNELS.acknowledgePrivacy),

  /** The door that deletes nothing (PLAN.md 9). */
  pauseCapture: (): Promise<void> => ipcRenderer.invoke(CHANNELS.pauseCapture),
  resumeCapture: (): Promise<void> => ipcRenderer.invoke(CHANNELS.resumeCapture),
  deleteSpools: (spoolIds: readonly string[]): Promise<void> =>
    ipcRenderer.invoke(CHANNELS.deleteSpools, spoolIds),

  /** Wipes the store, the sealed key, and the preferences, then restarts (PLAN.md 11, M9). */
  resetEverything: (): Promise<{ failed: Array<{ path: string; reason: string }> }> =>
    ipcRenderer.invoke(CHANNELS.resetEverything),
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
