import type { JSX } from 'react'
import type { SpoolView } from '../../shared/ipc'
import { clipRows, sourceLabel } from '../helpers/ClipListHelper'

/**
 * The clips in the active spool, oldest first, with the next one to serve marked (PLAN.md 8).
 * The marker is the point: the state of the spool has to be legible without opening anything.
 */
export function ClipList({ spool }: { spool: SpoolView }): JSX.Element {
  const rows = clipRows(spool)

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-spool-thread/70" />
        <p className="text-sm text-spool-paper/70">Nothing captured yet.</p>
        <p className="text-xs text-spool-paper/40">Copy something and it lands here.</p>
      </div>
    )
  }

  return (
    <ol className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
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
              <span className="pl-6 text-[10px] text-spool-paper/30">{source}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
