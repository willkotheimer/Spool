import { useEffect, useReducer } from 'react'
import type { AppState } from '../../shared/ipc'

/**
 * Client state is a `useReducer` plus IPC events (PLAN.md 6). There is exactly one action, because
 * the main process is the only thing that decides anything — the renderer renders.
 */
type Action = { type: 'state'; state: AppState }

const initialState: AppState = {
  spool: { name: 'Default spool', mode: 'fifo', clips: [], cursorClipId: null, count: 0, cap: 50 },
  notice: null,
  capture: { available: false, reason: null },
  prompt: null,
  privacy: {
    heuristics: [],
    consentTimeoutSeconds: 30,
    dataFilePath: null,
    sourceRules: [],
    limits: {
      defaultSpoolClips: 50,
      savedSpoolClips: 100,
      savedSpools: 50,
      clipBytes: 1024 * 1024,
      storeBytes: 512 * 1024 * 1024
    }
  },
  storage: { available: false, reason: null, canStartFresh: false, path: null },
  separator: 'newline',
  spools: [],
  pendingJoin: null,
  capacity: {
    measure: 'bytes',
    used: 0,
    cap: 512 * 1024 * 1024,
    ratio: 0,
    description: '',
    advising: false,
    gated: false,
    paused: false,
    overFloorBytes: 0,
    prompting: false,
    candidates: []
  }
}

function reducer(_current: AppState, action: Action): AppState {
  switch (action.type) {
    case 'state':
      return action.state
  }
}

export function useAppState(): AppState {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let cancelled = false

    void window.spool.getState().then((current) => {
      if (!cancelled) dispatch({ type: 'state', state: current })
    })

    const unsubscribe = window.spool.onState((next) => dispatch({ type: 'state', state: next }))

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
