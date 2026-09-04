import type { JSX, ReactNode } from 'react'
import type { PrivacyFacts } from '../../shared/ipc'
import { dataFileDescription, keySealerName, type Platform } from '../helpers/PrivacyPanelHelper'

/**
 * The in-app privacy panel (PLAN.md 5f), in plain language from the user's side of the screen.
 * Static at M1: it describes the guarantee that exists now, and states plainly where the parts that
 * do not exist yet stand. Nothing here claims a feature the build does not have.
 */
export function PrivacyPanel({
  platform,
  privacy,
  onBack
}: {
  platform: Platform
  privacy: PrivacyFacts
  onBack: () => void
}): JSX.Element {
  return (
    <section className="flex h-full flex-col bg-spool-ink text-spool-paper">
      <header className="flex items-center gap-2 border-b border-spool-paper/10 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-xs text-spool-paper/60 hover:bg-spool-paper/10 hover:text-spool-paper"
        >
          ← Back
        </button>
        <h2 className="text-sm font-semibold">Privacy</h2>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-xs leading-relaxed">
        <p className="text-sm font-medium text-spool-paper">
          Nothing you copy leaves this computer.
        </p>

        <p className="text-spool-paper/70">
          Spool blocks every network request it could make, and the block is verified by a test that
          runs on every build — no accounts, no sync, no analytics, no update checks. Updates are
          manual downloads on purpose: an updater is network code, and it would void this claim.
        </p>

        <Section title="Where your clips live">
          <p className="text-spool-paper/70">{dataFileDescription(privacy.dataFilePath)}</p>
          <p className="text-spool-paper/70">
            When storage arrives, clips live in one encrypted file and the key that opens it is sealed by{' '}
            {keySealerName(platform)} — never written in plaintext, in a constant, or in the
            database itself.
          </p>
        </Section>

        <Section title="What looks like a secret">
          <p className="text-spool-paper/70">
            Spool asks before keeping anything that matches one of these. It never decides for you,
            and it never drops a clip on its own.
          </p>
          <ul className="space-y-1">
            {privacy.heuristics.map(({ label, detail }) => (
              <li key={label} className="text-spool-paper/70">
                <span className="text-spool-paper">{label}</span> — {detail}
              </li>
            ))}
          </ul>
          <p className="text-spool-paper/70">
            An application can also mark a copy as concealed — password managers do — and that
            marking is treated as authoritative.
          </p>
        </Section>

        <Section title="If you do not answer">
          <p className="text-spool-paper/70">
            A prompt left unanswered for {privacy.consentTimeoutSeconds} seconds is treated as Skip.
            When
            nobody is at the keyboard, the safe default is not to write.
          </p>
        </Section>

        <Section title="Clear everything">
          <p className="text-spool-paper/70">
            Removes every spool, every clip, and the encrypted file itself. There is nothing stored
            yet in this build, so there is nothing to clear.
          </p>
          <button
            type="button"
            disabled
            className="rounded border border-spool-paper/20 px-3 py-1.5 text-spool-paper/40"
          >
            Clear everything
          </button>
        </Section>
      </div>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">
        {title}
      </h3>
      {children}
    </div>
  )
}
