# Durak — The evening table

A small, dependency-free multiplayer Durak game for 2–4 friends. A first-person table view puts your cards in the foreground and other players around the felt. Create a lobby, share its six-character code, and let the host deal.

## Automatic moves, action dock, and leaving

The server automatically passes when the current attacker has no legal matching card, and automatically takes when the defender cannot beat the attack. A 950ms pause shows the forced action before it resolves; no browser action is required. A player who has a legal card always retains their choice.

Pass, Take, Deal and Rematch now occupy an action dock to the right of the hand, within the existing desktop height. Button glints, defence shockwaves and small particles supplement the seat-to-table card animations. Reduced-motion preferences disable these effects.

The Leave table button works during play. Departing hands go to the discard pile. Attacker departures preserve the current table and advance priority if necessary. If the defender departs, the exposed table is discarded, remaining attackers refill in their existing order, and the next active clockwise seat starts a new bout. Normal endgame rules still apply. With fewer than two seated players, the match returns to a waiting lobby which accepts a new player. The host role transfers to the next seated player. A network interruption is not treated as leaving.

Update the full project together and redeploy between games. The changes include server logic and all three frontend files; active in-memory games reset during deployment.

## Desktop viewport layout

Desktop widths above 760px use a fixed viewport-height layout. The header, role summary, action message, controls and hand have reserved areas; the table fills the remaining space. Lower desktop windows switch to a more compact layout. The decorative footer is hidden on desktop. Long action messages and turn hints use ellipsis with the full text available on hover. Large hands overlap automatically inside their area instead of creating a page scrollbar; hovering or focusing a playable card raises it above its neighbours. Mobile retains its separate layout, and the rules dialog can scroll internally.

This update changes only `public/style.css`, `public/app.js`, and this README. Replace both frontend files together and refresh the browser. The desktop layout has been checked in source and JavaScript syntax checked; it has not been visually verified in a browser.

## Interface update

The table is wider and deeper, with larger battle cards on desktop. A round summary names the lead attacker, defender, and current player. Seat badges distinguish roles from whose turn it is; your own turn panel is highlighted too. Gold indicates attack and blue indicates defence, always accompanied by text.

Every accepted move includes a public action announcement. Played cards fly from the player's seat to the table, with a stronger defence landing. Even a final defence that immediately clears the table is shown. Animations never delay the game and respect the device's reduced-motion preference.

To update an existing deployment, replace `public/index.html`, `public/style.css`, `public/app.js`, `server.js`, and `game.js` together, then redeploy and refresh each player's browser. Server changes add public move metadata; gameplay rules are unchanged. Redeploying resets active in-memory lobbies, so update between games.

## Run locally

Install Node.js 22 or newer, then from this folder:

```sh
npm start
```

Open http://localhost:3000. To try both seats yourself, use two tabs (sessions are stored per tab). Create the table in one and join with its code in the other. On your home network, friends can use your computer's LAN address and port 3000 if your firewall permits it.

No dependencies, database, API keys, or build step are required.

## Deploy on Render

1. Extract this archive and push the contents of the `durak` folder to the root of a GitHub repository.
2. In Render, choose **New → Web Service**, connect that repository, and select **Node** as the runtime.
3. Set **Build Command** to `npm ci` and **Start Command** to `npm start`.
4. Use one instance, select your plan, and deploy. The included `render.yaml` also supports a Render Blueprint deployment.
5. Open the HTTPS URL Render provides. Create a table and share that URL plus the lobby code with your friends.

The server binds to `0.0.0.0` and Render's `PORT`. The health endpoint is `/health`. Serve the frontend and backend together as this Web Service; a Static Site alone cannot run the multiplayer server.

Render documentation: https://render.com/docs/deploy-node-express-app
Free-service behavior: https://render.com/docs/free

## Rules at this table

Individual throw-in Durak (Podkidnoy), using 36 cards ranked 6 through Ace. Six cards each; the bottom face-up card sets trump and is drawn last. The lowest trump holder begins; if no hand contains a trump, the first seat begins.

Attacks proceed one card at a time. After a defence, the lead attacker has first priority, then the others clockwise after passing. Additions must match a rank already on the table. A new card restores lead-attacker priority. This explicit sequence replaces spoken permission around a physical table.

A defender beats a card with a higher card of its suit, or with a trump if the attack isn't trump. The defender may take instead; attackers may still add legal cards before passing. Attack count cannot exceed six or the defender's hand size at the start of the bout. Successful defence discards the table and makes the defender the next attacker. Taking collects the entire table and skips that defender's attack.

Hands refill to six, lead attacker first, other attackers clockwise, defender last. After the stock is exhausted, players with empty hands leave play. The last player holding cards is the Durak. If everyone empties their hand in the final bout, the game is a draw. Each rematch uses a fresh shuffle and lowest-trump start.

No transfers, partnerships, or trump-six exchange in v1. The in-game How to play panel explains the controls.

Rules reference: https://www.pagat.com/beating/podkidnoy_durak.html

## Architecture

- `game.js`: authoritative rules, move validation, private player snapshots.
- `server.js`: Node HTTP server, lobby/session management, JSON actions, Server-Sent Events and reconnects.
- `public/`: vanilla HTML, CSS, and JavaScript. No external assets, fonts, or client libraries.
- `test/`: rule scenarios, full-game simulations, and an HTTP integration test with two concurrent player streams.
- `render.yaml`: single Render Node Web Service configuration.

The server shuffles using `node:crypto`, validates every action and sends only the viewer's own hand. Opponents receive card counts, never the other players' hands or deck order. Player names render as text. Opaque session tokens identify seats and stay in the tab's session storage; do not share these tokens. EventSource uses the token in its URL, so avoid adding request-query logging.

## Checks

```sh
npm test
```

Sixteen tests cover trump rules, illegal moves, initial deals, private state, attacker priority, pickup and discard behavior, refill order, endings, 36 complete simulated games across 2–4 players, two-client HTTP/SSE play and reconnect, forced server moves, departures in different roles, card conservation through 32 simulated games with departures, host transfer, and rejoining a waiting lobby. Browser visual testing has not been performed.

## Deliberate v1 limits

- Lobby state is in memory. Restarts, redeploys, or Render instance recycling reset all games. Free Render services can spin down while idle and take time to wake. Use a single instance; multiple instances need shared state and coordination.
- A disconnected player keeps their seat. Refresh in the same tab to reconnect. There are no bots, general turn timeouts, or host kicks yet. Explicit Leave table releases a seat; a disconnected player with a legal move still needs to reconnect or leave.
- Sessions use per-tab storage. A new tab or different device cannot reclaim an existing seat. Join before the host starts; there is no mid-game joining.
- Empty disconnected lobbies expire after two hours. There are basic body, connection, request-rate, and room limits, but this is a friends-and-family MVP, not a hardened public gaming service.
