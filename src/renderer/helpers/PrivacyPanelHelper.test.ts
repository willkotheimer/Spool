import { describe, expect, it } from 'vitest'
import { dataFileDescription, keySealerName, type Platform } from './PrivacyPanelHelper'

describe('keySealerName', () => {
  it.each([
    ['win32', 'Windows itself, through DPAPI'],
    ['darwin', 'the macOS Keychain'],
    ['linux', 'the system keyring']
  ] as [Platform, string][])('names what seals the key on %s', (platform, expected) => {
    expect(keySealerName(platform)).toBe(expected)
  })

  // The regression this test exists for: the panel claimed the Credential Manager for two
  // milestones, which is a different Windows facility from the one that actually seals the key.
  it('does not name the Credential Manager, which is not what seals the key', () => {
    expect(keySealerName('win32')).not.toContain('Credential Manager')
  })
})

describe('dataFileDescription', () => {
  it('states the absence rather than inventing a path', () => {
    expect(dataFileDescription(null)).toMatch(/no file yet/i)
  })

  it('prints the path once there is one', () => {
    expect(dataFileDescription('C:/Users/x/AppData/Roaming/Spool/spool.db')).toBe(
      'C:/Users/x/AppData/Roaming/Spool/spool.db'
    )
  })
})
