# Submitting Spool to the Microsoft Store

Everything here is about delivery. The application inside the MSIX is byte-for-byte the one in the
NSIS installer; only packaging, identity, and update mechanism differ.

## Why the Store build keeps the zero-network guarantee

Spool ships no updater, because an updater is network code and would void the claim the whole app is
built on (see `PLAN.md` §5e). The Store does not change that: **Windows** performs the update, the
app still contains no code that reaches the network, and `npm run check:network` gates every build
either way. This is the one distribution channel that gives users automatic updates without Spool
having to break its own promise.

## What has to come from Partner Center

Reserve the app name first; the reservation produces the identity values. Fill these into the `appx`
block of `electron-builder.yml` — they cannot be guessed, and a mismatch makes the package
unsubmittable:

| Field | Where it comes from |
|---|---|
| `identityName` | Partner Center → Product identity → **Package/Identity/Name** |
| `publisher` | Partner Center → Product identity → **Package/Identity/Publisher** (the `CN=…` string) |
| `publisherDisplayName` | Partner Center → Product identity → **Package/Properties/PublisherDisplayName** |

Then `npm run package:store` produces `release/Spool <version>.appx` for upload.

**The Store signs the package**, which is why electron-builder reports "AppX is not signed — Windows
Store only build" and why the unsigned NSIS installer's SmartScreen problem does not apply here. The
Azure Trusted Signing account is needed only for the direct-download installer.

## Findings from building it

**Tile assets had to be authored.** electron-builder ships stock placeholder tiles when
`build/appx/` is empty, and those placeholders are the **Electron logo** — the package built cleanly
and would have gone to the Store carrying someone else's mark. The six assets in `build/appx/` are
generated from the same geometry and palette as `build/icon.ico` so the tiles, the installer icon and
the tray icon are one design. Anything dropped in that directory overrides them.

**arm64 does not build on a stock x64 toolchain.** `electron-builder --win appx --arm64` fails in
`node-gyp` with `MSB8020: The build tools for v143 (Platform Toolset = 'v143') cannot be found`,
because both native modules must be compiled for arm64 and the ARM64 compilers are a separate
component: install **MSVC v143 — VS 2022 C++ ARM64/ARM64EC build tools** in the Visual Studio Build
Tools installer. This is optional — Windows on ARM runs x64 packages under emulation — so x64-only
is a legitimate first submission, at some cost in performance and battery on those machines.

**The manifest is right for a desktop app with native code.** It declares the `runFullTrust`
restricted capability and `EntryPoint="Windows.FullTrustApplication"`, and both `.node` binaries —
the clipboard addon and SQLCipher — are present under `app.asar.unpacked`. Without full trust the
clipboard listener could not run at all.

## Still to verify, and why it needs an elevated machine

Installing any MSIX requires either Developer Mode (to register a loose layout) or a signing
certificate trusted in **LocalMachine\TrustedPeople** (to install a signed package). Both need
administrator rights, so these two questions are open until that is available:

1. **The clipboard listener under package identity.** `AddClipboardFormatListener` should be
   unaffected by full-trust packaging, but it has never been observed running from inside an MSIX.
2. **`safeStorage` and the user-data path.** Packaged apps can have `%APPDATA%` redirected into the
   package's own writable store. Spool's key is sealed by DPAPI through a key kept in `Local State`
   *inside the user-data directory*, so if that directory moves, the existing key must still open the
   existing database — the same invariant the NSIS upgrade test proved for v1 → v4.
