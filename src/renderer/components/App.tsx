import { useState, type JSX } from 'react'
import { capacityLabel } from '../helpers/ClipListHelper'
import { useAppState } from '../state/useAppState'
import { ClipList } from './ClipList'
import { ExpandedView } from './ExpandedView'
import { ConsentPrompt } from './ConsentPrompt'
import { PrivacyPanel } from './PrivacyPanel'
import { SettingsPanel } from './SettingsPanel'

/**
 * The compact window (PLAN.md 8): the active spool's name, its mode pill, the clip that serves
 * next, the clips behind it, and the privacy affordance. This is the state the app lives in.
 */
function Hint({ keys, children }: { keys: string; children: string }): JSX.Element {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 text-spool-paper/60">{keys}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  )
}

export function App(): JSX.Element {
  const [showPrivacy, setShowPrivacy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const { summonHotkey, serveHotkey, pasteAllHotkey, modeHotkey, platform } = window.spool
  const state = useAppState()
  const { spool, notice, capture, prompt, privacy, storage } = state

  if (expanded) {
    return (
      <ExpandedView
        state={state}
        onCompact={() => {
          setExpanded(false)
          void window.spool.setWindowState('compact')
        }}
      />
    )
  }

  if (showSettings) {
    return <SettingsPanel state={state} onBack={() => setShowSettings(false)} />
  }

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
          <button
            type="button"
            onClick={() => {
              setExpanded(true)
              void window.spool.setWindowState('expanded')
            }}
            className="rounded border border-spool-paper/20 px-1.5 py-0.5 text-[10px] text-spool-paper/60 hover:bg-spool-paper/10"
          >
            Arrange
          </button>
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

      {!storage.available && storage.reason !== null && (
        <div className="mx-2 mb-1 rounded bg-spool-thread/10 px-2 py-1.5 text-[11px] text-spool-thread">
          <p>Not saving anything — {storage.reason}</p>
          {storage.canStartFresh && (
            <button
              type="button"
              onClick={() => void window.spool.startFreshStore()}
              className="mt-1 rounded border border-spool-thread/50 px-2 py-0.5 text-[11px] hover:bg-spool-thread/20"
            >
              Start a fresh store
            </button>
          )}
        </div>
      )}

      {!capture.available && capture.reason !== null && (
        <p className="mx-2 mb-1 rounded bg-spool-thread/10 px-2 py-1.5 text-[11px] text-spool-thread">
          Not capturing — {capture.reason}
        </p>
      )}

      <footer className="px-4 pb-3 text-[11px] text-spool-paper/40">
        <div className="flex items-end justify-between gap-2">
          <dl className="min-w-0 space-y-0.5">
            <Hint keys={serveHotkey}>serve the next clip</Hint>
            <Hint keys={pasteAllHotkey}>put the whole spool on the clipboard</Hint>
            <Hint keys={modeHotkey}>{spool.mode === 'fifo' ? 'newest first' : 'oldest first'}</Hint>
            <Hint keys={summonHotkey}>show and hide</Hint>
          </dl>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="rounded px-2 py-1 text-spool-paper/60 hover:bg-spool-paper/10"
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="rounded px-2 py-1 text-spool-thread hover:bg-spool-paper/10"
            >
              Privacy
            </button>
          </span>
        </div>
      </footer>
    </main>
  )
}
