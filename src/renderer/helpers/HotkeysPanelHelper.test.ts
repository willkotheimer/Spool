import { describe, expect, it } from 'vitest'
import type { HotkeyView } from '../../shared/ipc'
import { hotkeySummary, refusedCount } from './HotkeysPanelHelper'

function view(overrides: Partial<HotkeyView> = {}): HotkeyView {
  return {
    action: 'serve',
    label: 'Unspool the next clip',
    hint: 'Press it repeatedly.',
    accelerator: 'Super+Alt+U',
    described: 'Win+Alt+U',
    claimed: true,
    isDefault: true,
    ...overrides
  }
}

describe('hotkeySummary', () => {
  it('says nothing when every key is live', () => {
    expect(hotkeySummary([view(), view({ action: 'summon' })])).toBeNull()
  })

  it('names the one refused key and what to do about it', () => {
    const summary = hotkeySummary([view({ claimed: false, described: 'Win+Alt+N' })])
    expect(summary).toContain('Win+Alt+N')
    expect(summary).toContain('refused')
  })

  it('counts them when more than one is dead', () => {
    const summary = hotkeySummary([
      view({ claimed: false, described: 'Win+Alt+N' }),
      view({ action: 'pasteAll', claimed: false, described: 'Win+Alt+A' })
    ])
    expect(summary).toContain('2 hotkeys')
    expect(summary).toContain('Win+Alt+N')
    expect(summary).toContain('Win+Alt+A')
  })
})

describe('refusedCount', () => {
  it('is the badge on the ? button, which is how a refusal reaches someone not looking for it', () => {
    expect(refusedCount([view(), view({ claimed: false })])).toBe(1)
    expect(refusedCount([view(), view()])).toBe(0)
  })
})
