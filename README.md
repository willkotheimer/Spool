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
npm run typecheck  # tsc over main/preload and renderer
npm run build      # bundle main, preload, and renderer into out/
```

Summon the compact window with `Win + Alt + V` or `Win + Alt + C`. Closing the window hides it to the
tray; quitting is explicit from the tray menu.

## Status

M0 — the scaffold: tray icon, summon hotkey, and an empty compact window. No clipboard capture and no
storage yet; those arrive at M3 and M6.
