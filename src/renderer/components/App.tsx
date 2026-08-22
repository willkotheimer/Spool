import { useState, type JSX } from 'react'
import { capacityLabel } from '../helpers/ClipListHelper'
import { useAppState } from '../state/useAppState'
import { ClipList } from './ClipList'
import { ConsentPrompt } from './ConsentPrompt'
import { PrivacyPanel } from './PrivacyPanel'

/**
 * The compact window (PLAN.md 8): the active spool's name, its mode pill, the clip that serves
 * next, the clips behind it, and the privacy affordance. This is the state the app lives in.
 */
export function App(): JSX.Element {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const { summonHotkey, serveHotkey, modeHotkey, platform } = window.spool
  const { spool, notice, capture, prompt, privacy } = useAppState()

  if (showPrivacy) {
    return (
      <PrivacyPanel platform={platform} privacy={privacy} onBack={() => setShowPrivacy(false)} />
    )
  }

  return (
    <main className="flex h-full flex-col bg-spool-ink text-spool-paper">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h1 className="truncate text-sm font-semibold tracking-tight">{spool.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] text-spool-paper/40">{capacityLabel(spool)}</span>
          <span className="rounded-full border border-spool-thread/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-spool-thread uppercase">
            {spool.mode}
          </span>
        </div>
      </header>

      <ClipList spool={spool} />

      {prompt !== null && (
        <ConsentPrompt prompt={prompt} onAnswer={(choice) => void window.spool.answerConsent(choice)} />
      )}

      {notice !== null && (
        <p className="mx-2 mb-1 rounded bg-spool-paper/5 px-2 py-1.5 text-[11px] text-spool-paper/60">
          {notice.message}
        </p>
      )}

      {!capture.available && capture.reason !== null && (
        <p className="mx-2 mb-1 rounded bg-spool-thread/10 px-2 py-1.5 text-[11px] text-spool-thread">
          Not capturing — {capture.reason}
        </p>
      )}

      <footer className="px-4 pb-3 text-[11px] text-spool-paper/40">
        <div className="flex items-end justify-between gap-2">
          <dl className="min-w-0 space-y-0.5">
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-spool-paper/60">{serveHotkey}</dt>
              <dd className="truncate">puts the next clip on the clipboard, ready to paste</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-spool-paper/60">{modeHotkey}</dt>
              <dd className="truncate">switches {spool.mode === 'fifo' ? 'to newest first' : 'to oldest first'}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="shrink-0 text-spool-paper/60">{summonHotkey}</dt>
              <dd className="truncate">shows and hides this window</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => setShowPrivacy(true)}
            className="shrink-0 rounded px-2 py-1 text-spool-thread hover:bg-spool-paper/10"
          >
            Privacy
          </button>
        </div>
      </footer>
    </main>
  )
}
