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

function started(): {
  session: Session
  watcher: ReturnType<typeof fakeWatcher>
  written: string[]
} {
  const watcher = fakeWatcher()
  const written: string[] = []
  const session = new Session((text) => written.push(text))
  session.startCapture({ ok: true, watcher })
  return { session, watcher, written }
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
    const session = new Session(() => {})
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

describe('serving (PLAN.md 11, M4)', () => {
  /** Serve, then hand back what landed on the clipboard — and feed it back as the watcher would. */
  function serveAndEcho(session: Session, watcher: ReturnType<typeof fakeWatcher>, written: string[]) {
    const before = written.length
    session.serveNext()
    const value = written[written.length - 1]
    // Serving writes to the clipboard, which fires the very listener M3 built.
    if (written.length > before) watcher.change(text(value))
    return value
  }

  it('serves A, B, C in fifo — the acceptance sequence', () => {
    const { session, watcher, written } = started()
    for (const value of ['A', 'B', 'C']) watcher.change(text(value))

    expect(serveAndEcho(session, watcher, written)).toBe('A')
    expect(serveAndEcho(session, watcher, written)).toBe('B')
    expect(serveAndEcho(session, watcher, written)).toBe('C')
  })

  it('serves C, B, A in lifo — the same acceptance sequence, repeated in the other mode', () => {
    const { session, watcher, written } = started()
    session.toggleMode()
    expect(session.getState().spool.mode).toBe('lifo')

    // In lifo each capture becomes the cursor, because it is now the newest (PLAN.md 3).
    for (const value of ['A', 'B', 'C']) watcher.change(text(value))

    expect(serveAndEcho(session, watcher, written)).toBe('C')
    expect(serveAndEcho(session, watcher, written)).toBe('B')
    expect(serveAndEcho(session, watcher, written)).toBe('A')
  })

  it('travels backward from wherever the cursor already was when the mode changed', () => {
    // A mode change moves nothing but the direction of future travel (PLAN.md 3), so a spool
    // captured in fifo and then switched serves from the cursor it already had — not from the end.
    const { session, watcher, written } = started()
    for (const value of ['A', 'B', 'C']) watcher.change(text(value))
    session.toggleMode()

    expect(serveAndEcho(session, watcher, written)).toBe('A')
    expect(serveAndEcho(session, watcher, written)).toBe('C')
    expect(serveAndEcho(session, watcher, written)).toBe('B')
  })

  it('never adds a clip, in either mode, however many times it is served', () => {
    for (const mode of ['fifo', 'lifo'] as const) {
      const { session, watcher, written } = started()
      for (const value of ['A', 'B', 'C']) watcher.change(text(value))
      if (mode === 'lifo') session.toggleMode()

      for (let i = 0; i < 20; i++) serveAndEcho(session, watcher, written)

      expect(session.getState().spool.count, `count after twenty serves in ${mode}`).toBe(3)
    }
  })

  it('moves the next-to-serve marker with the cursor', () => {
    const { session, watcher, written } = started()
    for (const value of ['A', 'B', 'C']) watcher.change(text(value))

    const nextPreview = () => {
      const { spool } = session.getState()
      return spool.clips.find((clip) => clip.id === spool.cursorClipId)?.preview
    }

    expect(nextPreview()).toBe('A')
    serveAndEcho(session, watcher, written)
    expect(nextPreview()).toBe('B')
    serveAndEcho(session, watcher, written)
    expect(nextPreview()).toBe('C')
    serveAndEcho(session, watcher, written)
    expect(nextPreview()).toBe('A')
  })

  it('leaves the served clip on the clipboard to be pasted as often as the user likes', () => {
    const { session, watcher, written } = started()
    watcher.change(text('once served'))

    session.serveNext()

    // Pasting is the user pressing Ctrl+V; the app is not involved and writes nothing further.
    expect(written).toEqual(['once served'])
    expect(session.getState().spool.count).toBe(1)
  })

  it('says nothing to paste on an empty spool, without failing', () => {
    const { session, written } = started()

    expect(() => session.serveNext()).not.toThrow()
    expect(written).toEqual([])
    expect(session.getState().notice?.message).toMatch(/nothing to paste/i)
    expect(session.getState().notice?.category).toBe('nothing_to_paste')
  })

  it('clears the nothing-to-paste notice once there is something to serve', () => {
    const { session, watcher } = started()
    session.serveNext()
    expect(session.getState().notice).not.toBeNull()

    watcher.change(text('now there is something'))
    expect(session.getState().notice).toBeNull()
  })
})

describe('toggling mode (PLAN.md 3)', () => {
  it('changes direction without moving the cursor', () => {
    const { session, watcher } = started()
    for (const value of ['A', 'B', 'C']) watcher.change(text(value))

    const before = session.getState().spool.cursorClipId
    session.toggleMode()

    expect(session.getState().spool.mode).toBe('lifo')
    expect(session.getState().spool.cursorClipId).toBe(before)
  })

  it('toggles back', () => {
    const { session } = started()
    session.toggleMode()
    session.toggleMode()
    expect(session.getState().spool.mode).toBe('fifo')
  })
})
