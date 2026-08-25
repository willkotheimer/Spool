import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings, settingsPath } from './settings'

let directory: string
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'spool-settings-'))
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

const path = () => settingsPath(directory)

describe('settings (PLAN.md 3, 8)', () => {
  it('starts at a newline separator and the compact window', () => {
    expect(loadSettings(path())).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.separator).toBe('newline')
  })

  it('round-trips what the user chose', () => {
    saveSettings(path(), { separator: 'tab', window: 'expanded' })

    expect(loadSettings(path())).toEqual({ separator: 'tab', window: 'expanded' })
  })

  it('falls back to defaults rather than failing on a file edited into nonsense', () => {
    writeFileSync(path(), '{ not json at all')
    expect(loadSettings(path())).toEqual(DEFAULT_SETTINGS)

    writeFileSync(path(), JSON.stringify({ separator: 'semicolons', window: 'enormous' }))
    expect(loadSettings(path())).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps the half of a partial file that makes sense', () => {
    writeFileSync(path(), JSON.stringify({ separator: 'comma' }))

    expect(loadSettings(path())).toEqual({ separator: 'comma', window: 'compact' })
  })
})
