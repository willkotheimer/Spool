import { PREVIEW_LENGTH } from './limits'
import type { Clip } from './types'

/**
 * The preview stored alongside a clip (PLAN.md 7): the first ~120 characters with newlines
 * collapsed, so a multi-line clip still reads as one line in a 360-wide window.
 */
export function makePreview(content: string, length = PREVIEW_LENGTH): string {
  const collapsed = content.replace(/\s+/g, ' ').trim()
  return collapsed.length <= length ? collapsed : collapsed.slice(0, length - 1) + '…'
}

/** How many bytes a clip's content occupies, which is what the caps of PLAN.md 3 are counted in. */
export function byteLength(content: string): number {
  return new TextEncoder().encode(content).length
}

/**
 * Build a clip. Identity and time are passed in rather than generated here — `core/` reads no clock
 * and no randomness, which is what makes every rule below testable without stubbing either.
 */
export function createClip(input: {
  id: string
  content: string
  capturedAt: string
  sourceApp?: string | null
  wasFlagged?: boolean
}): Clip {
  return {
    id: input.id,
    content: input.content,
    preview: makePreview(input.content),
    byteLength: byteLength(input.content),
    sourceApp: input.sourceApp ?? null,
    wasFlagged: input.wasFlagged ?? false,
    capturedAt: input.capturedAt
  }
}
