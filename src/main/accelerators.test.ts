import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  defaultAccelerators,
  describeAccelerator,
  describeAction,
  resolveAccelerators,
  splitAccelerator,
  type Platform
} from './accelerators'

const PLATFORMS: Platform[] = ['win32', 'darwin', 'linux']

describe('defaultAccelerators', () => {
  it('summons with Win+Alt+C on Windows — C for clipboard', () => {
    expect(defaultAccelerators('summon', 'win32')).toEqual(['Super+Alt+C'])
  })

  it('unspools with Win+Alt+U and pastes the whole spool with Win+Alt+V', () => {
    expect(defaultAccelerators('serve', 'win32')).toEqual(['Super+Alt+U'])
    expect(defaultAccelerators('pasteAll', 'win32')).toEqual(['Super+Alt+V'])
  })

  it('summons with Ctrl+Option+C on macOS', () => {
    expect(defaultAccelerators('summon', 'darwin')).toEqual(['Control+Alt+C'])
  })

  // Measured on Windows 11: OneNote owns Win+Alt+N and the Xbox Game Bar owns Win+Alt+M, and the
  // Game Bar ships with Windows. Both were defaults once, and both were dead for most users.
  it.each(['N', 'M', 'A'])('does not default to Win+Alt+%s, which is commonly taken', (key) => {
    for (const action of ACTIONS) {
      expect(defaultAccelerators(action, 'win32')).not.toContain(`Super+Alt+${key}`)
    }
  })

  it('gives every action a distinct key, so one press cannot mean two things', () => {
    const all = ACTIONS.flatMap((action) => defaultAccelerators(action, 'win32'))
    expect(new Set(all).size).toBe(all.length)
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

  // Ctrl+Alt is AltGr on international layouts, where Ctrl+Alt+C types 'ć'. It is offered as a
  // rebinding choice, but it must never be what Windows users get by default.
  it('never defaults to Ctrl+Alt on Windows, which is AltGr abroad', () => {
    for (const action of ACTIONS) {
      for (const accelerator of defaultAccelerators(action, 'win32')) {
        expect(accelerator.startsWith('Control+Alt')).toBe(false)
      }
    }
  })
})

describe('resolveAccelerators', () => {
  it('uses the default when the user has chosen nothing', () => {
    expect(resolveAccelerators('serve', 'win32', {})).toEqual(['Super+Alt+U'])
  })

  it('replaces the default rather than joining it, so a refusal is not kept alive', () => {
    expect(resolveAccelerators('serve', 'win32', { serve: 'Control+Shift+Alt+J' })).toEqual([
      'Control+Shift+Alt+J'
    ])
  })

  it('ignores an empty choice', () => {
    expect(resolveAccelerators('serve', 'win32', { serve: '' })).toEqual(['Super+Alt+U'])
  })
})

describe('splitAccelerator', () => {
  it('separates the modifier family from the key', () => {
    expect(splitAccelerator('Super+Alt+U')).toEqual({ modifier: 'Super+Alt', key: 'U' })
    expect(splitAccelerator('Control+Shift+Alt+J')).toEqual({
      modifier: 'Control+Shift+Alt',
      key: 'J'
    })
  })

  it('round-trips whatever defaultAccelerators produces', () => {
    for (const action of ACTIONS) {
      for (const accelerator of defaultAccelerators(action, 'win32')) {
        const { modifier, key } = splitAccelerator(accelerator)
        expect(`${modifier}+${key}`).toBe(accelerator)
      }
    }
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
  it('names the summon binding on each platform', () => {
    expect(describeAction('summon', 'win32')).toBe('Win+Alt+C')
    expect(describeAction('summon', 'darwin')).toBe('Ctrl+Option+C')
  })
})
