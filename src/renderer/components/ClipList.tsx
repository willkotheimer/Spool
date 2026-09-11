import type { JSX } from 'react'
import type { SpoolView } from '../../shared/ipc'
import { clipRows, hiddenCounts, sourceLabel } from '../helpers/ClipListHelper'

/**
 * The clips in the active spool, oldest first, with the next one to serve marked (PLAN.md 8).
 * The marker is the point: the state of the spool has to be legible without opening anything.
 */
export function ClipList({ spool }: { spool: SpoolView }): JSX.Element {
  const rows = clipRows(spool)
  const hidden = hiddenCounts(spool)

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-spool-thread/70" />
        <p className="text-sm text-spool-paper/70">Nothing captured yet.</p>
        <p className="text-xs text-spool-paper/40">Copy something and it lands here.</p>
      </div>
    )
  }

  // The elided lines sit outside the scrolling list on purpose: a note about what is off-screen is
  // useless if reading it requires scrolling to the place it is describing.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hidden.above > 0 && <Elided count={hidden.above} where="older" />}
      <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1">
      {rows.map(({ clip, position, isNext }) => {
        const source = sourceLabel(clip)
        return (
          <li
            key={clip.id}
            className={
              isNext
                ? 'rounded border border-spool-thread/60 bg-spool-thread/10 px-2 py-1.5'
                : 'rounded border border-transparent px-2 py-1.5'
            }
          >
            <div className="flex items-baseline gap-2">
              {/*
                Checked means in play. With nothing chosen every box is checked, because an empty
                selection means every clip — so the list never shows a state the hotkeys disagree
                with (PLAN.md 3).
              */}
              <input
                type="checkbox"
                checked={clip.isSelected}
                onChange={() => void window.spool.toggleClipSelected(clip.id)}
                aria-label={`Include ${clip.preview}`}
                className="mt-0.5 shrink-0"
              />
              <span
                className={
                  isNext
                    ? 'text-[10px] font-semibold text-spool-thread'
                    : 'text-[10px] text-spool-paper/30'
                }
              >
                {isNext ? 'NEXT' : position}
              </span>
              <span
                className={
                  isNext
                    ? 'flex-1 truncate text-sm text-spool-paper'
                    : 'flex-1 truncate text-sm text-spool-paper/70'
                }
              >
                {clip.preview}
              </span>
            </div>
            {source !== null && (
              <span className="pl-11 text-[10px] text-spool-paper/30">{source}</span>
            )}
          </li>
        )
      })}
      </ol>
      {hidden.below > 0 && <Elided count={hidden.below} where="newer" />}
    </div>
  )
}

/** Admit what the window is not showing, rather than letting the spool look shorter than it is. */
function Elided({ count, where }: { count: number; where: 'older' | 'newer' }): JSX.Element {
  return (
    <p className="shrink-0 px-4 py-0.5 text-[10px] text-spool-paper/30">
      {count} {where} {count === 1 ? 'clip' : 'clips'} not shown
    </p>
  )
}
