import { describe, expect, it, vi } from 'vitest'
import type { ClipboardSnapshot } from './detect/admit'
import { Session } from './session'
import type { AppState } from '../shared/ipc'
import type { ClipboardWatcher } from './clipboard/watcher'

/**
 * The session end to end, driven by a fake watcher: clipboard changes in, the state the renderer
 * will draw out. The seam is `ClipboardWatcher`, so everything above the operating system is
 * covered without a clipboard (PLAN.md 6).
 */

function fakeWatcher(): ClipboardWatcher & { change: (snapshot: ClipboardSnapshot) => void } {
  let onChange: (snapshot: ClipboardSnapshot) => void = () => {}
  return {
    start: (listener) => {
      onChange = listener
    },
    stop: () => {
      onChange = () => {}
    },
    change: (snapshot) => onChange(snapshot)
  }
}

const text = (value: string, sourceApp: string | null = null): ClipboardSnapshot => ({
  formats: ['CF_UNICODETEXT'],
  text: value,
  sourceApp
})

function started(): { session: Session; watcher: ReturnType<typeof fakeWatcher> } {
  const watcher = fakeWatcher()
  const session = new Session()
  session.startCapture({ ok: true, watcher })
  return { session, watcher }
}

describe('a session that is capturing', () => {
  it('shows three copies as three clips, oldest first, with the oldest serving next', () => {
    const { session, watcher } = started()

    watcher.change(text('first'))
    watcher.change(text('second'))
    watcher.change(text('third'))

    const { spool } = session.getState()
    expect(spool.clips.map((clip) => clip.preview)).toEqual(['first', 'second', 'third'])
    expect(spool.mode).toBe('fifo')
    expect(spool.cursorClipId).toBe(spool.clips[0].id)
    expect(spool.count).toBe(3)
  })

  it('tells its listeners on every change, so the window never has to ask', () => {
    const { session, watcher } = started()
    const seen: AppState[] = []
    session.onChange((state) => seen.push(state))

    watcher.change(text('first'))
    watcher.change(text('second'))

    expect(seen.map((state) => state.spool.count)).toEqual([1, 2])
  })

  it('stops telling a listener that unsubscribed', () => {
    const { session, watcher } = started()
    const listener = vi.fn()
    const unsubscribe = session.onChange(listener)

    watcher.change(text('first'))
    unsubscribe()
    watcher.change(text('second'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('carries the source application through to the window', () => {
    const { session, watcher } = started()

    watcher.change(text('a formula', 'EXCEL.EXE'))

    expect(session.getState().spool.clips[0].sourceApp).toBe('EXCEL.EXE')
  })

  it('shows a notice for a declined copy and clears it on the next real capture', () => {
    const { session, watcher } = started()

    watcher.change({ formats: ['CF_DIB', 'CF_BITMAP'], text: null })
    expect(session.getState().notice?.message).toBe("Images aren't captured in this version")

    // A second screenshot says nothing new, and the first notice still stands.
    watcher.change({ formats: ['CF_DIB'], text: null })
    expect(session.getState().notice?.message).toBe("Images aren't captured in this version")

    watcher.change(text('something real'))
    expect(session.getState().notice).toBeNull()
    expect(session.getState().spool.count).toBe(1)
  })

  it('sends the preview and never the full content', () => {
    const { session, watcher } = started()
    const tail = 'ONLY-IN-MAIN'
    watcher.change(text(`${'x'.repeat(500)} ${tail}`))

    const clip = session.getState().spool.clips[0]
    expect(clip).not.toHaveProperty('content')

    // A preview is a truncated copy, so the far end of a long clip never crosses the bridge.
    expect(JSON.stringify(session.getState())).not.toContain(tail)
    expect(clip.preview.length).toBeLessThanOrEqual(120)
  })
})

describe('a session that cannot capture', () => {
  it('says why, rather than looking like an app with nothing in it', () => {
    const session = new Session()
    session.startCapture({ ok: false, reason: 'the clipboard addon could not be loaded' })

    const { capture } = session.getState()
    expect(capture.available).toBe(false)
    expect(capture.reason).toBe('the clipboard addon could not be loaded')
  })

  it('reports itself available once a watcher starts', () => {
    const { session } = started()

    expect(session.getState().capture).toEqual({ available: true, reason: null })
  })
})
