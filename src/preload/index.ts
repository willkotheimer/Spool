import { contextBridge } from 'electron'
import { describeAction, type Platform } from '../main/accelerators'

/**
 * The only path between main and renderer (PLAN.md 6). Everything the renderer can reach is listed
 * here; with `contextIsolation` and `sandbox` on, this surface is a security control rather than
 * tidiness. `accelerators` is pure TypeScript with no I/O, so reading it here crosses no layer.
 */
const api = {
  platform: process.platform as Platform,
  summonHotkey: describeAction('summon', process.platform as Platform)
} as const

export type SpoolApi = typeof api

contextBridge.exposeInMainWorld('spool', api)
