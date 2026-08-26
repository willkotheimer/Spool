# Spool

A local-only clipboard manager built around **spools** — named, ordered lists of clips that you wind
on by copying and play off one at a time, or all at once, in the order you arranged them.

Nothing it captures can leave the machine, and that property is enforced by the build rather than by
good intentions. See [PLAN.md](PLAN.md) for the specification this is built against.

Electron + React + TypeScript. Windows first.

## Development

```sh
npm install
npm run dev        # launch the app with hot reload
npm test           # Vitest over the pure modules
npm run lint       # ESLint
npm run check:network  # the zero-network gate — fails the build on any way out
npm run typecheck  # tsc over main/preload and renderer
npm run build      # bundle main, preload, and renderer into out/
```

Summon the compact window with `Win + Alt + V` or `Win + Alt + C`. Closing the window hides it to the
tray; quitting is explicit from the tray menu.

## The zero-network guarantee

Spool has no network features, and that is checked rather than promised. `npm run check:network` fails
the build on a networking API anywhere in `src/`, on a banned dependency, and on any change to the
production dependency tree that is not reflected in `deps-snapshot.json`. At runtime the main process
revokes `fetch`, `http`, `https`, `net`, and `dgram` before anything else runs, the session cancels
every request that is not reading local bytes, and the renderer ships a CSP with no remote origin.

There is deliberately no auto-updater — an updater is network code, and it would void all of the
above. Updates are manual downloads.

## Building

The clipboard listener is a native addon, so a first install compiles it. On Windows that needs
Visual Studio Build Tools with the C++ workload and a Windows SDK; `npm install` runs `node-gyp`
for you once they are there. Keep the checkout path short — building native modules from a deeply
nested directory fails on Windows' 260-character path limit.

## Status

M10 — the capacity advisor: when the store approaches its 512 MB budget, Spool offers a list of
spools you have finished with — oldest used first, never the default or the one you are working in —
with sizes, a running total of what deleting them frees, and a Not now that means it. Nothing is ever
deleted that you did not check. The same figures live permanently in Settings under Storage.

Underneath, M9 — retention and control: an optional per-spool age limit, a settings panel listing every standing
answer with a way to revoke it, a configurable consent timeout, the caps shown read-only, and
**Reset everything** — a failsafe that deletes the store, the sealed key, and the preferences
without reading any of them, then restarts. Underneath are M8's spool management, M7's arranging and
whole-spool paste, M6's encrypted store, M5's consent prompts, M4's serve, M3's capture, M2's spool
core, M1's zero-network gate, and M0's tray icon and summon hotkey.
