# Privacy Policy — Spool Clipboard

*Last updated: September 11, 2026*

Spool Clipboard is a clipboard manager that runs entirely on your computer. **It collects no
data, sends no data, and has no way to.**

## What the app stores, and where

When you copy text, Spool keeps a copy of it so you can paste it again later. For each clip it
stores the text itself, a short preview, the time it was copied, and the name of the program you
copied it from (for example `Code.exe`), which Windows reports and Spool shows so you can tell
clips apart.

Everything is written to a single database file on your own machine, in your user profile's
application-data folder. The database is encrypted with SQLCipher (AES-256), and the key that
opens it is sealed by Windows Data Protection (DPAPI) to your Windows account, so another user of
the same computer cannot read it. A small settings file in the same folder holds your preferences
(hotkeys, paste separator, window layout).

Nothing is stored anywhere else — not in the cloud, not on any server, not with the developer.

## What the app does not do

- **No network.** Spool contains no networking code. It does not check for updates, report crashes,
  send analytics, or contact any server. This is verified by an automated check that runs on every
  build, and the source is public so you can confirm it yourself.
- **No account.** There is nothing to sign up for or log in to.
- **No telemetry.** The developer receives no information about how, whether, or by whom the app
  is used.
- **No images or files.** Spool captures text only. Screenshots and files on the clipboard are
  ignored.

## What you control

- **Pause capture** at any time from the tray icon or the window; nothing is recorded while paused.
- **Delete any clip** individually, **clear a spool**, or **reset everything**, which deletes the
  database and its key.
- **Password managers and other apps that mark clipboard content as sensitive** (using the
  Windows `ExcludeClipboardContentFromMonitorProcessing` or `CanIncludeInClipboardHistory` signals)
  are honored: Spool asks before keeping such a clip and discards it if you decline or do not answer.
- **Uninstalling** the app removes it; the data folder can be deleted from your user profile if you
  want it gone as well.

## Updates

Installed from the Microsoft Store, updates are delivered by Windows. The app itself contains no
updater and never contacts the Store or any other service.

## Changes to this policy

If this policy changes, the new version will be published at this address with an updated date.
Since the app collects nothing, there is little that could change.

## Contact

Questions about privacy can be raised at the project's public issue tracker:
https://github.com/willkotheimer/Spool/issues
