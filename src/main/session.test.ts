import { describe, expect, it, vi } from 'vitest'
import type { ClipboardSnapshot } from './detect/admit'
import { Session } from './session'
import type { AppState } from '../shared/ipc'
import type { ClipboardWatcher } from './clipboard/watcher'
import { createClip } from './core/clip'
import type { Spool } from './core/types'
import type { SourceAction, SourceRules } from './detect/consent'

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
  bytes: new TextEncoder().encode(value),
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

    watcher.change({ formats: ['CF_DIB', 'CF_BITMAP'], bytes: null })
    expect(session.getState().notice?.message).toBe("Images aren't captured in this version")

    // A second screenshot says nothing new, and the first notice still stands.
    watcher.change({ formats: ['CF_DIB'], bytes: null })
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

describe('consent (PLAN.md 4)', () => {
  const secret = (value: string, sourceApp: string | null = '1Password.exe'): ClipboardSnapshot => ({
    formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
    bytes: new TextEncoder().encode(value),
    sourceApp
  })

  const heuristic = (value: string): ClipboardSnapshot => ({
    formats: ['CF_UNICODETEXT'],
    bytes: new TextEncoder().encode(value),
    sourceApp: 'Code.exe'
  })

  it('raises a Tier 1 prompt naming the application, and files nothing yet', () => {
    const { session, watcher } = started()
    watcher.change(secret('hunter2'))

    const { prompt, spool } = session.getState()
    expect(prompt?.tier).toBe(1)
    expect(prompt?.headline).toBe('1Password marked this as concealed. Keep it in this spool?')
    expect(spool.count).toBe(0)
  })

  it('raises a softer Tier 2 prompt for something that merely looks like a secret', () => {
    const { session, watcher } = started()
    watcher.change(heuristic('AKIAIOSFODNN7EXAMPLE'))

    const { prompt } = session.getState()
    expect(prompt?.tier).toBe(2)
    expect(prompt?.headline).toBe('This looks like a secret. Keep it in this spool?')
    expect(prompt?.detail).toMatch(/AWS/)
  })

  it('never shows the content of the clip it is asking about', () => {
    const { session, watcher } = started()
    watcher.change(secret('correct-horse-battery-staple'))

    expect(JSON.stringify(session.getState())).not.toContain('correct-horse-battery-staple')
  })

  it('Keep places it in the spool, marked as having been flagged', () => {
    const { session, watcher } = started()
    watcher.change(secret('hunter2'))
    session.answerConsent('keep_once')

    const { spool, prompt } = session.getState()
    expect(prompt).toBeNull()
    expect(spool.count).toBe(1)
    expect(spool.clips[0].preview).toBe('hunter2')
  })

  it('Skip removes the clip and it never appears in the list', () => {
    const { session, watcher } = started()
    watcher.change(secret('hunter2'))
    session.answerConsent('skip')

    const { spool, prompt } = session.getState()
    expect(prompt).toBeNull()
    expect(spool.count).toBe(0)
    expect(JSON.stringify(spool)).not.toContain('hunter2')
  })

  it('wipes the buffer on Skip, so the bytes that held the secret are zeroed', () => {
    const { session, watcher } = started()
    const snapshot = secret('hunter2')
    watcher.change(snapshot)

    session.answerConsent('skip')

    expect(snapshot.bytes?.every((byte) => byte === 0)).toBe(true)
  })

  it('wipes the buffer on Keep too, once the clip is safely in the spool', () => {
    const { session, watcher } = started()
    const snapshot = secret('hunter2')
    watcher.change(snapshot)

    session.answerConsent('keep_once')

    expect(session.getState().spool.clips[0].preview).toBe('hunter2')
    expect(snapshot.bytes?.every((byte) => byte === 0)).toBe(true)
  })

  it('remembers "always keep" for that application and stops asking', () => {
    const { session, watcher } = started()
    watcher.change(secret('first'))
    session.answerConsent('always_keep')

    watcher.change(secret('second'))

    expect(session.getState().prompt).toBeNull()
    expect(session.getState().spool.clips.map((clip) => clip.preview)).toEqual(['first', 'second'])
  })

  it('remembers "always skip" for that application and files nothing from it', () => {
    const { session, watcher } = started()
    watcher.change(secret('first'))
    session.answerConsent('always_skip')

    watcher.change(secret('second'))

    expect(session.getState().prompt).toBeNull()
    expect(session.getState().spool.count).toBe(0)
  })

  it('keeps rules per application, not globally', () => {
    const { session, watcher } = started()
    watcher.change(secret('from the manager'))
    session.answerConsent('always_skip')

    watcher.change(heuristic('AKIAIOSFODNN7EXAMPLE'))

    // A different application still gets asked about.
    expect(session.getState().prompt?.tier).toBe(2)
  })

  it('an ordinary copy is never asked about', () => {
    const { session, watcher } = started()
    watcher.change(text('just some notes for later'))

    expect(session.getState().prompt).toBeNull()
    expect(session.getState().spool.count).toBe(1)
  })
})

describe('the consent timeout (PLAN.md 4)', () => {
  const secret = (value: string): ClipboardSnapshot => ({
    formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
    bytes: new TextEncoder().encode(value),
    sourceApp: '1Password.exe'
  })

  it('behaves as Skip after thirty seconds, because nobody is at the keyboard', () => {
    vi.useFakeTimers()
    try {
      const { session, watcher } = started()
      const snapshot = secret('hunter2')
      watcher.change(snapshot)

      expect(session.getState().prompt).not.toBeNull()

      vi.advanceTimersByTime(29_000)
      expect(session.getState().prompt).not.toBeNull()

      vi.advanceTimersByTime(1_500)
      expect(session.getState().prompt).toBeNull()
      expect(session.getState().spool.count).toBe(0)
      expect(snapshot.bytes?.every((byte) => byte === 0)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire after the user has answered', () => {
    vi.useFakeTimers()
    try {
      const { session, watcher } = started()
      watcher.change(secret('hunter2'))
      session.answerConsent('keep_once')

      vi.advanceTimersByTime(60_000)

      expect(session.getState().spool.count).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a newer copy supersedes an unanswered prompt, wiping the older one', () => {
    const { session, watcher } = started()
    const first = secret('older secret')
    watcher.change(first)
    watcher.change(secret('newer secret'))

    expect(first.bytes?.every((byte) => byte === 0)).toBe(true)
    expect(session.getState().prompt).not.toBeNull()
    expect(session.getState().spool.count).toBe(0)
  })
})

describe('persistence (PLAN.md 11, M6)', () => {
  /** An in-memory stand-in for the encrypted store, recording what was written. */
  function fakeStore(initial: { spools?: Spool[]; rules?: Map<string, SourceAction> } = {}) {
    const saved: { spools: Spool[]; deleted: string[]; rules: Map<string, SourceAction>[] } = {
      spools: [],
      deleted: [],
      rules: []
    }
    return {
      saved,
      store: {
        path: 'C:/Users/someone/AppData/Roaming/Spool/spool.db',
        saveSpool: (spool: Spool) => {
          saved.spools.push(spool)
        },
        deleteSpool: (spoolId: string) => {
          saved.deleted.push(spoolId)
        },
        saveSourceRules: (rules: SourceRules) => {
          saved.rules.push(new Map(rules))
        },
        loadSpools: () => initial.spools ?? [],
        loadSourceRules: () => initial.rules ?? new Map<string, SourceAction>(),
        close: () => {}
      }
    }
  }

  it('writes the spool through on capture, and again when the cursor moves', () => {
    const { session, watcher } = started()
    const { store, saved } = fakeStore()
    session.attachStore(store)

    watcher.change(text('one'))
    watcher.change(text('two'))
    session.serveNext()

    expect(saved.spools.length).toBeGreaterThanOrEqual(3)
    expect(saved.spools.at(-1)?.clips.map((clip) => clip.content)).toEqual(['one', 'two'])
    // The cursor advanced on serve, and that is what has to survive a restart.
    expect(saved.spools.at(-1)?.cursorClipId).toBe(saved.spools.at(-1)?.clips[1].id)
  })

  it('does not write when nothing about the spool changed', () => {
    const { session, watcher } = started()
    const { store, saved } = fakeStore()
    session.attachStore(store)

    watcher.change(text('one'))
    const afterCapture = saved.spools.length

    // A decline changes a notice, not the spool.
    watcher.change({ formats: ['CF_DIB'], bytes: null })

    expect(saved.spools.length).toBe(afterCapture)
  })

  it('restores clips, cursor, and mode from the store', () => {
    const restored: Spool = {
      id: 'default',
      name: 'Default spool',
      kind: 'default',
      mode: 'lifo',
      clips: [
        createClip({ id: 'a', content: 'first', capturedAt: '2026-08-22T17:00:00.000Z' }),
        createClip({ id: 'b', content: 'second', capturedAt: '2026-08-22T17:00:01.000Z' })
      ],
      cursorClipId: 'b',
      retentionHours: null
    }

    const { session } = started()
    session.attachStore(fakeStore({ spools: [restored] }).store)

    const state = session.getState()
    expect(state.spool.clips.map((clip) => clip.preview)).toEqual(['first', 'second'])
    expect(state.spool.cursorClipId).toBe('b')
    expect(state.spool.mode).toBe('lifo')
    expect(state.storage.available).toBe(true)
    expect(state.storage.path).toMatch(/spool\.db$/)
  })

  it('restores source rules, so a standing answer survives a restart', () => {
    const { session, watcher } = started()
    session.attachStore(
      fakeStore({ rules: new Map<string, SourceAction>([['1Password.exe', 'always_skip']]) }).store
    )

    watcher.change({
      formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
      bytes: new TextEncoder().encode('a secret'),
      sourceApp: '1Password.exe'
    })

    expect(session.getState().prompt).toBeNull()
    expect(session.getState().spool.count).toBe(0)
  })

  it('writes a new source rule through as soon as it is made', () => {
    const { session, watcher } = started()
    const { store, saved } = fakeStore()
    session.attachStore(store)

    watcher.change({
      formats: ['CF_UNICODETEXT', 'ExcludeClipboardContentFromMonitorProcessing'],
      bytes: new TextEncoder().encode('a secret'),
      sourceApp: '1Password.exe'
    })
    session.answerConsent('always_skip')

    expect(saved.rules.at(-1)?.get('1Password.exe')).toBe('always_skip')
  })

  it('says why nothing is being stored, and whether there is a way out', () => {
    const { session } = started()
    session.reportStorageFailure({
      reason: 'the sealed key could not be opened',
      canStartFresh: true
    })

    const { storage } = session.getState()
    expect(storage.available).toBe(false)
    expect(storage.reason).toBe('the sealed key could not be opened')
    expect(storage.canStartFresh).toBe(true)
  })

  it('keeps working with no store at all', () => {
    const { session, watcher } = started()

    watcher.change(text('captured with nowhere to put it'))

    expect(session.getState().spool.count).toBe(1)
    expect(session.getState().storage.available).toBe(false)
  })
})

describe('pasting the whole spool (PLAN.md 3)', () => {
  const fill = (watcher: ReturnType<typeof fakeWatcher>, values: string[]) => {
    for (const value of values) watcher.change(text(value))
  }

  it('lands five clips as five separated lines in one write', () => {
    const { session, watcher, written } = started()
    fill(watcher, ['one', 'two', 'three', 'four', 'five'])

    session.pasteWholeSpool()

    expect(written).toEqual(['one\ntwo\nthree\nfour\nfive'])
  })

  it('reverses the emitted order in lifo', () => {
    const { session, watcher, written } = started()
    session.toggleMode()
    fill(watcher, ['one', 'two', 'three'])

    session.pasteWholeSpool()

    expect(written).toEqual(['three\ntwo\none'])
  })

  it('starts at the beginning regardless of the cursor, and leaves the cursor alone', () => {
    const { session, watcher, written } = started()
    fill(watcher, ['one', 'two', 'three'])
    session.serveNext()
    const cursorAfterServe = session.getState().spool.cursorClipId

    session.pasteWholeSpool()

    expect(written.at(-1)).toBe('one\ntwo\nthree')
    expect(session.getState().spool.cursorClipId).toBe(cursorAfterServe)
  })

  it('joins with the chosen separator', () => {
    const { session, watcher, written } = started()
    fill(watcher, ['a', 'b', 'c'])

    session.setSeparator('tab')
    session.pasteWholeSpool()

    expect(written.at(-1)).toBe('a\tb\tc')
  })

  it('does not add a clip, however many times it is run', () => {
    const { session, watcher, written } = started()
    fill(watcher, ['one', 'two', 'three'])

    for (let i = 0; i < 10; i++) {
      session.pasteWholeSpool()
      // The joined text comes back through the watcher, exactly as the OS would deliver it.
      watcher.change(text(written[written.length - 1]))
    }

    expect(session.getState().spool.count).toBe(3)
  })

  it('says nothing to paste on an empty spool', () => {
    const { session, written } = started()

    session.pasteWholeSpool()

    expect(written).toEqual([])
    expect(session.getState().notice?.message).toMatch(/nothing to paste/i)
  })

  it('asks first when the result is large enough to be felt system-wide', () => {
    const { session, watcher, written } = started()
    // Eleven clips just under the 1 MiB per-clip cap: each is admissible on its own, and the
    // joined result is over the 10 MiB the clipboard is worth confirming for.
    for (let i = 0; i < 11; i++) {
      watcher.change(text(String.fromCharCode(97 + i).repeat(1024 * 1024 - 1)))
    }
    expect(session.getState().spool.count).toBe(11)

    session.pasteWholeSpool()

    expect(written).toEqual([])
    expect(session.getState().pendingJoin?.clips).toBe(11)

    session.pasteWholeSpool(true)
    expect(written).toHaveLength(1)
    expect(session.getState().pendingJoin).toBeNull()
  })

  it('lets the confirmation be declined without writing anything', () => {
    const { session, watcher, written } = started()
    for (let i = 0; i < 11; i++) {
      watcher.change(text(String.fromCharCode(97 + i).repeat(1024 * 1024 - 1)))
    }

    session.pasteWholeSpool()
    session.cancelWholeSpoolPaste()

    expect(written).toEqual([])
    expect(session.getState().pendingJoin).toBeNull()
  })
})

describe('arranging (PLAN.md 11, M7)', () => {
  it('applies an arrangement to the active spool', () => {
    const { session, watcher } = started()
    for (const value of ['a', 'b', 'c']) watcher.change(text(value))
    const ids = session.getState().spool.clips.map((clip) => clip.id)

    session.saveArrangement([ids[2], ids[0], ids[1]])

    expect(session.getState().spool.clips.map((clip) => clip.preview)).toEqual(['c', 'a', 'b'])
  })

  it('leaves the cursor on the clip it pointed at before the drag', () => {
    const { session, watcher } = started()
    for (const value of ['a', 'b', 'c']) watcher.change(text(value))
    const ids = session.getState().spool.clips.map((clip) => clip.id)
    const before = session.getState().spool.cursorClipId

    session.saveArrangement([ids[2], ids[1], ids[0]])

    expect(session.getState().spool.cursorClipId).toBe(before)
    // Its index moved; its identity did not.
    expect(session.getState().spool.clips[2].id).toBe(before)
  })

  it('ignores an arrangement that is not exactly the clips there are', () => {
    const { session, watcher } = started()
    for (const value of ['a', 'b']) watcher.change(text(value))
    const ids = session.getState().spool.clips.map((clip) => clip.id)

    session.saveArrangement([ids[0]])
    session.saveArrangement([ids[0], ids[1], 'invented'])

    expect(session.getState().spool.clips.map((clip) => clip.preview)).toEqual(['a', 'b'])
  })

  it('keeps an arrangement as a new spool, leaving the original untouched', () => {
    const { session, watcher } = started()
    const { store, saved } = (() => {
      const spools: Spool[] = []
      return {
        saved: spools,
        store: {
          path: 'x',
          saveSpool: (spool: Spool) => {
            spools.push(spool)
          },
          deleteSpool: () => {},
          saveSourceRules: () => {},
          loadSpools: () => [],
          loadSourceRules: () => new Map<string, SourceAction>(),
          close: () => {}
        }
      }
    })()
    session.attachStore(store)
    for (const value of ['a', 'b', 'c']) watcher.change(text(value))
    const ids = session.getState().spool.clips.map((clip) => clip.id)

    session.createSpoolFromArrangement('Reversed', [ids[2], ids[1], ids[0]])

    // The original keeps its order.
    expect(session.getState().spool.clips.map((clip) => clip.preview)).toEqual(['a', 'b', 'c'])

    // And the new one exists, with the arrangement.
    const created = saved.find((spool) => spool.name === 'Reversed')
    expect(created?.clips.map((clip) => clip.preview)).toEqual(['c', 'b', 'a'])
    expect(created?.kind).toBe('saved')
    expect(session.getState().spools.map((s) => s.name)).toContain('Reversed')
  })

  it('gives a nameless new spool a name rather than an empty one', () => {
    const { session, watcher } = started()
    for (const value of ['a']) watcher.change(text(value))
    const ids = session.getState().spool.clips.map((clip) => clip.id)

    session.createSpoolFromArrangement('   ', ids)

    expect(session.getState().spools.map((s) => s.name)).toContain('New spool')
  })
})

describe('managing spools and clips (PLAN.md 11, M8)', () => {
  const fill = (watcher: ReturnType<typeof fakeWatcher>, values: string[]) => {
    for (const value of values) watcher.change(text(value))
  }
  const names = (session: Session) => session.getState().spools.map((s) => s.name)
  const active = (session: Session) => session.getState().spools.find((s) => s.isActive)

  it('creates a spool and makes it the one that captures', () => {
    const { session, watcher } = started()
    fill(watcher, ['in the default'])

    session.createNamedSpool('Q3 figures')

    expect(active(session)?.name).toBe('Q3 figures')
    fill(watcher, ['in the new one'])
    expect(session.getState().spool.clips.map((c) => c.preview)).toEqual(['in the new one'])
  })

  it('switches back and forth without losing either spool', () => {
    const { session, watcher } = started()
    fill(watcher, ['default clip'])
    const defaultId = session.getState().spools.find((s) => s.isDefault)?.id ?? ''

    const createdId = session.createNamedSpool('Second') ?? ''
    fill(watcher, ['second clip'])

    session.setActiveSpool(defaultId)
    expect(session.getState().spool.clips.map((c) => c.preview)).toEqual(['default clip'])

    session.setActiveSpool(createdId)
    expect(session.getState().spool.clips.map((c) => c.preview)).toEqual(['second clip'])
  })

  it('renames a spool, whether it is the active one or not', () => {
    const { session } = started()
    const createdId = session.createNamedSpool('Typo') ?? ''
    session.renameSpool(createdId, 'Fixed')
    expect(names(session)).toContain('Fixed')

    const defaultId = session.getState().spools.find((s) => s.isDefault)?.id ?? ''
    session.renameSpool(defaultId, 'Inbox')
    expect(names(session)).toContain('Inbox')
  })

  it('gives a renamed spool a name even when handed only spaces', () => {
    const { session } = started()
    const createdId = session.createNamedSpool('Something') ?? ''

    session.renameSpool(createdId, '   ')

    expect(names(session)).toContain('New spool')
  })

  it('deletes a saved spool and falls back to the default one', () => {
    const { session, watcher } = started()
    fill(watcher, ['default clip'])
    const createdId = session.createNamedSpool('Temporary') ?? ''
    fill(watcher, ['doomed clip'])

    session.deleteSpool(createdId)

    expect(names(session)).not.toContain('Temporary')
    expect(active(session)?.isDefault).toBe(true)
    expect(session.getState().spool.clips.map((c) => c.preview)).toEqual(['default clip'])
  })

  it('refuses to delete the default spool, which has to exist to catch a copy', () => {
    const { session } = started()
    const defaultId = session.getState().spools.find((s) => s.isDefault)?.id ?? ''

    session.deleteSpool(defaultId)

    expect(session.getState().spools.some((s) => s.isDefault)).toBe(true)
    // And the window is told, so it can offer Clear instead of Delete.
    expect(session.getState().spools.find((s) => s.isDefault)?.isDefault).toBe(true)
  })

  it('clears a spool without removing it', () => {
    const { session, watcher } = started()
    fill(watcher, ['one', 'two'])
    const defaultId = session.getState().spools.find((s) => s.isDefault)?.id ?? ''

    session.clearSpool(defaultId)

    expect(session.getState().spool.count).toBe(0)
    expect(session.getState().spool.cursorClipId).toBeNull()
    expect(names(session)).toContain('Default spool')
  })

  it('captures again immediately after a clear, even the same text', () => {
    const { session, watcher } = started()
    fill(watcher, ['same text'])
    const defaultId = session.getState().spools.find((s) => s.isDefault)?.id ?? ''

    session.clearSpool(defaultId)
    fill(watcher, ['same text'])

    expect(session.getState().spool.count).toBe(1)
  })

  it('deletes one clip, moving the cursor per the mode direction', () => {
    const { session, watcher } = started()
    fill(watcher, ['a', 'b', 'c'])
    const ids = session.getState().spool.clips.map((clip) => clip.id)
    expect(session.getState().spool.cursorClipId).toBe(ids[0])

    session.deleteClip(ids[0])

    expect(session.getState().spool.clips.map((c) => c.preview)).toEqual(['b', 'c'])
    expect(session.getState().spool.cursorClipId).toBe(ids[1])
  })

  it('deleting a clip that is not the cursor leaves the cursor alone', () => {
    const { session, watcher } = started()
    fill(watcher, ['a', 'b', 'c'])
    const ids = session.getState().spool.clips.map((clip) => clip.id)

    session.deleteClip(ids[2])

    expect(session.getState().spool.cursorClipId).toBe(ids[0])
  })

  it('writes every one of these through to the store', () => {
    const { session, watcher } = started()
    const spools: Spool[] = []
    const deleted: string[] = []
    session.attachStore({
      path: 'x',
      saveSpool: (spool) => {
        spools.push(spool)
      },
      deleteSpool: (id) => {
        deleted.push(id)
      },
      saveSourceRules: () => {},
      loadSpools: () => [],
      loadSourceRules: () => new Map<string, SourceAction>(),
      close: () => {}
    })

    fill(watcher, ['a'])
    const createdId = session.createNamedSpool('Kept') ?? ''
    session.renameSpool(createdId, 'Renamed')
    const doomedId = session.createNamedSpool('Doomed') ?? ''
    session.deleteSpool(doomedId)

    expect(spools.some((spool) => spool.name === 'Renamed')).toBe(true)
    expect(deleted).toContain(doomedId)
  })
})
