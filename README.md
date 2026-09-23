# Quiet Feed

Quiet Feed is an experimental Chrome extension for LinkedIn. It collapses replies that match a reader's AI-writing preferences, with a **Show Reply** control on every hidden reply. It also hides posts containing “promoted”, “Videos for you”, and (by default) “Jobs recommended for you”. The jobs section can be turned back on in the popup.

This is a reading preference, not a way to prove who wrote a comment. Original posts are never sent to TypeSafe for AI analysis. Only loaded comment and reply text is checked, and the extension does not scroll, expand threads, or act on a LinkedIn account.

## Install

Download the ZIP for your computer from the [v0.4.0 release](https://github.com/boostkitio/quiet-feed/releases/tag/v0.4.0). Install [Node.js 24 or later](https://nodejs.org/en/download) and get **your own** [TypeSafe API key](https://console.typesafe.ai/keys). The key you enter is saved on your computer, so requests use your TypeSafe account and credits.

- **Windows:** Extract the Windows ZIP to a permanent folder, run **Start Quiet Feed.cmd**, then open `chrome://extensions`, enable Developer mode and choose **Load unpacked** on its `dist/extension` folder. See `QUICK-START.md` in the ZIP.
- **macOS:** Extract the Mac ZIP to a permanent folder. In Terminal run `bash start-mac.sh`; macOS Keychain asks for your key on first use. Load its `dist/extension` folder in Chrome the same way. See `MAC-QUICK-START.md` in the ZIP. The Mac Keychain, login and Chrome flow has not yet been tested on a physical Mac.

The local companion starts at Windows or Mac login after setup. The extension only works on the desktop website in a browser where it is installed; it does not work in the native LinkedIn app or Codex's in-app browser.

## Privacy and limits

The API key stays in the local companion's environment: Windows saves it in the user's environment, and macOS saves it in Keychain. The companion listens only on `127.0.0.1:43127` and requires a separate random pairing token. Neither key nor pairing token is committed or included in release ZIPs. Comment text and a small selection of examples you explicitly flagged or kept are sent to TypeSafe. Private messages and text being typed in editors are excluded. TypeSafe usage is subject to your account's credits and limits.

Quiet Feed is not affiliated with LinkedIn or TypeSafe. The AI-style judgement can make mistakes; reveal a hidden reply or use **Keep This Reply** to correct it.

## Build from source

```sh
npm ci
npm run build
# For browser tests:
npx playwright install chromium
npm run verify
```

The extension and companion are built with `npm run build` into `dist/`. Release packaging uses an explicit file allowlist. On Windows, run `powershell -File scripts/package.ps1 -Destination <folder>` for the Windows ZIP, adding `-Platform macOS` for the Mac ZIP. The Mac launcher and login service still require a real Mac to test.