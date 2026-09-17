# YouTube Shuffle

A vanilla HTML/CSS/JavaScript YouTube randomizer UI.

## Features

- Google/YouTube OAuth entry point
- Your playlists
- Your subscriptions
- Random playlist video
- Random subscribed-channel video
- Surprise Me
- YouTube embedded player
- Recently played history
- No-repeat preference while history is available

## Files

- `index.html` - UI
- `style.css` - styling
- `app.js` - application logic
- `config.js` - Google/YouTube configuration

## Run locally

Because browser OAuth generally requires a web origin, don't open `index.html` directly with `file://`.

Use a local server, for example:

```bash
python -m http.server 5500
```

Then open:

http://localhost:5500

Or use VS Code Live Server.

## Google Cloud setup

Create a Google Cloud project and enable:

- YouTube Data API v3
- Google Identity Services / OAuth configuration

Create a Web application OAuth client.

Add your development origin, for example:

http://localhost:5500

For Vercel, add your deployed domain as an authorized JavaScript origin.

The app requests:

https://www.googleapis.com/auth/youtube.readonly

That scope is needed to read the user's YouTube playlists/subscriptions.

## Important production note

Do not treat the frontend as a secure place for OAuth secrets. A production version should use a server-side/Vercel serverless layer for token exchange/session handling where appropriate.

Also review Google's current OAuth verification and YouTube API quota requirements before publishing.
