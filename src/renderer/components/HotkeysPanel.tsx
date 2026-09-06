import type { JSX } from 'react'
import type { HotkeyView } from '../../shared/ipc'
import { KEY_CHOICES, MODIFIER_CHOICES, splitAccelerator } from '../../shared/hotkeys'
import { hotkeySummary } from '../helpers/HotkeysPanelHelper'

/**
 * The hotkey reference, and the place a refused one is fixed (PLAN.md 8).
 *
 * It is one screen rather than two because the moment a user goes looking for "what are the keys
 * again?" is the same moment they discover one of them does nothing. **A failed registration must
 * be surfaced, not swallowed** — the tray said so all along, but nobody opens the tray to find out
 * why a key they just pressed did nothing.
 *
 * Rebinding is a pair of dropdowns rather than "press the combination you want", because on Windows
 * the shell eats `Win`-key presses before a renderer ever sees them: a capture box would be unable
 * to hear the very family the defaults live in. Picking from lists and then *trying* it is honest
 * about what is happening — the operating system, not this app, decides who gets a combination.
 */
export function HotkeysPanel({
  hotkeys,
  onBack
}: {
  hotkeys: readonly HotkeyView[]
  onBack: () => void
}): JSX.Element {
  const summary = hotkeySummary(hotkeys)

  return (
    <main className="flex h-full flex-col bg-spool-ink text-spool-paper">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h1 className="text-sm font-semibold tracking-tight">Hotkeys</h1>
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-spool-paper/20 px-2 py-0.5 text-[11px] text-spool-paper/60 hover:bg-spool-paper/10"
        >
          Back
        </button>
      </header>

      {summary !== null && (
        <p className="mx-4 mb-2 rounded bg-spool-thread/10 px-2 py-1.5 text-[11px] text-spool-thread">
          {summary}
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        {hotkeys.map((hotkey) => (
          <HotkeyRow key={hotkey.action} hotkey={hotkey} />
        ))}

        <p className="pt-1 text-[11px] leading-relaxed text-spool-paper/40">
          Switching FIFO and LIFO has no hotkey on purpose — it is the mode pill at the top of the
          window. It is something you change while looking at the spool, not while typing somewhere
          else, so it spends no global combination.
        </p>
      </div>
    </main>
  )
}

function HotkeyRow({ hotkey }: { hotkey: HotkeyView }): JSX.Element {
  const { modifier, key } = splitAccelerator(hotkey.accelerator)
  const chosen = MODIFIER_CHOICES.find((choice) => choice.value === modifier)

  const change = (nextModifier: string, nextKey: string): void => {
    void window.spool.setHotkey(hotkey.action, `${nextModifier}+${nextKey}`)
  }

  return (
    <section className="rounded border border-spool-paper/10 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-medium">{hotkey.label}</h2>
        <span
          className={
            hotkey.claimed
              ? 'shrink-0 text-[11px] font-semibold text-spool-thread'
              : 'shrink-0 text-[11px] font-semibold text-spool-paper/30 line-through'
          }
        >
          {hotkey.described}
        </span>
      </div>

      <p className="mt-0.5 text-[11px] leading-snug text-spool-paper/45">{hotkey.hint}</p>

      {!hotkey.claimed && (
        <p className="mt-1.5 rounded bg-spool-thread/10 px-2 py-1 text-[11px] leading-snug text-spool-thread">
          Another application already owns {hotkey.described}, so this key does nothing. Pick a
          different one below.
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-1.5">
        <select
          value={modifier}
          onChange={(event) => change(event.target.value, key)}
          className="rounded border border-spool-paper/20 bg-spool-ink px-1.5 py-1 text-[11px] text-spool-paper"
        >
          {MODIFIER_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>

        <select
          value={key}
          onChange={(event) => change(modifier, event.target.value)}
          className="rounded border border-spool-paper/20 bg-spool-ink px-1.5 py-1 text-[11px] text-spool-paper"
        >
          {KEY_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>

        {!hotkey.isDefault && (
          <button
            type="button"
            onClick={() => void window.spool.resetHotkey(hotkey.action)}
            className="rounded border border-spool-paper/20 px-1.5 py-1 text-[11px] text-spool-paper/60 hover:bg-spool-paper/10"
          >
            Default
          </button>
        )}
      </div>

      {chosen?.hazard != null && (
        <p className="mt-1 text-[10px] leading-snug text-spool-paper/35">{chosen.hazard}</p>
      )}
    </section>
  )
}
