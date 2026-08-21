import { describe, expect, it } from 'vitest'
import {
  defaultAccelerators,
  describeAccelerator,
  describeAction,
  type Platform
} from './accelerators'

const PLATFORMS: Platform[] = ['win32', 'darwin', 'linux']

describe('defaultAccelerators', () => {
  it('summons with Win+Alt+V or Win+Alt+C on Windows', () => {
    expect(defaultAccelerators('summon', 'win32')).toEqual(['Super+Alt+V', 'Super+Alt+C'])
  })

  it('summons with Ctrl+Option+V or Ctrl+Option+C on macOS', () => {
    expect(defaultAccelerators('summon', 'darwin')).toEqual(['Control+Alt+V', 'Control+Alt+C'])
  })

  it.each(PLATFORMS)('never claims Ctrl+Shift+V on %s', (platform) => {
    // Ctrl+Shift+V is paste in Windows Terminal, GNOME Terminal, and several editors.
    expect(defaultAccelerators('summon', platform)).not.toContain('Control+Shift+V')
  })

  it('never claims a Win+Shift combination, which the Windows shell reserves', () => {
    for (const accelerator of defaultAccelerators('summon', 'win32')) {
      expect(accelerator.startsWith('Super+Shift')).toBe(false)
    }
  })

  it.each(PLATFORMS)('binds distinct accelerators on %s', (platform) => {
    const accelerators = defaultAccelerators('summon', platform)
    expect(new Set(accelerators).size).toBe(accelerators.length)
  })
})

describe('describeAccelerator', () => {
  it('names the Windows key the way Windows does', () => {
    expect(describeAccelerator('Super+Alt+V', 'win32')).toBe('Win+Alt+V')
  })

  it('names the Option key the way macOS does', () => {
    expect(describeAccelerator('Control+Alt+V', 'darwin')).toBe('Ctrl+Option+V')
  })
})

describe('describeAction', () => {
  it('reads both summon bindings as one phrase', () => {
    expect(describeAction('summon', 'win32')).toBe('Win+Alt+V or Win+Alt+C')
    expect(describeAction('summon', 'darwin')).toBe('Ctrl+Option+V or Ctrl+Option+C')
  })
})
