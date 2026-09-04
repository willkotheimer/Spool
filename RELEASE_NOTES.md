# Spool 0.1.0

A local-only clipboard manager built around **spools** — named, ordered lists of clips that you wind
on by copying and play off one at a time, or all at once, in the order you arranged them.

## There is no auto-updater, on purpose

Spool checks for updates never, because checking is a network request and Spool makes none. The
whole claim of this app is that there is no code in it that could send your clipboard anywhere, and
that claim is verified by a test that runs on every build. An updater would be the one exception,
and an exception is the same as not having the property.

So **updates are manual downloads.** When there is a new version you will have to come and get it.
That is the honest cost of the guarantee, and it is stated here rather than quietly worked around.

If you install Spool from the Microsoft Store instead, Windows performs the updates. The app still
ships no updater and still makes no network requests — the operating system does the fetching, which
is a different thing entirely.

## What it does

- Captures text you copy, into a rolling buffer of the last 50 clips.
- Serves clips back one at a time with `Win+Alt+N`, oldest first or newest first.
- Puts a whole spool on the clipboard at once with `Win+Alt+A`, joined however you choose.
- Lets you arrange clips by dragging or from the keyboard, and keep an arrangement as a new spool.
- Asks before storing anything that looks like a secret, and wipes it if you decline.
- Keeps everything in one encrypted file whose key is sealed by Windows itself.

## What it deliberately does not do

- No cloud, no account, no telemetry, no crash reporting.
- No images or files — text only, because nothing short of OCR can tell whether a screenshot is a
  picture of a password.
- Nothing is ever deleted on your behalf, apart from the default spool rolling at its cap and any
  age limit you set yourself.

## Known limits in this release

- Windows only. macOS needs an Apple Developer account and is not in this build.
- The installer is **not yet signed**, so Windows SmartScreen will warn on first run until code
  signing is in place. Nothing about the app changes when it is signed; the warning is about the
  certificate, not the contents.
