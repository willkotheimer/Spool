import { useState, type JSX } from 'react'
import type { CapacityView } from '../../shared/ipc'
import { formatBytes, lastUsedLabel } from '../helpers/CapacityHelper'

/**
 * The capacity advisor's modal (PLAN.md 9).
 *
 * It recommends; the user decides. Nothing here deletes anything that was not checked, **Not now**
 * always works and never partially applies, and there is no undo — an undo buffer would hold
 * exactly the bytes the user was trying to free, so this says so plainly instead of offering a
 * reversal the encrypted store could not honour (PLAN.md 12).
 */
export function CapacityAdvisor({ capacity }: { capacity: CapacityView }): JSX.Element {
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)

  const chosen = capacity.candidates.filter((candidate) => selected.includes(candidate.id))
  const freedBytes = chosen.reduce((total, candidate) => total + candidate.bytes, 0)

  const toggle = (id: string): void =>
    setSelected((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    )

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-spool-ink/80 p-4">
      <section className="flex max-h-full w-full max-w-lg flex-col rounded border border-spool-thread/50 bg-spool-ink p-4">
        <h2 className="text-sm font-semibold text-spool-paper">Spool is almost out of space</h2>
        <p className="mt-1 text-xs text-spool-paper/60">
          You’ve used {capacity.description}. Deleting spools you have finished with frees space —
          and either way, nothing leaves your computer.
        </p>

        {capacity.candidates.length === 0 ? (
          <p className="mt-3 text-xs text-spool-paper/50">
            There is nothing to suggest: the only spools here are the default one and the one you
            are working in, and neither is ever proposed.
          </p>
        ) : (
          <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
            {capacity.candidates.map((candidate) => (
              <li key={candidate.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-spool-paper/5">
                  <input
                    type="checkbox"
                    checked={selected.includes(candidate.id)}
                    onChange={() => toggle(candidate.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-spool-paper/80">
                    {candidate.name}
                  </span>
                  {/* A list without sizes is not actionable (PLAN.md 9). */}
                  <span className="shrink-0 text-[10px] text-spool-paper/40">
                    {candidate.clips} {candidate.clips === 1 ? 'clip' : 'clips'} ·{' '}
                    {formatBytes(candidate.bytes)} · {lastUsedLabel(candidate.lastUsedAt)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-3 text-xs text-spool-thread">
          {selected.length === 0
            ? 'Nothing selected'
            : `Delete ${selected.length} ${selected.length === 1 ? 'spool' : 'spools'} · frees ${formatBytes(freedBytes)}`}
        </p>

        {confirming ? (
          <div className="mt-2 flex items-center justify-between gap-2 rounded border border-spool-thread/50 p-2 text-xs">
            <p className="text-spool-paper/80">
              Delete {selected.length} {selected.length === 1 ? 'spool' : 'spools'} and their clips,
              freeing {formatBytes(freedBytes)}? This cannot be undone.
            </p>
            <span className="flex shrink-0 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  void window.spool.deleteSpools(selected)
                  setSelected([])
                  setConfirming(false)
                }}
                className="rounded bg-spool-thread/80 px-2 py-1 text-spool-ink"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded border border-spool-paper/20 px-2 py-1 text-spool-paper/70"
              >
                Keep them
              </button>
            </span>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => setConfirming(true)}
              className="rounded bg-spool-thread/80 px-3 py-1.5 text-xs text-spool-ink disabled:bg-spool-paper/10 disabled:text-spool-paper/30"
            >
              Delete selected
            </button>
            <button
              type="button"
              onClick={() => void window.spool.dismissCapacityAdvice()}
              className="rounded border border-spool-paper/20 px-3 py-1.5 text-xs text-spool-paper/70 hover:bg-spool-paper/10"
            >
              Not now
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
