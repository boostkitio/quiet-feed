# Quiet Feed For Mac · Companion Package

Most people only need the extension-only download and its three-step **INSTALL.md**, which works on a Mac with nothing else installed. This package adds a companion that keeps your TypeSafe key in the macOS Keychain and starts at login.

Quiet Feed runs in desktop Chrome on macOS. It hides likely AI-written comments and replies, suggested posts, the “Videos for you” section, and (by default) “Jobs recommended for you” and feed posts older than 7 days. A row beneath LinkedIn's Sort by control switches the promoted and age rules and sets the age. Every hidden reply or post can be revealed.

## Set Up

1. Install [Node.js 24 or later](https://nodejs.org/en/download). Get your own TypeSafe API key from [your TypeSafe account](https://console.typesafe.ai/keys). Your TypeSafe account supplies the credits used by your key.
2. Extract **Quiet-Feed-macOS-0.7.3.zip** into a folder you will keep. Do not move that folder after setup.
3. Open **Terminal**. Type `bash ` (including the space), drag **start-mac.sh** from the extracted folder into Terminal, and press Return. On first use, macOS Keychain asks you to enter your TypeSafe key. The key is saved in your Keychain, not in Chrome or the ZIP.
4. Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose the extracted **dist/extension** folder.
5. Open Quiet Feed from Chrome’s extensions menu. It should say **Connected & Filtering** without a pairing-code paste. Visit LinkedIn in Chrome and open a comment thread.

The companion starts automatically at your Mac login while this folder remains in place. To stop it until you next sign in, run **stop-mac.sh** through Terminal in the same way. To remove automatic startup, run **disable-mac-startup.sh**. Disabling startup preserves your Keychain key and saved feedback. If you want to move the installation, disable startup from the old folder first and run Start from the new folder; reload the unpacked extension from its new location in Chrome.

Only loaded comment and reply text, plus a small selection of feedback examples you explicitly saved, goes to TypeSafe. Original posts, private messages, photos and videos are not analysed. TypeSafe’s judgement is a reading preference, not proof of AI authorship. The companion binds to this Mac’s loopback address. This does not work in the native LinkedIn app or the Codex in-app browser.

This package is an unpacked Chrome extension with a Terminal launcher, not a signed Mac app or Chrome Web Store install. It needs macOS Keychain and LaunchAgent support. If connection fails, check `~/Library/Application Support/QuietFeed/companion-error.log` and rerun **start-mac.sh**. Finish any draft before refreshing LinkedIn.
