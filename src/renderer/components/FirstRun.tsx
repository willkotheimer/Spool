import type { JSX } from 'react'
import type { PrivacyFacts } from '../../shared/ipc'
import { keyStoreName, type Platform } from '../helpers/PrivacyPanelHelper'

/**
 * The first thing anyone sees (PLAN.md 11, M13), carrying the statement of PLAN.md 5f.
 *
 * **Nothing is captured until this is acknowledged.** The promise is made before anything is
 * collected rather than after — an app that starts recording the clipboard and explains itself
 * later has already done the thing it is promising not to do.
 */
export function FirstRun({
  platform,
  privacy
}: {
  platform: Platform
  privacy: PrivacyFacts
}): JSX.Element {
  return (
    <main className="flex h-full flex-col bg-spool-ink px-5 py-5 text-spool-paper">
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 shrink-0 rounded-full border-2 border-spool-thread/70" />
        <h1 className="text-lg font-semibold tracking-tight">Spool</h1>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto text-xs leading-relaxed">
        <p className="text-sm font-medium">Nothing you copy leaves this computer.</p>

        <p className="text-spool-paper/70">
          Spool blocks every network request it could make, and the block is verified by a test that
          runs on every build — no accounts, no sync, no analytics, no update checks. Updates are
          manual downloads on purpose: an updater is network code, and it would void this claim.
        </p>

        <p className="text-spool-paper/70">
          Your clips live in one encrypted file on this machine, and the key is held in{' '}
          {keyStoreName(platform)} — never in a file, a constant, or the database itself.
        </p>

        <p className="text-spool-paper/70">
          Before anything that looks like a secret is stored, Spool asks. It looks for{' '}
          {privacy.heuristics.map((rule) => rule.label.toLowerCase()).join(', ')}, and it treats an
          application marking a copy as concealed — as password managers do — as authoritative. A
          prompt left unanswered for {privacy.consentTimeoutSeconds} seconds is treated as Skip.
        </p>

        <p className="text-spool-paper/70">
          Spool never deletes anything on its own, apart from the default spool rolling at its cap
          and any age limit you set yourself.
        </p>
      </div>

      <div className="mt-4 shrink-0">
        <button
          type="button"
          onClick={() => void window.spool.acknowledgePrivacy()}
          className="w-full rounded bg-spool-thread/80 px-3 py-2 text-sm font-medium text-spool-ink hover:bg-spool-thread"
        >
          Start capturing
        </button>
        <p className="mt-1.5 text-center text-[10px] text-spool-paper/35">
          Nothing is captured until you press this. You can read all of it again under Privacy.
        </p>
      </div>
    </main>
  )
}
