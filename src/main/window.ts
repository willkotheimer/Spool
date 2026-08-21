import { join } from 'node:path'
import { BrowserWindow } from 'electron'

/** Compact window size (PLAN.md 8) — about the size of Snipping Tool. */
export const COMPACT_WIDTH = 360
export const COMPACT_HEIGHT = 420

let compactWindow: BrowserWindow | null = null

export function createCompactWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: COMPACT_WIDTH,
    height: COMPACT_HEIGHT,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: 'Spool',
    backgroundColor: '#171614',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The renderer boundary, set from the first commit rather than retrofitted (PLAN.md 6).
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  })

  window.on('ready-to-show', () => window.show())

  // Closing hides to the tray; quitting is explicit from the tray menu (PLAN.md 8).
  window.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    compactWindow = null
  })

  // Nothing in this app opens a second window, and no link should escape into one.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  compactWindow = window
  return window
}

export function getCompactWindow(): BrowserWindow | null {
  return compactWindow
}

/** Ensure the window exists and is in front. */
export function showCompactWindow(): void {
  const window = compactWindow ?? createCompactWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

/** The summon hotkey is a toggle: visible and focused means dismiss (PLAN.md 8). */
export function toggleCompactWindow(): void {
  const window = compactWindow
  if (window && window.isVisible() && window.isFocused()) {
    window.hide()
    return
  }
  showCompactWindow()
}

let isQuitting = false

/** Let the window close for real. Called from the tray's Quit item. */
export function allowQuit(): void {
  isQuitting = true
}
