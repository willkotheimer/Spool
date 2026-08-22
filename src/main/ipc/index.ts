import { ipcMain, type BrowserWindow } from 'electron'
import { CHANNELS, type AppState } from '../../shared/ipc'
import type { Session } from '../session'

/**
 * The IPC surface (PLAN.md 6): parse, call, return. No decisions.
 *
 * Two channels are all M3 needs — the renderer asks for the state once when it mounts, and the
 * main process pushes a new one whenever capture changes something.
 */
export function registerIpc(session: Session, windowFor: () => BrowserWindow | null): () => void {
  ipcMain.handle(CHANNELS.getState, (): AppState => session.getState())

  const unsubscribe = session.onChange((state) => {
    const window = windowFor()
    if (window !== null && !window.isDestroyed()) {
      window.webContents.send(CHANNELS.state, state)
    }
  })

  return () => {
    ipcMain.removeHandler(CHANNELS.getState)
    unsubscribe()
  }
}
