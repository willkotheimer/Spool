import type { Clip } from './types'

/**
 * Which clips are in play (PLAN.md 3).
 *
 * A selection is a working set, not a property of the clips: it says which of them the next serve,
 * the next whole-spool paste, and the button that offers it should consider. It is deliberately not
 * stored — it is about what you are doing right now, the way a text selection is, and a selection
 * that survived a restart would be a rule the user does not remember making.
 *
 * **An empty selection means every clip.** Selecting nothing and meaning nothing is not a state
 * worth having: it would make the hotkeys dead and the button a no-op, with no way to tell that
 * apart from a bug. So clearing the selection and selecting everything are the same act, and the
 * app says so rather than offering both.
 */
export function isSelected(clipId: string, selection: ReadonlySet<string>): boolean {
  return selection.size === 0 || selection.has(clipId)
}

/** The clips a serve or a join should consider, in spool order. */
export function selectedClips(
  clips: readonly Clip[],
  selection: ReadonlySet<string>
): readonly Clip[] {
  return selection.size === 0 ? clips : clips.filter((clip) => selection.has(clip.id))
}

/** How many clips are in play, which is what the button has to name. */
export function selectedCount(clips: readonly Clip[], selection: ReadonlySet<string>): number {
  return selectedClips(clips, selection).length
}

/**
 * Drop ids that are no longer in the spool.
 *
 * A selection holding a deleted clip would keep counting it, so the button would promise more than
 * it could deliver — and an id that came back on a later clip would silently select something the
 * user never chose.
 */
export function prune(clips: readonly Clip[], selection: ReadonlySet<string>): Set<string> {
  const present = new Set(clips.map((clip) => clip.id))
  return new Set([...selection].filter((id) => present.has(id)))
}

/** Add or remove one clip. Removing the last one empties the selection, which means all again. */
export function toggle(selection: ReadonlySet<string>, clipId: string): Set<string> {
  const next = new Set(selection)
  if (next.has(clipId)) next.delete(clipId)
  else next.add(clipId)
  return next
}
