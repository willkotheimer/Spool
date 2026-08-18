import type { JSX } from 'react'

/**
 * The compact window (PLAN.md 8). Empty at M0 by design: it holds the shell the later milestones
 * fill in — the active spool, its mode pill, and the clip that serves next.
 */
export function App(): JSX.Element {
  const summonHotkey = window.spool.summonHotkey

  return (
    <main className="flex h-full flex-col bg-spool-ink text-spool-paper">
      <header className="flex items-baseline justify-between px-4 pt-4">
        <h1 className="text-lg font-semibold tracking-tight">Spool</h1>
        <span className="text-xs text-spool-paper/50">no spool yet</span>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-spool-thread/70" />
        <p className="text-sm text-spool-paper/70">Nothing captured yet.</p>
      </div>

      <footer className="px-4 pb-4 text-[11px] text-spool-paper/40">
        {summonHotkey} shows and hides this window.
      </footer>
    </main>
  )
}
