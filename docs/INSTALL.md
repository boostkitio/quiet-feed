# Install Quiet Feed

Quiet Feed is a free extension for desktop Chrome and Edge, on Windows, Mac or Linux. It hides the parts of the LinkedIn feed you did not ask for. Nothing else needs installing.

## Three steps

1. Extract this ZIP into a folder you will keep, for example `Documents/Quiet-Feed`.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked** and choose that folder.
3. Open or refresh LinkedIn. A **Quiet Feed hides:** row appears at the top of your feed.

Chrome may remind you that a developer-mode extension is running. That is expected for an extension installed this way.

## What it does

- Hides posts marked **Promoted**, **Suggested** posts, and posts shown only because someone else liked or commented.
- Hides posts older than 7, 14, 30 or 90 days.
- Hides **Jobs recommended for you** and **Videos for you**.
- Optionally hides posts written in one-line engagement-bait format, posts containing words you mute, and the **LinkedIn News** and **Today’s puzzles** panels.

Every hidden post keeps a **Show Post** button. Use the row on the feed, or the Quiet Feed button in the browser toolbar, to switch any rule on or off.

Quiet Feed runs in your own browser. It does not post, like, follow, scroll or collect anything, and the post filters send nothing anywhere.

## Optional: hide AI-style replies

Quiet Feed can also collapse comments and replies that read as AI-written. This uses Jev from TypeSafe and needs your own TypeSafe key.

1. Get a key from [your TypeSafe account](https://console.typesafe.ai/keys). TypeSafe charges your account for usage.
2. Click the Quiet Feed button in the toolbar, open **AI Reply Filter**, paste the key and click **Save Key**.

With this on, the text of loaded comments is sent to TypeSafe for checking. Your key is stored only in your browser and sent only to TypeSafe. Use **Remove Key** to turn it off. The judgement is a fallible reading of style, not proof of who wrote something, so every reply can be revealed.

## Updating or removing

To update, extract the new ZIP over the same folder, click the reload icon on Quiet Feed at `chrome://extensions`, then refresh LinkedIn. To remove it, click **Remove** on the same page.

Quiet Feed is an early release and is not affiliated with LinkedIn or TypeSafe. It works on the LinkedIn website, not the mobile apps.
