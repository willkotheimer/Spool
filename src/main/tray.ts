import { join } from 'node:path'
import { app, Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { ACTION_LABELS, type Action } from './accelerators'
import { allowQuit, showCompactWindow, toggleCompactWindow } from './window'

let tray: Tray | null = null
let hotkeyStatuses: readonly HotkeyStatus[] = []

/** What the tray says about capture, which is where a suspended app has to be visible. */
let captureLine: string | null = null

/** What happened when one action's bindings were claimed. */
export interface HotkeyStatus {
  readonly action: Action
  readonly claimed: readonly string[]
  readonly refused: readonly string[]
}

function trayIconPath(): string {
  // Packaged builds carry resources/ alongside the app; in development it sits at the repo root.
  return app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')
}

/**
 * The tray menu doubles as the hotkey reference, which is why it lists every binding rather than
 * only the broken ones: a failed registration must be surfaced, not swallowed, and the honest way
 * to show one key is refused is to show what all of them are (PLAN.md 8).
 */
function buildMenu(statuses: readonly HotkeyStatus[]): Menu {
  const lines: MenuItemConstructorOptions[] = []

  // A suspended app must say so where it lives, not only in a window that may be closed
  // (PLAN.md 11, M12).
  if (captureLine !== null) {
    lines.push({ label: captureLine, enabled: false }, { type: 'separator' })
  }

  lines.push(...statuses.map((status): MenuItemConstructorOptions => ({
    label:
      status.claimed.length > 0
        ? `${ACTION_LABELS[status.action]}: ${status.claimed.join(' or ')}`
        : `${ACTION_LABELS[status.action]}: ${status.refused.join(' and ')} refused by another app`,
    enabled: false
  })))

  const partiallyRefused = statuses
    .filter((status) => status.claimed.length > 0 && status.refused.length > 0)
    .flatMap((status) => status.refused)

  if (partiallyRefused.length > 0) {
    lines.push({ label: `${partiallyRefused.join(' and ')} was refused by another app`, enabled: false })
  }

  return Menu.buildFromTemplate([
    ...lines,
    { type: 'separator' },
    { label: 'Show Spool', click: () => showCompactWindow() },
    { type: 'separator' },
    {
      label: 'Quit Spool',
      click: () => {
        allowQuit()
        app.quit()
      }
    }
  ])
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(trayIconPath())
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Spool')
  tray.setContextMenu(buildMenu([]))
  tray.on('click', () => toggleCompactWindow())
  return tray
}

/**
 * Show which hotkeys are live and which were refused. The rebinding UI this should open does not
 * exist until settings do; naming the refused combinations is what can honestly be done now.
 */
export function reportHotkeyStatus(statuses: readonly HotkeyStatus[]): void {
  if (!tray) return
  hotkeyStatuses = statuses

  const dead = statuses.filter((status) => status.claimed.length === 0)
  tray.setToolTip(dead.length === 0 ? 'Spool' : `Spool — ${dead.length} hotkey(s) unavailable`)
  tray.setContextMenu(buildMenu(statuses))
}

/** What the tray is currently saying about capture, for tests and for the probe. */
export function captureStateLine(): string | null {
  return captureLine
}

/**
 * Say whether capture is running, and why not when it is not (PLAN.md 11, M12).
 *
 * The tray is the app's permanent surface: a window can be closed, but the icon is always there,
 * so a suspended listener has to be legible from here.
 */
export function reportCaptureState(state: {
  gated: boolean
  paused: boolean
  available: boolean
}): void {
  if (!tray) return

  captureLine = state.paused
    ? 'Capture paused — your clips are all still here'
    : state.gated
      ? 'Capture suspended: Spool is full. Everything already here still works.'
      : state.available
        ? null
        : 'Not capturing'

  tray.setToolTip(captureLine === null ? 'Spool' : `Spool — ${captureLine}`)
  tray.setContextMenu(buildMenu(hotkeyStatuses))
}
