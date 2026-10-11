# Quiet Feed

A free Chrome and Edge extension for a calmer LinkedIn feed. It hides suggested posts, old posts, posts shown only because someone else liked them, and anything containing words you mute. Every hidden post keeps a **Show Post** button, and nothing leaves your browser.

## Install

**[Download Quiet Feed](https://github.com/boostkitio/quiet-feed/releases/latest/download/Quiet-Feed-Extension.zip)**, then:

1. Extract the ZIP into a folder you will keep.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose that folder.
3. Refresh LinkedIn. A **Quiet Feed hides:** row appears at the top of your feed.

More detail is in [docs/INSTALL.md](docs/INSTALL.md). It works on Windows, Mac and Linux and needs nothing else installed.

## What it hides

Each rule has its own switch. Hover over any item in the feed row for a short explanation.

| Rule | Where | Default |
|---|---|---|
| **Suggested** posts from people and pages you do not follow | Feed row | On |
| **Liked by others**: posts shown only because someone else liked, commented or followed | Feed row | On |
| **Older than** 7, 14, 30 or 90 days | Feed row | On, 7 days |
| **Engagement bait**: a long run of short one-line sentences ending in a question | Feed row | Off |
| **Jobs recommended for you** and **Videos for you** | Popup | On |
| **Mute Words**: any words or phrases you list, matched as whole words | Popup | Empty |
| **LinkedIn News** and **Today's puzzles** panels | Popup | Off |

The engagement-bait rule judges layout only and will sometimes catch a genuine post, which is why it is off until you ask for it. Reposts, posts with no date, and a post or profile you open directly are left alone.

## Optional: hide AI-style replies

Paste your own TypeSafe key into the popup under **AI Reply Filter** to also collapse comments and replies that read as AI-written. This uses Jev from [TypeSafe](https://console.typesafe.ai/keys), which charges your account for usage.

- Only the text of loaded comments and replies is sent. Original posts, author names, private messages and anything you are typing are never sent.
- A likely AI reply collapses to **Likely AI Reply / Show Reply**. Its author and any nested discussion stay visible.
- Hover over a comment to **Flag As Potentially AI**, or use **Keep This Reply** to correct the filter. Your choices shape later checks and are stored only on your computer. **Reset Learning** clears them.
- Text alone cannot prove who wrote something. These are fallible judgements of style, so every reply can be revealed.

## Privacy and limits

- The post rules run entirely in your browser and make no network requests.
- Quiet Feed never posts, likes, follows, scrolls, expands comments or uses LinkedIn's private interfaces. It only changes what your own browser displays.
- With the AI reply filter on, reply text goes to `https://api.typesafe.ai` under your own account. Your key is kept in the browser's extension storage, where web pages cannot read it, and is never shown again after you save it.
- Reply checks are limited to 100 per browser session and 500 per day. **Reset Session & Retry** allows more.
- It works in Chromium browsers on desktop, not in Firefox, Safari or the mobile apps, and it needs LinkedIn set to English because it reads the labels LinkedIn prints.
- LinkedIn changes its pages from time to time. If a rule stops matching, posts simply show as normal.

After updating, click **Reload** on Quiet Feed at `chrome://extensions` and then refresh LinkedIn. A page left open across an update will ask you to refresh.

## Companion packages

Most people do not need these. They run a small local program that keeps your TypeSafe key outside the browser and starts when you sign in. Both need Node.js 24 or later.

- **Windows:** `Quiet-Feed-<version>.zip`, with [docs/QUICK-START.md](docs/QUICK-START.md). The key is saved in your Windows user environment.
- **Mac:** `Quiet-Feed-macOS-<version>.zip`, with [docs/MAC-QUICK-START.md](docs/MAC-QUICK-START.md). The key is saved in the macOS Keychain. These scripts have not yet been run on a physical Mac.

The companion listens only on `127.0.0.1:43127`, checks the request's host and origin, and requires a random pairing token that its launcher shares with the extension through a private local file. That file is never included in a release.

## Development

```powershell
npm install
npx playwright install chromium
npm run verify
```

`npm run verify` runs the type check, Node tests, a production build and headless Chromium tests against synthetic pages. No test contacts LinkedIn, TypeSafe or a companion running on your computer. `scripts/package.ps1 -Destination <folder> -Platform extension` builds the download from an explicit list of files; `windows` and `macOS` build the companion packages.

The source is TypeScript compiled by esbuild, with no runtime dependencies.

Quiet Feed is an early release and is not affiliated with LinkedIn or TypeSafe. References: [TypeSafe API](https://docs.typesafe.ai/api), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
