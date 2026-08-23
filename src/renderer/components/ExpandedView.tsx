import { useState, type JSX } from 'react'
import type { AppState, SeparatorKind } from '../../shared/ipc'
import { hasChanged, sameClips } from '../helpers/ArrangeListHelper'
import { formatBytes, separatorOptions } from '../helpers/ExpandedViewHelper'
import { ArrangeList } from './ArrangeList'

/**
 * The expanded window (PLAN.md 8): the full clip list with drag handles, the arrangement controls,
 * and the whole-spool paste that reordering exists to serve.
 *
 * The arrangement is a **draft** until it is saved. Dragging a row does not silently rewrite the
 * spool: the user either applies it to this spool or keeps it as a new one, which is what makes
 * "create reorder" possible at all (PLAN.md 13, 1).
 */
export function ExpandedView({
  state,
  onCompact
}: {
  state: AppState
  onCompact: () => void
}): JSX.Element {
  const { spool, spools, separator, pendingJoin } = state
  const original = spool.clips.map((clip) => clip.id)
  const [draft, setDraft] = useState<string[] | null>(null)
  const [newName, setNewName] = useState('')

  /**
   * The draft holds only while it still describes this spool. If a capture or a serve changed
   * which clips exist, the draft is stale and the live order is what is true — derived here during
   * render rather than synchronised in an effect, so there is no moment where the two disagree.
   */
  const arranged = draft !== null && sameClips(draft, original) ? draft : original
  const dirty = hasChanged(original, arranged)

  const orderedClips = arranged
    .map((id) => spool.clips.find((clip) => clip.id === id))
    .filter((clip): clip is (typeof spool.clips)[number] => clip !== undefined)

  return (
    <main className="flex h-full flex-col bg-spool-ink text-spool-paper">
      <header className="flex items-center justify-between gap-3 border-b border-spool-paper/10 px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold">{spool.name}</h1>
          <span className="text-[11px] text-spool-paper/40">
            {spool.count} of {spool.cap}
          </span>
          <span className="rounded-full border border-spool-thread/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-spool-thread uppercase">
            {spool.mode}
          </span>
        </div>

        <button
          type="button"
          onClick={onCompact}
          className="rounded border border-spool-paper/20 px-2 py-1 text-[11px] text-spool-paper/70 hover:bg-spool-paper/10"
        >
          Compact view
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <ArrangeList clips={orderedClips} cursorClipId={spool.cursorClipId} onChange={setDraft} />
        </section>

        <aside className="w-64 shrink-0 space-y-4 border-l border-spool-paper/10 px-4 py-3 text-xs">
          <div className="space-y-1.5">
            <h2 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">
              Arrangement
            </h2>
            <p className="text-spool-paper/50">
              {dirty ? 'Rearranged, not yet saved.' : 'Matches the saved order.'}
            </p>
            <button
              type="button"
              disabled={!dirty}
              onClick={() => {
                void window.spool.saveArrangement(arranged)
                setDraft(null)
              }}
              className="w-full rounded bg-spool-thread/80 px-2 py-1.5 text-spool-ink disabled:bg-spool-paper/10 disabled:text-spool-paper/30"
            >
              Save this order
            </button>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Name for a new spool"
              className="w-full rounded border border-spool-paper/20 bg-transparent px-2 py-1 text-spool-paper placeholder:text-spool-paper/25"
            />
            <button
              type="button"
              disabled={spool.count === 0}
              onClick={() => {
                void window.spool.createSpoolFromArrangement(newName, arranged)
                setNewName('')
              }}
              className="w-full rounded border border-spool-paper/20 px-2 py-1.5 text-spool-paper/80 hover:bg-spool-paper/10 disabled:text-spool-paper/25"
            >
              Keep as a new spool
            </button>
            <p className="text-[10px] text-spool-paper/35">
              Keeping leaves this spool exactly as it is.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">
              Paste the whole spool
            </h2>
            <label className="block text-spool-paper/50" htmlFor="separator">
              Separated by
            </label>
            <select
              id="separator"
              value={separator}
              onChange={(event) =>
                void window.spool.setSeparator(event.target.value as SeparatorKind)
              }
              className="w-full rounded border border-spool-paper/20 bg-spool-ink px-2 py-1 text-spool-paper"
            >
              {separatorOptions().map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={spool.count === 0}
              onClick={() => void window.spool.pasteWholeSpool()}
              className="w-full rounded border border-spool-thread/50 px-2 py-1.5 text-spool-thread hover:bg-spool-thread/10 disabled:border-spool-paper/10 disabled:text-spool-paper/25"
            >
              Put all {spool.count} on the clipboard
            </button>
            <p className="text-[10px] text-spool-paper/35">
              Then paste once, with Ctrl+V. The cursor does not move.
            </p>
          </div>

          {spools.length > 1 && (
            <div className="space-y-1">
              <h2 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">
                Spools
              </h2>
              {spools.map((summary) => (
                <p key={summary.id} className="flex justify-between text-spool-paper/50">
                  <span className="truncate">{summary.name}</span>
                  <span>{summary.count}</span>
                </p>
              ))}
              <p className="text-[10px] text-spool-paper/35">Switching between them arrives at M8.</p>
            </div>
          )}
        </aside>
      </div>

      {pendingJoin !== null && (
        <div className="flex items-center justify-between gap-3 border-t border-spool-thread/40 bg-spool-thread/10 px-4 py-2 text-xs">
          <p className="text-spool-paper/80">
            That is {formatBytes(pendingJoin.byteLength)} across {pendingJoin.clips} clips. The
            clipboard is shared with every application on this machine.
          </p>
          <span className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={() => void window.spool.pasteWholeSpool(true)}
              className="rounded bg-spool-thread/80 px-2 py-1 text-spool-ink"
            >
              Put it on the clipboard
            </button>
            <button
              type="button"
              onClick={() => void window.spool.cancelWholeSpoolPaste()}
              className="rounded border border-spool-paper/20 px-2 py-1 text-spool-paper/70"
            >
              Cancel
            </button>
          </span>
        </div>
      )}
    </main>
  )
}
