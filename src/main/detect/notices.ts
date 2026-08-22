import type { Notice, NoticeCategory } from '../../shared/ipc'
import type { DeclineReason } from './admit'

/**
 * What the user is told when a copy is declined (PLAN.md 4).
 *
 * A declined copy is declined, not swallowed: nothing is appended and no state changes, but the
 * compact window says what it was. The system clipboard still holds the copy, so the user can paste
 * it normally with the OS shortcut — the only thing that did not happen is this app filing it.
 *
 * **Once per category per session, not once per copy.** Twenty screenshots produce one notice.
 */

export type { Notice, NoticeCategory }

/** Which categories have already been mentioned this session. */
export type NoticeLedger = ReadonlySet<NoticeCategory>

export const emptyLedger: NoticeLedger = new Set<NoticeCategory>()

/** Bytes, rendered the way the size notice reads them. */
export function formatBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib >= 1) return `${round(mib)} MB`

  const kib = bytes / 1024
  if (kib >= 1) return `${round(kib)} KB`
  return `${bytes} bytes`
}

const round = (value: number): string => (Math.round(value * 10) / 10).toString()

/** Every user-facing string in this file, so the wording lives in one place. */
export const NOTHING_TO_PASTE: Notice = {
  category: 'nothing_to_paste',
  message: 'Nothing to paste — this spool is empty'
}

function messageFor(category: NoticeCategory, bytes: number, limit: number): string {
  switch (category) {
    case 'image':
      return "Images aren't captured in this version"
    case 'file':
      return "Files aren't captured in this version"
    case 'unsupported':
      return "That kind of copy isn't captured in this version"
    case 'nothing_to_paste':
      return NOTHING_TO_PASTE.message
    case 'size':
      // Deliberately shaped unlike the format notices: nothing about this copy was the wrong
      // kind of thing, it was only too big (PLAN.md 4).
      return `That copy was ${formatBytes(bytes)}, over the ${formatBytes(limit)} limit for one clip`
  }
}

/**
 * Decide whether to say something, and what. Returns the notice to show and the ledger to keep, or
 * `null` for a category already mentioned this session.
 */
export function noticeFor(
  ledger: NoticeLedger,
  category: NoticeCategory,
  size: { bytes: number; limit: number } = { bytes: 0, limit: 0 }
): { notice: Notice; ledger: NoticeLedger } | null {
  if (ledger.has(category)) return null

  return {
    notice: { category, message: messageFor(category, size.bytes, size.limit) },
    ledger: new Set([...ledger, category])
  }
}

/** A decline that is worth mentioning has a category; `empty` does not. */
export function categoryForDecline(reason: DeclineReason): NoticeCategory | null {
  return reason === 'empty' ? null : reason
}
