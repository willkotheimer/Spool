import { useState, type JSX } from 'react'
import type { SpoolSummary } from '../../shared/ipc'

/**
 * The spool list (PLAN.md 8): switch which spool captures and is arranged, make one, rename one,
 * clear one, delete one.
 *
 * **The default spool offers Clear but not Delete.** It is the buffer that catches a copy when the
 * user has chosen nothing else, so there always has to be one (PLAN.md 2). Deleting a saved spool
 * asks first and says what goes with it — a spool is a thing someone built, and its clips go too.
 */
export function SpoolSidebar({ spools }: { spools: readonly SpoolSummary[] }): JSX.Element {
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

  return (
    <div className="space-y-1.5">
      <h2 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">Spools</h2>

      <ul className="space-y-1">
        {spools.map((spool) => (
          <li key={spool.id} className="rounded border border-spool-paper/10">
            {renaming === spool.id ? (
              <form
                className="flex gap-1 p-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  void window.spool.renameSpool(spool.id, renameTo)
                  setRenaming(null)
                }}
              >
                <input
                  autoFocus
                  value={renameTo}
                  onChange={(event) => setRenameTo(event.target.value)}
                  className="min-w-0 flex-1 rounded border border-spool-paper/20 bg-transparent px-1.5 py-0.5 text-spool-paper"
                />
                <button type="submit" className="rounded px-1.5 text-spool-thread">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(null)}
                  className="rounded px-1.5 text-spool-paper/50"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => void window.spool.setActiveSpool(spool.id)}
                  className={[
                    'flex w-full items-baseline justify-between gap-2 rounded px-1.5 py-1 text-left',
                    spool.isActive ? 'bg-spool-thread/15 text-spool-paper' : 'hover:bg-spool-paper/10'
                  ].join(' ')}
                >
                  <span className="truncate">
                    {spool.name}
                    {spool.isActive && <span className="ml-1.5 text-[10px] text-spool-thread">active</span>}
                  </span>
                  <span className="shrink-0 text-[10px] text-spool-paper/40">{spool.count}</span>
                </button>

                <div className="mt-0.5 flex gap-1 px-1.5 text-[10px] text-spool-paper/40">
                  <button
                    type="button"
                    onClick={() => {
                      setRenaming(spool.id)
                      setRenameTo(spool.name)
                    }}
                    className="hover:text-spool-paper"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={spool.count === 0}
                    onClick={() => void window.spool.clearSpool(spool.id)}
                    className="hover:text-spool-paper disabled:text-spool-paper/20"
                  >
                    Clear
                  </button>
                  {/* No Delete for the default spool: something has to catch the next copy. */}
                  {!spool.isDefault &&
                    (confirmingDelete === spool.id ? (
                      <>
                        <span className="text-spool-thread">
                          Delete with {spool.count} {spool.count === 1 ? 'clip' : 'clips'}?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            void window.spool.deleteSpool(spool.id)
                            setConfirmingDelete(null)
                          }}
                          className="text-spool-thread hover:underline"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(null)}
                          className="hover:text-spool-paper"
                        >
                          No
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(spool.id)}
                        className="hover:text-spool-paper"
                      >
                        Delete
                      </button>
                    ))}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        className="flex gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          void window.spool.createSpool(newName)
          setNewName('')
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New spool"
          className="min-w-0 flex-1 rounded border border-spool-paper/20 bg-transparent px-2 py-1 text-spool-paper placeholder:text-spool-paper/25"
        />
        <button
          type="submit"
          className="shrink-0 rounded border border-spool-paper/20 px-2 py-1 text-spool-paper/80 hover:bg-spool-paper/10"
        >
          Add
        </button>
      </form>
    </div>
  )
}
