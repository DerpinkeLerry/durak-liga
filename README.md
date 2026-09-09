# Durak — The evening table

A small, dependency-free multiplayer Durak game for 2–4 friends. A first-person table view puts your cards in the foreground and other players around the felt. Create a lobby, share its six-character code, and let the host deal.

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

Ten tests cover trump rules, illegal moves, initial deals, private state, attacker priority, pickup and discard behavior, refill order, endings, 36 complete simulated games across 2–4 players, and two-client HTTP/SSE play and reconnect. Browser visual testing has not been performed.

## Deliberate v1 limits

- Lobby state is in memory. Restarts, redeploys, or Render instance recycling reset all games. Free Render services can spin down while idle and take time to wake. Use a single instance; multiple instances need shared state and coordination.
- A disconnected player keeps their seat. Refresh in the same tab to reconnect. There are no bots, turn timers, forfeits, or host kicks yet, so an abandoned active game must be replaced with a new lobby in another tab.
- Sessions use per-tab storage. A new tab or different device cannot reclaim an existing seat. Join before the host starts; there is no mid-game joining.
- Empty disconnected lobbies expire after two hours. There are basic body, connection, request-rate, and room limits, but this is a friends-and-family MVP, not a hardened public gaming service.
