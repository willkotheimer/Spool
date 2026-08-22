import { ipcMain, type BrowserWindow } from 'electron'
import { CHANNELS, type AppState, type ConsentChoice } from '../../shared/ipc'
import type { Session } from '../session'

/**
 * The IPC surface (PLAN.md 6): parse, call, return. No decisions.
 *
 * Two channels are all M3 needs — the renderer asks for the state once when it mounts, and the
 * main process pushes a new one whenever capture changes something.
 */
export function registerIpc(
  session: Session,
  windowFor: () => BrowserWindow | null,
  startFreshStore: () => void
): () => void {
  ipcMain.handle(CHANNELS.getState, (): AppState => session.getState())

  // Parse, call, return — the decision is the session's (PLAN.md 6).
  ipcMain.handle(CHANNELS.answerConsent, (_event, choice: ConsentChoice) => {
    session.answerConsent(choice)
  })

  // Destructive, and therefore only ever on an explicit yes from the user (PLAN.md 11, M6).
  ipcMain.handle(CHANNELS.startFreshStore, () => startFreshStore())

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
    unsubscribe()
  }
}
