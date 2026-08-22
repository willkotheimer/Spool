// The kill switch of PLAN.md 5c, revoked before any other statement in the process runs.
import { blockSessionRequests, installNetworkGuard } from './guard'

installNetworkGuard()

import { app, BrowserWindow, safeStorage, session } from 'electron'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { registerIpc } from './ipc'
import { Session } from './session'
import { explainStorageFailure, openStore, startFresh, storePaths } from './store'
import { writeClipboardText } from './clipboard/writer'
import { createTray } from './tray'
import {
  createCompactWindow,
  getCompactWindow,
  showCompactWindow,
  toggleCompactWindow
} from './window'

// One instance owns the tray icon and the hotkeys; a second launch summons the first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showCompactWindow())

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.spool.app')

    // Cancel every request the renderer can originate (PLAN.md 5b).
    blockSessionRequests(
      session.defaultSession,
      process.env['ELECTRON_RENDERER_URL'],
      app.isPackaged
    )

    const spoolSession = new Session(writeClipboardText)

    /**
     * Open the encrypted store and restore what it holds (PLAN.md 11, M6). A failure is reported
     * to the window rather than thrown: an app that cannot store is still an app that can capture
     * and serve, and the user is owed an explanation and whatever way out exists.
     */
    const paths = storePaths(app.getPath('userData'))
    const attach = (result: ReturnType<typeof openStore>): void => {
      if (result.ok) spoolSession.attachStore(result.store)
      else spoolSession.reportStorageFailure(explainStorageFailure(result))
    }
    attach(openStore(paths, safeStorage))

    registerIpc(spoolSession, getCompactWindow, () => attach(startFresh(paths, safeStorage)))

    createCompactWindow()
    createTray()
    registerHotkeys({
      summon: () => toggleCompactWindow(),
      serve: () => spoolSession.serveNext(),
      toggleMode: () => spoolSession.toggleMode()
    })

    // Watching starts once there is a window to report to, so a failure to load the addon is
    // visible rather than lost to a console nobody is reading (PLAN.md 8).
    spoolSession.startCapture()
    app.on('will-quit', () => spoolSession.stopCapture())

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createCompactWindow()
      showCompactWindow()
    })
  })

  // Spool lives in the tray. Closing the window is not quitting (PLAN.md 8).
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => unregisterHotkeys())
}
