import { useEffect, type JSX, type KeyboardEvent, type MouseEvent } from 'react'
import type { SpoolView } from '../../shared/ipc'
import { clipRows, gestureFor, hiddenCounts, inPlayLabel, sourceLabel } from '../helpers/ClipListHelper'

/**
 * The clips in the active spool, oldest first, with the next one to serve marked (PLAN.md 8).
 * The marker is the point: the state of the spool has to be legible without opening anything.
 *
 * Each row is also the way to choose which clips are in play (PLAN.md 3). The row itself is the
 * control — click to choose one, Ctrl-click to add or drop one, Shift-click for a run — the way
 * every list on the desktop already works, so there is nothing to learn and no checkbox to aim at.
 * Chosen rows are lit and the rest recede, so a narrowed spool looks narrowed.
 */
export function ClipList({ spool }: { spool: SpoolView }): JSX.Element {
  const rows = clipRows(spool)
  const hidden = hiddenCounts(spool)

  // Escape is the way out that needs no aim. Bound to the window rather than the list so it works
  // wherever focus happens to be, and only while there is a selection to leave.
  useEffect(() => {
    if (!spool.hasSelection) return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') void window.spool.selectAllClips()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [spool.hasSelection])

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-spool-thread/70" />
        <p className="text-sm text-spool-paper/70">Nothing captured yet.</p>
        <p className="text-xs text-spool-paper/40">Copy something and it lands here.</p>
      </div>
    )
  }

  const select = (clipId: string, event: MouseEvent | KeyboardEvent): void => {
    void window.spool.selectClip(clipId, gestureFor(event))
  }

  // The elided lines sit outside the scrolling list on purpose: a note about what is off-screen is
  // useless if reading it requires scrolling to the place it is describing.
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {hidden.above > 0 && <Elided count={hidden.above} where="older" />}
      <ol
        role="listbox"
        aria-multiselectable="true"
        aria-label="Clips"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-1"
      >
      {rows.map(({ clip, position, isNext }) => {
        const source = sourceLabel(clip)
        // With nothing chosen every clip is in play, but lighting them all would say a choice had
        // been made. So the list is only lit once it is narrowed, and then what is out recedes.
        const chosen = spool.hasSelection && clip.isSelected
        const out = spool.hasSelection && !clip.isSelected
        return (
          <li
            key={clip.id}
            role="option"
            aria-selected={clip.isSelected}
            tabIndex={0}
            onClick={(event) => select(clip.id, event)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              select(clip.id, event)
            }}
            className={[
              'cursor-pointer rounded border px-2 py-1.5 select-none outline-none',
              'hover:bg-spool-paper/5 focus-visible:border-spool-paper/40',
              isNext ? 'border-spool-thread/60' : 'border-transparent',
              chosen ? 'bg-spool-paper/10' : isNext ? 'bg-spool-thread/10' : '',
              out ? 'opacity-40' : ''
            ].join(' ')}
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
      {hidden.below > 0 && <Elided count={hidden.below} where="newer" />}
      {spool.hasSelection && (
        <p className="flex shrink-0 items-baseline justify-between px-4 py-1 text-[10px] text-spool-paper/50">
          <span>{inPlayLabel(spool)}</span>
          <button
            type="button"
            onClick={() => void window.spool.selectAllClips()}
            className="text-spool-paper/60 underline-offset-2 hover:underline"
          >
            Select all
          </button>
        </p>
      )}
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
