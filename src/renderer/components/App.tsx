import { useState, type JSX } from 'react'
import { PrivacyPanel } from './PrivacyPanel'

/**
 * The compact window (PLAN.md 8). Still empty of clips at M1 by design: it holds the shell the
 * later milestones fill in — the active spool, its mode pill, and the clip that serves next — plus
 * the privacy affordance, which is reachable in one click from here (PLAN.md 5f).
 */
export function App(): JSX.Element {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const { summonHotkey, platform } = window.spool

  if (showPrivacy) {
    return <PrivacyPanel platform={platform} onBack={() => setShowPrivacy(false)} />
  }

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

      <footer className="flex items-center justify-between px-4 pb-4 text-[11px] text-spool-paper/40">
        <span>{summonHotkey} shows and hides this window.</span>
        <button
          type="button"
          onClick={() => setShowPrivacy(true)}
          className="rounded px-2 py-1 text-spool-thread hover:bg-spool-paper/10"
        >
          Privacy
        </button>
      </footer>
    </main>
  )
}
