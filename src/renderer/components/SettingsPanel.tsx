import { useState, type JSX, type ReactNode } from 'react'
import type { AppState } from '../../shared/ipc'
import { formatBytes, percentFull } from '../helpers/CapacityHelper'
import { RETENTION_LABELS, formatLimit, retentionLabel } from '../helpers/SettingsPanelHelper'

/**
 * Settings (PLAN.md 11, M9): retention, standing answers, the consent timeout, the caps, and the
 * failsafe.
 *
 * Every destructive control here says what it will do before it does it. **Reset everything** asks
 * the user to type the word, because there is no undo buffer for it and there should not be — one
 * would hold precisely the bytes the user was trying to be rid of (PLAN.md 12).
 */
export function SettingsPanel({ state, onBack }: { state: AppState; onBack: () => void }): JSX.Element {
  const { spools, privacy, capacity } = state
  const [typed, setTyped] = useState('')
  const [resetFailures, setResetFailures] = useState<Array<{ path: string; reason: string }>>([])

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
        <h2 className="text-sm font-semibold">Settings</h2>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 text-xs">
        <Section title="How long clips are kept">
          <p className="text-spool-paper/50">
            Per spool, and off unless you turn it on. This is the only way a clip goes away without
            you removing it — apart from the default spool rolling at its cap.
          </p>
          {spools.map((spool) => (
            <label key={spool.id} className="flex items-center justify-between gap-2">
              <span className="truncate text-spool-paper/80">{spool.name}</span>
              <select
                value={String(spool.retentionHours ?? 'none')}
                onChange={(event) =>
                  void window.spool.setRetention(
                    spool.id,
                    event.target.value === 'none' ? null : Number(event.target.value)
                  )
                }
                className="shrink-0 rounded border border-spool-paper/20 bg-spool-ink px-2 py-1 text-spool-paper"
              >
                {RETENTION_LABELS.map(({ value, label }) => (
                  <option key={label} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <p className="text-[10px] text-spool-paper/35">
            {spools
              .filter((spool) => spool.retentionHours !== null)
              .map((spool) => `${spool.name}: ${retentionLabel(spool.retentionHours)}`)
              .join(' · ')}
          </p>
        </Section>

        {/* The same figures the modal shows, on demand — the modal is a prompt, never the only
            route to them (PLAN.md 9). */}
        <Section title="Storage">
          <p className="text-spool-paper/50">
            {capacity.description} — {percentFull(capacity.ratio)} full.
          </p>
          {capacity.candidates.length > 0 && (
            <ul className="space-y-0.5">
              {capacity.candidates.map((candidate) => (
                <li key={candidate.id} className="flex justify-between gap-2 text-spool-paper/50">
                  <span className="truncate">{candidate.name}</span>
                  <span className="shrink-0">
                    {candidate.clips} · {formatBytes(candidate.bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-spool-paper/35">
            Spool never deletes anything on its own. When the store approaches its limit it offers a
            list, and waits.
          </p>
        </Section>

        <Section title="Standing answers">
          {privacy.sourceRules.length === 0 ? (
            <p className="text-spool-paper/50">
              None yet. Choosing “Always keep” or “Always skip” on a prompt makes one.
            </p>
          ) : (
            <ul className="space-y-1">
              {privacy.sourceRules.map((rule) => (
                <li key={rule.sourceApp} className="flex items-center justify-between gap-2">
                  <span className="truncate text-spool-paper/80">
                    {rule.sourceApp.replace(/\.exe$/i, '')} —{' '}
                    {rule.action === 'always_keep' ? 'always kept' : 'always skipped'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void window.spool.revokeSourceRule(rule.sourceApp)}
                    className="shrink-0 rounded border border-spool-paper/20 px-2 py-0.5 hover:bg-spool-paper/10"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-spool-paper/35">
            Revoking one means the next clip from that application asks again.
          </p>
        </Section>

        <Section title="How long a prompt waits">
          <label className="flex items-center gap-2">
            <input
              type="number"
              min={5}
              max={600}
              value={privacy.consentTimeoutSeconds}
              onChange={(event) => void window.spool.setConsentTimeout(Number(event.target.value))}
              className="w-20 rounded border border-spool-paper/20 bg-transparent px-2 py-1 text-spool-paper"
            />
            <span className="text-spool-paper/50">seconds, then it counts as Skip</span>
          </label>
        </Section>

        <Section title="Limits">
          <dl className="space-y-0.5 text-spool-paper/50">
            <Limit label="Clips in the default spool" value={`${privacy.limits.defaultSpoolClips} — oldest rolls off`} />
            <Limit label="Clips in a saved spool" value={`${privacy.limits.savedSpoolClips} — capture stops`} />
            <Limit label="Saved spools" value={String(privacy.limits.savedSpools)} />
            <Limit label="One clip" value={formatLimit(privacy.limits.clipBytes)} />
            <Limit label="Everything stored" value={formatLimit(privacy.limits.storeBytes)} />
          </dl>
          <p className="text-[10px] text-spool-paper/35">Fixed in this version.</p>
        </Section>

        <Section title="Reset everything">
          <p className="text-spool-paper/50">
            Deletes every spool, every clip, the encrypted file, the key that unlocks it, and these
            settings, then restarts. There is no undo — one would hold exactly the bytes you were
            trying to be rid of.
          </p>
          <label className="block text-spool-paper/50" htmlFor="reset-confirm">
            Type RESET to confirm
          </label>
          <div className="flex gap-1.5">
            <input
              id="reset-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="w-28 rounded border border-spool-paper/20 bg-transparent px-2 py-1 text-spool-paper"
            />
            <button
              type="button"
              disabled={typed !== 'RESET'}
              onClick={() => {
                void window.spool.resetEverything().then((result) => setResetFailures(result.failed))
              }}
              className="rounded bg-spool-thread/80 px-2 py-1 text-spool-ink disabled:bg-spool-paper/10 disabled:text-spool-paper/30"
            >
              Reset everything
            </button>
          </div>
          {resetFailures.length > 0 && (
            <div className="rounded border border-spool-thread/50 p-2 text-spool-thread">
              <p>Some of it could not be removed, so nothing is being claimed as gone:</p>
              <ul className="mt-1 space-y-0.5 text-[10px]">
                {resetFailures.map((failure) => (
                  <li key={failure.path}>
                    {failure.path} — {failure.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      </div>
    </section>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-spool-thread uppercase">{title}</h3>
      {children}
    </div>
  )
}

function Limit({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <dt className="truncate">{label}</dt>
      <dd className="shrink-0 text-spool-paper/70">{value}</dd>
    </div>
  )
}
