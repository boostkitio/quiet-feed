# Quiet Feed

A free Chrome and Edge extension for a calmer LinkedIn feed. It hides promoted, suggested and old posts, posts shown only because someone else reacted, and anything containing words you mute. Every hidden post keeps a **Show Post** button, and nothing leaves your browser.

## Install

Download **Quiet-Feed-Extension-0.7.0.zip** from the [releases page](https://github.com/boostkitio/quiet-feed/releases) and follow the three steps in [docs/INSTALL.md](docs/INSTALL.md). It works on Windows, Mac and Linux and needs nothing else installed.

Optionally, paste your own TypeSafe key into the popup to also collapse AI-style comments and replies. The Windows and Mac companion packages described further down do the same job with the key kept outside the browser, plus automatic startup; most people will not need them.

## What Is New In 0.7.0

- **Suggested** posts and posts shown for **someone else's activity** (for example "Name celebrates this" or "Name follows this page") collapse by default. Both are switches in the feed row.
- **Engagement bait**, off by default, collapses posts laid out as a long run of short, double-spaced one-liners ending in a question or a call to respond. It judges layout only and will sometimes catch a genuine post.
- **Mute Words** in the popup collapses feed posts containing any word or phrase you list. Matching is by whole word, so `webinar` does not match `webinars`.
- **Hide News & Puzzles** in the popup removes the LinkedIn News and Today's puzzles panels from the right-hand column.
- The extension now works on its own. Post filters need no companion, and the popup no longer treats a missing companion as an error.
- **AI Reply Filter** in the popup accepts your own TypeSafe key. The key is stored only in the browser's extension storage, is sent only to TypeSafe, and is never shown again or exposed to web pages. Feedback you save in this mode is kept in the browser too.

## History

Quiet Feed began as a local extension that collapses likely AI-written LinkedIn **comments and replies**, plus posts containing **promoted**. Version 0.2.0 moves AI analysis away from original posts and removes the threshold slider, label mode and detailed result boxes.

Version 0.2.1 also removes the **Videos for you** recommendation section as it loads. This is a local title/module rule, with no TypeSafe calls. The main pause switch restores it. Ordinary posts/comments quoting that title and neighbouring feed cards are preserved.

Version 0.2.2 fixes stale pairing: the Windows launcher supplies a private local connection file, and the extension verifies that code with the loopback companion before saving it. It reconnects on startup or after a pairing rejection. Missing/rejected pairing no longer consumes the request allowance, and connection failures are shown prominently.

## How Feedback Works

Version 0.6.0 adds a filter row on the feed itself, directly beneath LinkedIn's **Sort by** control: **Quiet Feed hides: Contains “promoted” / Older than [7, 14, 30 or 90 days]**. Tick or untick either rule and pick the age without opening the popup. Choices apply immediately, persist, and stay in step with the popup's **Hide Older Posts** switch. The row only responds to real clicks and key presses, so a web page cannot change it by script. Pausing Quiet Feed hides the row. Version 0.6.1 presents it as a left-aligned white box, applies each choice instantly, and shows a message if a choice could not be saved.

Version 0.5.0 adds **Hide Older Posts** in the popup, on by default. On the feed, a post whose own date stamp is a week or more old collapses to **Older than 7 days / Show Post**. The rule reads the date LinkedIn prints on the card (for example `3d`, `1w` or `Oct 1`) and compares it with today's date, locally and without a TypeSafe request. A repost made this week stays, undated cards stay, and posts opened directly or on a profile are left alone. Switching the toggle off restores those posts immediately and the choice persists.

Version 0.3.2 adds **Hide Recommended Jobs** in the popup. It defaults to on for this setup. Switching it off restores the **Jobs recommended for you** feed section immediately, without changing AI reply, promoted-post or video filtering. The choice persists across browser restarts. The main pause switch still restores all filtered content. Job recommendations are matched locally by their module title; no TypeSafe request is needed, and ordinary post/comment text mentioning jobs is preserved.

Version 0.3.0 adds **Flag As Potentially AI**, **Keep This Reply** and **Your Feedback → Reset Learning**. Flags and corrections personalise later checks; they are not verified AI/human labels and do not fine-tune TypeSafe's underlying model.

- Hover over a comment (or use keyboard focus) for the optional **Flag As Potentially AI** control, including short comments. A flag saves that text locally and hides it immediately.
- **Keep This Reply** reverses a flag or corrects an automatic result. The same text stays visible on future visits, even if a model would hide it. Choices apply to text, not author identities.
- The companion remembers up to 200 distinct texts in `%LOCALAPPDATA%\QuietFeed\feedback.json`. Corrections replace earlier votes. Oldest entries are removed at the limit. Reset Learning clears these examples and choices without removing your key or pairing.
- Future checks include up to three recent flagged examples and three kept examples, each capped at 600 characters. TypeSafe judges resemblance to both sets. These examples are sent to TypeSafe again as context, increasing input-token usage. Clicking a feedback button itself makes no TypeSafe call.
- Exact choices take precedence. For unseen replies, a keep-style signal >= 0.70 preserves the reply; otherwise a flag-style signal >= 0.70 can hide it alongside the default rules. Conflicting learned preferences favour keeping. These are reversible reading preferences, not calibrated authorship certainty.
- Only explicitly flagged/kept replies are persisted. Model caches are invalidated when feedback changes; already-rendered unrelated replies are not resubmitted in bulk. New/revisited replies use the new preferences. Reset Learning clears displayed learned decisions and permits normal rechecking.
- Feedback requires an actual user click; page scripts cannot submit it by triggering synthetic clicks. A save error is shown beside the control rather than claiming success.

## Behaviour

Automatic checks do not require flagging. All loaded replies are queued within the request allowance; the extension does not auto-scroll or expand more comments. The optional feedback action is quiet until hover/focus. If installed files and Chrome's running worker are out of sync, unsupported controls are suppressed and the popup shows **Update Ready** with the exact Chrome reload step. Reload the extension at `chrome://extensions`, then refresh LinkedIn after finishing any draft.

- Original posts are never sent to TypeSafe for classification and receive no analysis labels.
- Individual top-level comments and nested replies are checked automatically once loaded. The commenter body alone is sent, without author/profile metadata, other replies or the original post.
- A flagged reply becomes a small **Likely AI Reply / Show Reply** row. The author, LinkedIn controls and nested discussion remain available. **Hide Reply** reverses the reveal.
- Replies that pass, cannot be analysed or have insufficient text remain visible with only the small feedback control. There is no **Why This Result** section.
- Posts containing **promoted** anywhere in their header/body, ignoring case, collapse locally with **Show Post**. This includes ordinary posts saying “I got promoted”, per the explicit request. Comments do not trigger this post rule. No TypeSafe request is made for this match.
- The main switch pauses all filtering and restores content. Connection settings and the request budget remain available.

## Windows Setup

Requires Node.js 24 or later. The release ZIP contains a built extension and companion; it does not need npm dependencies.

1. Extract **Quiet-Feed-0.7.0.zip** to a permanent folder.
2. Run **Start Quiet Feed.cmd** once. It saves the key in your Windows user environment and registers a per-user Windows Task Scheduler task. The companion starts quietly at sign-in and its supervisor restarts it after an unexpected exit. No administrator password is stored or requested.
3. In `chrome://extensions` (or `edge://extensions`), enable **Developer Mode**, choose **Load Unpacked**, and select the extracted `dist/extension` folder.
4. Open **Quiet Feed** from Chrome's extensions menu. It connects using the private local pairing file generated by the launcher. Your TypeSafe API key stays outside the extension; no repeated pasting is needed.
5. Refresh LinkedIn and open comments. Replies are checked as you browse them.

Closing the launcher leaves the Windows-managed companion running. **Stop Quiet Feed.cmd** stops its supervisor and companion until you run Start again or next sign into Windows. **Disable Quiet Feed Startup.cmd** stops it and removes the startup task, preserving credentials and feedback. Keep the installation folder in place. To move it, disable startup from the old folder first, then run Start in the new folder.

The task runs only while your Windows user is signed in, including on battery, without a three-day execution timeout. It does not make paid requests by itself. Filtering still requires the browser extension, internet access, available TypeSafe quota and the existing browser request allowance. Windows sign-in is configured, but testing the launcher does not itself prove a reboot cycle.

## Mac Setup

Use the separate **Quiet-Feed-macOS-0.7.0.zip** and its **MAC-QUICK-START.md**. It includes the same built extension and Node companion, plus macOS shell scripts. `bash start-mac.sh` checks Node.js 24+, asks macOS Keychain for your own TypeSafe key on first use, registers a per-user LaunchAgent, starts the companion, and generates private local pairing for Chrome. The key is never stored in the extension or package. `bash stop-mac.sh` stops it until the next login; `bash disable-mac-startup.sh` removes the LaunchAgent while preserving the key and feedback. Keep the extracted folder at a stable location.

## Upgrade From 0.1.x

The **companion and extension both need updating** because classification now targets replies. Stop the old companion, replace the `dist` folder's files with the new release files, then start it again. Reload Quiet Feed at `chrome://extensions` and refresh LinkedIn. Pairing is preserved on this computer. Old threshold/mode values are ignored; session counts and cached post results are reset once by the new classifier version.

The old `/analyse` and `/analyse-reply` endpoints are rejected. Only `/analyse-reply-v3` classifies text, preventing old bundles from misreading feedback decisions. Both the companion and extension need updating for 0.3.0. The popup reports an update requirement if it finds an older companion.

## Scope And Reliability

This release runs on LinkedIn's website in desktop Chrome/Edge on Windows, and desktop Chrome on macOS. Both use a localhost companion on their own computer. It does not modify the native LinkedIn app. A mobile-browser version would require a port to a browser supporting extensions, mobile-layout verification, and a different secure connection to the TypeSafe companion; the localhost address does not point to this computer from a phone. Mobile support has not been implemented or tested.

Text alone cannot prove AI authorship. These are fallible style judgements, not a validated authorship detector. Human comments can be flagged and AI comments can pass. Every hidden reply can be revealed.

All loaded, nonempty comment bodies are checked automatically, including short replies; longer comments are limited to the first 4,000 characters. Images, videos, documents, private messages and text being typed in editors are excluded. No automatic scrolling, comment expansion, LinkedIn private API, or account action is performed. Only already-loaded comment bodies on supported feed/post/profile layouts are analysed.

Without saved feedback, the default decision rule is: AI-style or explicit-disclosure signal >= 0.90, or AI-style >= 0.85 together with boilerplate >= 0.90. Boilerplate alone never hides a reply. These values are a product preference, not empirically calibrated detection accuracy. The UI deliberately has no threshold control or numeric result details.

## Limits And Privacy

The extension defaults to 100 requests per browser session, shared across tabs. Missing pairing and local 401/403/404 rejections do not count, because they happen before inference. Network/time-out/provider failures remain counted when upstream usage is uncertain. **Reset Session & Retry** allows more requests and retries failures, retaining successful reply results. Identical text is cached; changed or expanded text is checked again. Stale responses cannot hide a reply that changed during a request.

The companion caps upstream requests at 500 per UTC day during its current run. Restarting it resets that counter. This is not a monetary cap; TypeSafe account charges apply. The extension serialises its requests, and a rate-limit response causes a 60-second cooldown without automatic provider retries.

Reply text goes to `https://api.typesafe.ai/v1/systemone` using your TypeSafe account. Consult TypeSafe's own data policies. No telemetry is added, no post/comment bodies are logged, and no LinkedIn likes, replies, reposts or messages are sent.

The API key stays in the local companion environment, never in extension/page code. On Windows it is saved in the user environment; on macOS it is saved in Keychain and read at login by the local LaunchAgent. The companion binds only to `127.0.0.1:43127`, checks host/origin and requires a random pairing token. The token is stored in extension-only local storage; content scripts cannot read that store. Browser/session and companion caches contain text hashes and results, not raw text. The companion cache expires entries after 24 hours and is capped at 1,000 entries. Local state is under `%LOCALAPPDATA%\QuietFeed` on Windows or `~/Library/Application Support/QuietFeed` on macOS.

The launcher also writes that loopback pairing token to the installation's `dist/extension/local-connection.json`. Only the extension can fetch it; it is not web-accessible and contains no TypeSafe key. Do not distribute this file. Use `scripts/package.ps1 -Destination <output-folder>` for Windows or add `-Platform macOS` for a Mac release; both use an explicit public-file allowlist. The file is Git-ignored, excluded from browser-test copies, and never included in release ZIPs. Authenticated health diagnostics expose counts and error categories only, never credentials or reply text.

## Development And Verification

```powershell
npm install
npx playwright install chromium
npm run verify
```

Verification includes TypeScript checks, native Node security/API tests, a production build, and isolated headless Chromium MV3 tests. The test extension points to a random local fixture port, leaving any running user companion untouched. It exercises old/current comment layouts, nested replies, dynamic/edited text, reveal/pause, cache/budget/failure behaviour, promoted posts, and exclusion of original posts, editors and messages.

`node tests/live-smoke.mjs` makes up to three real TypeSafe calls on synthetic replies using a process-scoped key and writes a redacted report under ignored `work/`. This is outside routine tests to avoid incidental API usage. A live smoke check proves API integration, not detection accuracy.

`tests/live-browser.mjs` is an explicit two-reply paid integration check using the installed extension, its companion and real TypeSafe in an isolated Chrome profile. Set `QUIET_FEED_INSTALLED_EXTENSION` to the intended installed folder. It never reads or posts real LinkedIn content. `tests/update.mjs` reproduces a legacy worker's Invalid extension request and checks the mismatch guard plus a clean current installation. It does not automate the real user's Chrome reload control. A self-reload shortcut was not shipped because that path could not be verified reliably.

The source is TypeScript compiled by esbuild; the companion uses only Node built-ins. No runtime npm dependencies or remotely executed code are required. LinkedIn can change its DOM, so unsupported structures remain visible. Read-only inspection on 18 September 2026 verified current SDUI comment wrappers and individual `expandable-text-box` bodies; actual filtering in the user's profile requires reloading the installed extension and refreshing LinkedIn.

`tests/windows-lifecycle.ps1 -Installation <installed-folder> -Report <private-report-path>` is an explicit Windows lifecycle check, outside normal verification because it stops/restarts that companion. It verifies saved credentials, automatic process recovery, duplicate starts, intentional stop, and preservation of pairing and existing feedback without calling TypeSafe. Run it in the same Windows user context as the startup task. It does not sign out or reboot Windows.

References: [TypeSafe API](https://docs.typesafe.ai/api), [Noul](https://docs.typesafe.ai/primitives/noul), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).
