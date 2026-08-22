import type { Sensitivity } from './sensitivity'

/**
 * What happens to a clip once it has been classified (PLAN.md 4).
 *
 * **No privacy guard is a prohibition** (invariant 3). Every path here is a prompt or a default: a
 * user who wants to store a password can store a password. The app asks; it does not decide.
 */

/** A per-application standing answer to the prompt (PLAN.md 2). */
export type SourceAction = 'always_keep' | 'always_skip'

export type SourceRules = ReadonlyMap<string, SourceAction>

export const noSourceRules: SourceRules = new Map()

export type ConsentDecision =
  | { readonly kind: 'capture' }
  /** Discard and wipe, without asking — the user already answered for this application. */
  | { readonly kind: 'skip'; readonly because: 'source_rule' }
  | { readonly kind: 'prompt'; readonly sensitivity: Sensitivity }

/**
 * The order is the order of the flowchart in PLAN.md 4: a standing answer for the application comes
 * first, then what the application declared, then what the content looks like.
 *
 * A source rule short-circuits classification entirely, which is what makes it a *standing answer*
 * rather than a preference — "always skip from this app" means nothing from that app is filed,
 * whether or not this particular copy looks like a secret.
 */
export function decideConsent(
  sensitivity: Sensitivity | null,
  sourceApp: string | null,
  rules: SourceRules
): ConsentDecision {
  const rule = sourceApp === null ? undefined : rules.get(sourceApp)

  if (rule === 'always_skip') return { kind: 'skip', because: 'source_rule' }
  if (rule === 'always_keep') return { kind: 'capture' }

  return sensitivity === null ? { kind: 'capture' } : { kind: 'prompt', sensitivity }
}

/** The four choices the prompt offers (PLAN.md 4). */
export type ConsentChoice = 'keep_once' | 'skip' | 'always_keep' | 'always_skip'

/** The rule an answer leaves behind, if any. */
export function ruleFromChoice(choice: ConsentChoice): SourceAction | null {
  if (choice === 'always_keep') return 'always_keep'
  if (choice === 'always_skip') return 'always_skip'
  return null
}

export function keepsTheClip(choice: ConsentChoice): boolean {
  return choice === 'keep_once' || choice === 'always_keep'
}

/**
 * How long a prompt waits before answering itself (PLAN.md 4). When nobody is at the keyboard, the
 * safe default is not to write — so the timeout behaves as Skip, and the buffer is wiped.
 */
export const CONSENT_TIMEOUT_MS = 30_000

/** How the prompt reads. Tier 1 names the source; Tier 2 is softer, because it is a guess. */
export function promptWording(
  sensitivity: Sensitivity,
  sourceApp: string | null
): { headline: string; detail: string } {
  const application = sourceApp === null ? null : sourceApp.replace(/\.exe$/i, '')

  if (sensitivity.tier === 1) {
    return {
      headline:
        application === null
          ? 'That copy was marked as concealed. Keep it in this spool?'
          : `${application} marked this as concealed. Keep it in this spool?`,
      detail: sensitivity.rule
    }
  }

  return {
    headline: 'This looks like a secret. Keep it in this spool?',
    detail: `It looks like ${sensitivity.rule}.`
  }
}
