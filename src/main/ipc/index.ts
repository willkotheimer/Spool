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
  /** Record that the privacy statement was read, and let capture begin (PLAN.md 11, M13). */
  acknowledgePrivacy: () => void
  setWindowState: (state: WindowStateName) => void
  /** The failsafe of PLAN.md 11, M9. Returns what it could not remove, if anything. */
  resetEverything: () => { failed: Array<{ path: string; reason: string }> }
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

  ipcMain.handle(CHANNELS.createSpool, (_event, name: string) => session.createNamedSpool(name))
  ipcMain.handle(CHANNELS.renameSpool, (_event, spoolId: string, name: string) =>
    session.renameSpool(spoolId, name)
  )
  ipcMain.handle(CHANNELS.deleteSpool, (_event, spoolId: string) => session.deleteSpool(spoolId))
  ipcMain.handle(CHANNELS.setActiveSpool, (_event, spoolId: string) =>
    session.setActiveSpool(spoolId)
  )
  ipcMain.handle(CHANNELS.deleteClip, (_event, clipId: string) => session.deleteClip(clipId))
  ipcMain.handle(CHANNELS.setRetention, (_event, spoolId: string, hours: number | null) =>
    session.setRetention(spoolId, hours)
  )
  ipcMain.handle(CHANNELS.revokeSourceRule, (_event, sourceApp: string) =>
    session.revokeSourceRule(sourceApp)
  )
  ipcMain.handle(CHANNELS.setConsentTimeout, (_event, seconds: number) =>
    session.setConsentTimeout(seconds)
  )
  ipcMain.handle(CHANNELS.resetEverything, () => actions.resetEverything())
  ipcMain.handle(CHANNELS.dismissCapacityAdvice, () => session.dismissCapacityAdvice())
  ipcMain.handle(CHANNELS.pauseCapture, () => session.pauseCapture())
  ipcMain.handle(CHANNELS.acknowledgePrivacy, () => actions.acknowledgePrivacy())
  ipcMain.handle(CHANNELS.resumeCapture, () => session.resumeCapture())
  ipcMain.handle(CHANNELS.setStarred, (_event, spoolId: string, starred: boolean) =>
    session.setStarred(spoolId, starred)
  )
  ipcMain.handle(CHANNELS.clearSpools, () => session.clearSpools())
  ipcMain.handle(CHANNELS.deleteSpools, (_event, spoolIds: string[]) =>
    session.deleteSpools(spoolIds)
  )
  ipcMain.handle(CHANNELS.clearSpool, (_event, spoolId: string) => session.clearSpool(spoolId))

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
    ipcMain.removeHandler(CHANNELS.createSpool)
    ipcMain.removeHandler(CHANNELS.renameSpool)
    ipcMain.removeHandler(CHANNELS.deleteSpool)
    ipcMain.removeHandler(CHANNELS.setActiveSpool)
    ipcMain.removeHandler(CHANNELS.deleteClip)
    ipcMain.removeHandler(CHANNELS.setRetention)
    ipcMain.removeHandler(CHANNELS.revokeSourceRule)
    ipcMain.removeHandler(CHANNELS.setConsentTimeout)
    ipcMain.removeHandler(CHANNELS.resetEverything)
    ipcMain.removeHandler(CHANNELS.dismissCapacityAdvice)
    ipcMain.removeHandler(CHANNELS.pauseCapture)
    ipcMain.removeHandler(CHANNELS.acknowledgePrivacy)
    ipcMain.removeHandler(CHANNELS.resumeCapture)
    ipcMain.removeHandler(CHANNELS.setStarred)
    ipcMain.removeHandler(CHANNELS.clearSpools)
    ipcMain.removeHandler(CHANNELS.deleteSpools)
    ipcMain.removeHandler(CHANNELS.clearSpool)
    unsubscribe()
  }
}
