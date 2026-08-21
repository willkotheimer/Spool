import { describe, expect, it } from 'vitest'
import {
  DATA_FILE_PATH,
  dataFileDescription,
  keyStoreName,
  type Platform
} from './PrivacyPanelHelper'

describe('keyStoreName', () => {
  it.each([
    ['win32', 'Windows Credential Manager'],
    ['darwin', 'the macOS Keychain'],
    ['linux', 'the system keyring']
  ] as [Platform, string][])('names the key store on %s', (platform, expected) => {
    expect(keyStoreName(platform)).toBe(expected)
  })
})

describe('dataFileDescription', () => {
  it('states the absence rather than inventing a path', () => {
    expect(dataFileDescription(DATA_FILE_PATH)).toMatch(/no file yet/i)
  })

  it('prints the path once there is one', () => {
    expect(dataFileDescription('C:/Users/x/AppData/Roaming/Spool/spool.db')).toBe(
      'C:/Users/x/AppData/Roaming/Spool/spool.db'
    )
  })
})
