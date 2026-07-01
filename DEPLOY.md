# Deploying Toonshooter (GitHub Desktop → Vercel + Render)

Toonshooter has **two parts** that deploy separately:

| Part | What | Where | Folder |
|------|------|-------|--------|
| **Client** | the game + landing page (static files) | **Vercel** | `public/` |
| **Server** | the multiplayer relay (`ws`) | **Render** | `server/` |

Single-player works with just the client. **Multiplayer needs the server deployed and the client pointed at it** (see Step 4 — this is the part people forget).

---

## Step 1 — Put the code on GitHub (GitHub Desktop)

This folder is currently a clone of the original repo, so publish it under **your** account:

1. Open **GitHub Desktop** → **File → Add Local Repository…** → choose the `threejs-toonshooter` folder.
2. This repo still points at the original author. Make it yours:
   - Create a new **empty** repository on github.com (e.g. `toonshooter`) — *don't* add a README/license.
   - In GitHub Desktop: **Repository → Repository Settings… → Remote** and set the primary remote URL to your new repo, e.g. `https://github.com/<you>/toonshooter.git`. *(If it lets you "Publish repository" to a new repo instead, that's fine too.)*
3. In the left panel, enter a **Summary** (e.g. "Toonshooter launch") and click **Commit to main**.
4. Click **Push origin** (or **Publish branch**).

> Make sure GitHub Desktop is signed in as the account that owns the repo, so the commit author matches (Vercel/Render read the connected GitHub account).

Whenever you change anything later: **Commit → Push**, and Vercel/Render auto-redeploy.

---

## Step 2 — Deploy the CLIENT to Vercel

1. Go to **vercel.com → Add New… → Project** and **Import** your GitHub repo.
2. Settings:
   - **Framework Preset:** `Other`
   - **Build Command:** leave **empty**
   - **Output Directory:** `public`  *(also declared in `vercel.json`)*
3. Click **Deploy**. You'll get a URL like `https://toonshooter.vercel.app`.
   - Landing page: `/`
   - Game: `/toonshooter/`

---

## Step 3 — Deploy the SERVER to Render

1. Go to **render.com → New → Web Service** and connect the same GitHub repo.
2. Settings (also in `server/render.yaml`):
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - Instance type: **Free** is fine to start.
3. Click **Create Web Service**. You'll get a URL like `https://toonshooter-server.onrender.com`.
   - Your WebSocket URL is the same host with `wss://`: `wss://toonshooter-server.onrender.com`

> Render's free tier **sleeps after ~15 min idle**, so the first player who joins may wait a few seconds while it wakes up. Upgrade the instance if you want it always-on.

---

## Step 4 — Point the client at the server (REQUIRED for multiplayer)

Edit **`public/toonshooter/index.html`** — find the `TOONSHOOTER_CONFIG` block near the top and set `WS_URL` to your Render `wss://` URL:

```js
window.TOONSHOOTER_CONFIG = {
  X_URL: 'https://x.com/toonshooter',
  PUMP_URL: 'https://pump.fun',          // your pump.fun coin page when live
  CONTRACT_ADDRESS: '',                   // the mint address when live
  RPC_URL: 'https://api.mainnet-beta.solana.com',
  WS_URL: 'wss://toonshooter-server.onrender.com',   // ← paste your Render URL here
  BOT_TARGET: 4
};
```

Then in GitHub Desktop: **Commit → Push**. Vercel redeploys automatically.

> If `WS_URL` is left `null`, the game auto-uses `ws://<host>:8845` — that only works for **local dev**, not on Vercel. On a live https site you **must** set `WS_URL` or the lobby won't connect.

### Verify multiplayer works
1. Open `https://<your-vercel-url>/toonshooter/` in two browsers (or a phone + a laptop).
2. Both click **MULTIPLAYER**, enter a name, and **Play** the **same room** (e.g. Arena Alpha).
3. You should see each other in the room roster. The host presses **START MATCH** — you fight together (bots fill empty slots).

---

## Step 5 (optional) — Real $SOL reward payouts

Off by default (the server only logs pending rewards). To pay committed winners for real, add these as **Environment Variables** on the Render service (never in code):

| Key | Value |
|-----|-------|
| `TREASURY_SECRET_KEY` | JSON array of your treasury Keypair secret, e.g. `[12,34,…]` |
| `RPC_URL` | a Solana RPC endpoint |
| `REWARD_SOL` | amount per committed winner (default `0.01`) |

Keep the treasury wallet funded. Redeploy the server after adding them.

---

## Custom domain (optional)
Add your domain in the **Vercel** project → Settings → Domains. The server URL can stay on Render (or add a domain there too and use it in `WS_URL`).
