# Forge browser extension

Grade what you are writing on X, LinkedIn, Threads and Bluesky before you post, see where it drifts from your measured voice, fill the composer with a draft you approved in Forge, and save posts and stories to Forge from any page.

The extension never posts, replies, likes or follows for you. It places text in a composer only when you click a draft in its Fill list, and only in the composer you have open; you read it and press Post. Grades, saves and the draft list go through your Forge account with a personal access token; the token is held by the service worker and never exposed to the pages you visit.

## Install (development)

1. In Forge, open **Brand, Settings, Browser extension** and create an access token. Copy it; it is shown once.
2. Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select this `extension` folder.
3. Click the Forge icon in the toolbar and paste the token.

For a local Forge, open **Self-hosted or local Forge** in the popup and enter `http://localhost:3000`.

## What it does

| Where | What |
| --- | --- |
| Any post composer on X, LinkedIn, Threads or Bluesky | A **Grade** button at the corner of the box. Shows the score out of 50, the five dimensions, the one fix, a stronger opening to copy, and lines that drift from your voice. `Ctrl+Shift+G` (`Cmd+Shift+G`) grades from the keyboard. |
| The same composers | A **Fill** button listing your approved and scheduled drafts for that platform, soonest first. Click one to place it in the composer. Threads fill one post at a time, in order. |
| Right-click on selected text | **Save to Forge as a draft**, **Save to Forge Story Bank**, **Add to my Forge voice** (for posts you wrote). |
| Toolbar popup | Grade any line without leaving the tab. |

## Files

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3. Host access only to Forge itself; composer pages get a content script. |
| `background.js` | Service worker. The only code that calls the Forge API. Context menus. |
| `config.js` | Token and address storage (`chrome.storage.local`, never synced), API helper. |
| `content.js` | The composer buttons, grade panel and fill list, rendered in a closed shadow root. |
| `popup.html`, `popup.css`, `popup.js` | Connect, disconnect, quick grade. |

## API used

All endpoints accept `Authorization: Bearer fx_...` and are documented in the route files under `app/api/extension/`.

- `GET /api/extension/me`
- `POST /api/extension/grade` `{ text, platform? }`
- `POST /api/extension/save` `{ kind: 'draft' | 'story' | 'voice', text, ... }`
- `GET /api/extension/queue?platform=x` drafts ready to fill
- `POST /api/extension/queue` `{ draftId }` records that a draft was filled

Tokens are stored in Forge only as SHA-256 hashes and can be revoked from the same settings card.

## Package for the Chrome Web Store

```bash
cd extension && zip -r ../forge-extension.zip . -x "README.md"
```
