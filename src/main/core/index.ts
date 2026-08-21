/**
 * The spool core (PLAN.md 6): pure TypeScript, no I/O, no Electron, no clock. Every rule in
 * PLAN.md 3 lives here rather than in the store, because that is what makes it testable without a
 * clipboard or a database.
 */
export * from './clip'
export * from './limits'
export * from './spool'
export * from './types'
