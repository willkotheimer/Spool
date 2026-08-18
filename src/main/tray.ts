import { join } from 'node:path'
import { app, Menu, Tray, nativeImage, type MenuItemConstructorOptions } from 'electron'
import { describeAction, type Platform } from './accelerators'
import { allowQuit, showCompactWindow, toggleCompactWindow } from './window'

let tray: Tray | null = null

function trayIconPath(): string {
  // Packaged builds carry resources/ alongside the app; in development it sits at the repo root.
  return app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(__dirname, '../../resources/tray.png')
}

function buildMenu(notices: string[]): Menu {
  const items: MenuItemConstructorOptions[] = [
    ...notices.map((label): MenuItemConstructorOptions => ({ label, enabled: false })),
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
  ]
  return Menu.buildFromTemplate(items)
}

function summonLabel(): string {
  return `Summon: ${describeAction('summon', process.platform as Platform)}`
}

export function createTray(): Tray {
  const icon = nativeImage.createFromPath(trayIconPath())
  icon.setTemplateImage(true)

  tray = new Tray(icon)
  tray.setToolTip('Spool')
  tray.setContextMenu(buildMenu([summonLabel()]))
  tray.on('click', () => toggleCompactWindow())
  return tray
}

/**
 * Tell the user which hotkeys could not be claimed. A failed registration must be surfaced, not
 * swallowed — a silently dead hotkey reads as a broken app (PLAN.md 8). The rebinding UI it should
 * open does not exist until settings do; naming the refused combinations is what M0 can honestly
 * do, and the tray menu is where a tray-resident app can say it.
 */
export function reportHotkeyFailure(refused: string[], someClaimed: boolean): void {
  if (!tray || refused.length === 0) return

  const refusedList = refused.join(' and ')
  const notices = someClaimed
    ? [summonLabel(), `${refusedList} was refused by another app`]
    : [`${refusedList} was refused — no summon hotkey is active`]

  tray.setToolTip(someClaimed ? 'Spool' : 'Spool — the summon hotkey is unavailable')
  tray.setContextMenu(buildMenu(notices))
}
