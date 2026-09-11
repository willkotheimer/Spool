import { isSelected, selectedCount } from '../core/selection'
import { clipCap } from '../core/spool'
import type { Spool } from '../core/types'
import type { SpoolView } from '../../shared/ipc'

/**
 * Project the main process's state into the shapes the renderer is given (`shared/ipc.ts`).
 *
 * Clip **content** deliberately does not cross: the compact window shows previews, and the full
 * text has no business in a renderer that only displays it. Pure, so it is tested without a window.
 */
export function toSpoolView(
  spool: Spool,
  selection: ReadonlySet<string> = new Set()
): SpoolView {
  return {
    name: spool.name,
    mode: spool.mode,
    clips: spool.clips.map((clip) => ({
      id: clip.id,
      preview: clip.preview,
      capturedAt: clip.capturedAt,
      sourceApp: clip.sourceApp,
      isSelected: isSelected(clip.id, selection)
    })),
    cursorClipId: spool.cursorClipId,
    count: spool.clips.length,
    cap: clipCap(spool.kind),
    // What a serve or a whole-spool paste would act on. Equal to `count` when nothing is chosen,
    // because an empty selection means every clip.
    inPlay: selectedCount(spool.clips, selection),
    // Whether the user has actually chosen a subset, which is what the UI needs to know to offer
    // a way back to all of them.
    hasSelection: selection.size > 0
  }
}
