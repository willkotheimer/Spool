import { ipcMain, type BrowserWindow } from 'electron'
import {
  CHANNELS,
  type AppState,
  type ConsentChoice,
  type SeparatorKind,
  type WindowStateName
} from '../../shared/ipc'
import type { Session } from '../session'

/**
 * The IPC surface (PLAN.md 6): parse, call, return. No decisions.
 *
 * Two channels are all M3 needs — the renderer asks for the state once when it mounts, and the
 * main process pushes a new one whenever capture changes something.
 */
export interface IpcActions {
  startFreshStore: () => void
  setWindowState: (state: WindowStateName) => void
}

export function registerIpc(
  session: Session,
  windowFor: () => BrowserWindow | null,
  actions: IpcActions
): () => void {
  ipcMain.handle(CHANNELS.getState, (): AppState => session.getState())

  // Parse, call, return — the decision is the session's (PLAN.md 6).
  ipcMain.handle(CHANNELS.answerConsent, (_event, choice: ConsentChoice) => {
    session.answerConsent(choice)
  })

  // Destructive, and therefore only ever on an explicit yes from the user (PLAN.md 11, M6).
  ipcMain.handle(CHANNELS.startFreshStore, () => actions.startFreshStore())

  ipcMain.handle(CHANNELS.pasteWholeSpool, (_event, confirmed: boolean) =>
    session.pasteWholeSpool(confirmed)
  )
  ipcMain.handle(CHANNELS.cancelWholeSpoolPaste, () => session.cancelWholeSpoolPaste())
  ipcMain.handle(CHANNELS.saveArrangement, (_event, clipIds: string[]) =>
    session.saveArrangement(clipIds)
  )
  ipcMain.handle(
    CHANNELS.createSpoolFromArrangement,
    (_event, name: string, clipIds: string[]) => session.createSpoolFromArrangement(name, clipIds)
  )
  ipcMain.handle(CHANNELS.setSeparator, (_event, separator: SeparatorKind) =>
    session.setSeparator(separator)
  )
  ipcMain.handle(CHANNELS.setWindowState, (_event, state: WindowStateName) =>
    actions.setWindowState(state)
  )

  const unsubscribe = session.onChange((state) => {
    const window = windowFor()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.state, state)
    }
  })

  return () => {
    ipcMain.removeHandler(CHANNELS.getState)
    ipcMain.removeHandler(CHANNELS.answerConsent)
    ipcMain.removeHandler(CHANNELS.startFreshStore)
    ipcMain.removeHandler(CHANNELS.pasteWholeSpool)
    ipcMain.removeHandler(CHANNELS.cancelWholeSpoolPaste)
    ipcMain.removeHandler(CHANNELS.saveArrangement)
    ipcMain.removeHandler(CHANNELS.createSpoolFromArrangement)
    ipcMain.removeHandler(CHANNELS.setSeparator)
    ipcMain.removeHandler(CHANNELS.setWindowState)
    unsubscribe()
  }
}
