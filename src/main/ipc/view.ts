import { clipCap } from '../core/spool'
import type { Spool } from '../core/types'
import type { SpoolView } from '../../shared/ipc'

/**
 * Project the main process's state into the shapes the renderer is given (`shared/ipc.ts`).
 *
 * Clip **content** deliberately does not cross: the compact window shows previews, and the full
 * text has no business in a renderer that only displays it. Pure, so it is tested without a window.
 */
export function toSpoolView(spool: Spool): SpoolView {
  return {
    name: spool.name,
    mode: spool.mode,
    clips: spool.clips.map((clip) => ({
      id: clip.id,
      preview: clip.preview,
      capturedAt: clip.capturedAt,
      sourceApp: clip.sourceApp
    })),
    cursorClipId: spool.cursorClipId,
    count: spool.clips.length,
    cap: clipCap(spool.kind)
  }
}
