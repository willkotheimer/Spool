import { app, BrowserWindow } from 'electron'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { createTray } from './tray'
import { createCompactWindow, showCompactWindow } from './window'

// One instance owns the tray icon and the hotkeys; a second launch summons the first.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => showCompactWindow())

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.spool.app')

    createCompactWindow()
    createTray()
    registerHotkeys()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createCompactWindow()
      showCompactWindow()
    })
  })

  // Spool lives in the tray. Closing the window is not quitting (PLAN.md 8).
  app.on('window-all-closed', () => {})

  app.on('will-quit', () => unregisterHotkeys())
}
