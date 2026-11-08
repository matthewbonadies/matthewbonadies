# Scores

A live sports scoreboard web app built for the foldable iPhone. You add it to your Home Screen from Safari.

- **Folded:** a list of today's games. Tap one to slide in the details. Swipe from the left edge or tap **Games** to go back.
- **Unfolded:** the list and the game details appear side by side. On wide screens the detail cards form two columns.
- Leagues: NFL, NBA, MLB, NHL, NCAAF, NCAAM, WNBA, MLS, Premier League.
- Live games show first and refresh every 20 seconds (every 2 minutes when nothing is live). Refreshing pauses while the app is in the background.
- Each game shows a score-by-period table, leaders, scoring plays, venue, TV channel and betting line.
- Star a team to pin its games to the top of each section. The app also remembers your last league.
- After the first load it works offline and shows the last scores it fetched.

Scores come from ESPN's public scoreboard feed (`site.api.espn.com`). It needs no API key, but it is unofficial and ESPN could change it.

## Run it

It's a static site with no build step:

```sh
cd scores
python3 -m http.server 8000
# open http://localhost:8000          live scores
# open http://localhost:8000/?demo    made-up sample games
```

## Put it on your phone

1. Host the `scores/` folder over HTTPS. Offline mode and the Home Screen app need HTTPS. One way is GitHub Pages: in this repo go to **Settings → Pages**, deploy from the `main` branch, root folder. The app is then at `https://<user>.github.io/<repo>/scores/`.
2. Open that URL in Safari on the iPhone.
3. Tap **Share → Add to Home Screen**. It then opens full screen like a native app.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and iOS Home Screen meta tags |
| `styles.css` | Layout: one pane folded, two panes at 700px and wider; light and dark themes |
| `app.js` | Fetching, turning ESPN data into the app's game model, rendering, auto-refresh, favorites |
| `demo-data.js` | Sample games in ESPN's format (`?demo`) |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icons/` | Home Screen name and icons |
