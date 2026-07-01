# Toonshooter · $TOONSHOOTER

A fast-action **web3 toon arena shooter** built with Three.js — solo vs CPU or 4-player free-for-all, playable on **desktop and mobile**. Connect a Solana wallet, follow on X, and jump into the arena.

> Rebrand of an open-source Three.js toon-shooter prototype ("Tiny Toon Duel"). Static, Vercel-ready.

<p align="center">
  <img src="public/toonshooter/design-markedup.jpeg" alt="Toonshooter arena" width="720" />
</p>

## What's new in this rebrand

- **Branding** — Toonshooter / `$TOONSHOOTER` across the landing page and in-game menu.
- **Solana wallet** — identity-only connect (Phantom / Solflare / Backpack), auto-reconnect, live SOL balance. No transactions are ever requested.
- **Coin bar** — Follow on X, Buy on pump.fun, and Copy-CA buttons, wired from a single config block.
- **Mobile support** — twin-stick touch controls (left = move, right = aim + hold-to-fire), on-screen action buttons (Dash / Reload / Grenade / Kick / Weapon), tap-to-start, tap-to-resume, and a portrait "rotate your phone" hint. Controls only appear during play.
- **Bigger battlefield + meadow** — an enlarged arena framed by a lush environment: GPU-instanced **swaying grass** (wind shader), procedural **fluffy trees**, animated **water puddles**, and a decorative **Duck** ([Khronos glTF sample model](https://github.com/KhronosGroup/glTF-Sample-Models)). All decor sits outside the play bounds so the top-down view stays clear.
- **⚙ Options menu** (from the main menu or pause) — Music & SFX toggles + volume, Graphics (detail + grass quality), **Camera** (third-person / overhead), and the control instructions (moved off the HUD). HUD panels are sized to never overlap on phone or desktop.
- **Music** — 7 procedurally-generated tracks in `public/assets/audio/music/` (`menu`, `battle_1`–`battle_4`, `match_won`, `match_lost`): menu loops on the menu, a random battle track plays each match, and a win/loss stinger plays at the end. Replace the MP3s with your own to reskin the soundtrack.
- **Third-person camera** by default (chase-cam behind your fighter) — switch to the classic overhead view in Options.
- **4 arenas** — Meadow (playable) plus Mountain / Garden / City shown **locked** (unlock mockups). Each is a full color theme (ground, grass, trees, sky, fog).
- **Logo & favicon** — drop your `toonshooter_logo.png` into `public/` to set the site favicon and the in-game + landing logo (a placeholder ships in the meantime; falls back to text if missing).
- **SOL rewards** — the connect button shows your live SOL balance, the menu shows a mockup **SOL POOL REWARDS** pool, and a payout is queued to your wallet **every 3 wins**.

### Configure links / coin

Edit the `TOONSHOOTER_CONFIG` block near the top of **both** `public/index.html` and `public/toonshooter/index.html`:

```js
window.TOONSHOOTER_CONFIG = {
  X_URL: 'https://x.com/toonshooterfun',
  PUMP_URL: 'https://pump.fun',      // replace with the live pump.fun coin page
  CONTRACT_ADDRESS: '',              // paste the mint address once the coin launches
  RPC_URL: 'https://api.mainnet-beta.solana.com'
};
```

While `CONTRACT_ADDRESS` is empty, the CA shows "coming soon" and the Buy button points at pump.fun's home.

## Project Layout

```
public/
├─ index.html               # Landing page (branded, coin bar, wallet)
├─ assets.json              # Asset manifest (loaded by the game)
├─ assets/                  # GLTF models / textures
└─ toonshooter/
   └─ index.html            # Main Three.js game (branding + wallet + mobile controls)
vercel.json                 # Static hosting config (clean URLs, caching)
package.json                # `npm run dev` → static server on :5344
```

## Running Locally

```bash
npm run dev        # python3 -m http.server 5344 --directory public
```

Then visit:
- `http://localhost:5344/` — landing page
- `http://localhost:5344/toonshooter/` — the game
- `http://localhost:5344/toonshooter/?mobile=1` — force the mobile touch layout on desktop (for testing)

## Controls

**Desktop:** WASD move · Mouse aim · Click/Hold fire · 1/2/3 weapon · E kick · Space dash · R reload · G grenade · Tab leaderboard · P pause · V visuals.

**Mobile:** left stick moves, right stick aims and fires (hold to keep firing). Buttons on the edges cover dash, reload, grenade, kick, and weapon switch; PAUSE/BOARD sit below the timer.

## Multiplayer

Real-time rooms with players, spectators, and bots — served by a small WebSocket relay in `server/`.

- **3 rooms** (Arena Alpha / Bravo / Charlie). Join each as a **Player** or **Spectator** from the in-game **MULTIPLAYER** menu.
- **Identity** — every player carries a name + (optional) Solana wallet, shown on the lobby roster and each in-game HUD panel.
- **Single-life FFA** — up to 4 combatants per match; humans fill slots first, then bots top it up. The first player in a room is the **host** and presses **START MATCH**; the host simulates the bots and runs scoring, everyone else sees interpolated ghosts. Damage is shooter-authoritative (fine for a casual game — not anti-cheat).
- **Commit → win $SOL** — tick **Commit** (needs a connected wallet) before joining. If a committed player wins, the server records a $SOL reward. Uncommitted players still play for free and earn nothing.

Everything **degrades to solo** — if the relay is unreachable, the game plays exactly as single-player (SOLO VS BOTS).

### Reward payouts (off by default)

The server only **logs** pending rewards unless a treasury is configured. To enable real $SOL payouts, set these env vars on the server (never in code):

```
TREASURY_SECRET_KEY = [12,34,...]   # JSON array of the treasury Keypair secret
RPC_URL             = https://...   # a Solana RPC endpoint
REWARD_SOL          = 0.01          # amount per committed winner
```

### Run the server locally

```bash
cd server && npm install && npm start   # relay on ws://localhost:8845
```

Point the client at it via `WS_URL` in `TOONSHOOTER_CONFIG` (both HTML files). Left `null`, the client auto-derives `ws://<host>:8845` in dev; set it to your `wss://` URL in production.

## Deployment

**Client (Vercel, static):**
1. Create a Vercel project from this repo.
2. Framework preset: **Other**. Leave the build command empty.
3. Output directory: `public` (also declared in `vercel.json`).
4. Deploy. Clean URLs are enabled; `/toonshooter` and `/toonshooter/` both work.

**Server (Render, WebSocket):**
1. New **Web Service** from this repo, root directory `server/` (see `server/render.yaml`).
2. Build `npm install`, start `npm start`, health check `/health`.
3. Copy the deployed `wss://…` URL into `WS_URL` in both HTML config blocks and redeploy the client.
