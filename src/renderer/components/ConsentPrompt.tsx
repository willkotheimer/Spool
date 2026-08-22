import type { JSX, ReactNode } from 'react'
import type { ConsentChoice, PendingPrompt } from '../../shared/ipc'
import { sourceName } from '../helpers/ConsentPromptHelper'

/**
 * The consent prompt (PLAN.md 4): non-blocking, inline in the compact window, four choices.
 *
 * The clip behind this is in memory only and has not been written anywhere. Nothing here is a
 * prohibition — Keep stores the password if that is what the user wants (invariant 3) — and nothing
 * here shows the content, because a prompt about a secret has no business displaying it.
 */
export function ConsentPrompt({
  prompt,
  onAnswer
}: {
  prompt: PendingPrompt
  onAnswer: (choice: ConsentChoice) => void
}): JSX.Element {
  const application = sourceName(prompt.sourceApp)

  return (
    <section
      className={
        prompt.tier === 1
          ? 'mx-2 mb-2 rounded border border-spool-thread/60 bg-spool-thread/10 p-2.5'
          : 'mx-2 mb-2 rounded border border-spool-paper/20 bg-spool-paper/5 p-2.5'
      }
    >
      <p className="text-xs font-medium text-spool-paper">{prompt.headline}</p>
      <p className="mt-0.5 text-[11px] text-spool-paper/50">{prompt.detail}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Choice onClick={() => onAnswer('keep_once')} emphasis>
          Keep once
        </Choice>
        <Choice onClick={() => onAnswer('skip')}>Skip</Choice>
        {application !== null && (
          <>
            <Choice onClick={() => onAnswer('always_keep')}>Always keep from {application}</Choice>
            <Choice onClick={() => onAnswer('always_skip')}>Always skip from {application}</Choice>
          </>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-spool-paper/35">
        Unanswered for {prompt.timeoutSeconds} seconds, this is skipped.
      </p>
    </section>
  )
}

function Choice({
  onClick,
  emphasis = false,
  children
}: {
  onClick: () => void
  emphasis?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        emphasis
          ? 'rounded bg-spool-thread/80 px-2 py-1 text-[11px] font-medium text-spool-ink hover:bg-spool-thread'
          : 'rounded border border-spool-paper/20 px-2 py-1 text-[11px] text-spool-paper/80 hover:bg-spool-paper/10'
      }
    >
      {children}
    </button>
  )
}
