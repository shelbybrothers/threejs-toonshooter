'use strict';

/*
 * Toonshooter multiplayer relay
 * --------------------------------
 * A lightweight, non-authoritative WebSocket relay:
 *   - 3 fixed rooms. Each client joins as a `player` or `spectator`.
 *   - The first player in a room becomes the `host`; the host simulates the bots
 *     and owns the match state machine, broadcasting them to everyone else.
 *   - Player/bot transform snapshots and discrete events are relayed within a room.
 *   - Combat is client-authoritative (a shooter reports hits; the target's owner
 *     applies the damage). This server only relays — it does not simulate.
 *   - Identity: each player carries { name, walletId, committed }.
 *   - Reward: when the host reports a match winner, if that winner committed with a
 *     wallet, an optional treasury payout is attempted (see payout.js). Off by
 *     default; when unconfigured it only logs a pending reward. This server never
 *     moves funds unless the operator explicitly configures a treasury key.
 */

const http = require('http');
const { WebSocketServer } = require('ws');
const { payoutWinner, REWARD_SOL } = require('./payout');

const PORT = process.env.PORT || 8845;

const ROOM_DEFS = [
  { id: 'room-1', name: 'Arena Alpha' },
  { id: 'room-2', name: 'Arena Bravo' },
  { id: 'room-3', name: 'Arena Charlie' },
];

/** @type {Map<string, {id:string,name:string,clients:Map<string,object>,hostId:string|null}>} */
const rooms = new Map();
for (const r of ROOM_DEFS) {
  rooms.set(r.id, { id: r.id, name: r.name, clients: new Map(), hostId: null });
}

let nextId = 1;
const clientId = () => 'p' + (nextId++);

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
  }
}

function broadcastRoom(room, obj, exceptId) {
  const raw = JSON.stringify(obj);
  for (const c of room.clients.values()) {
    if (c.id === exceptId) continue;
    if (c.ws.readyState === c.ws.OPEN) {
      try { c.ws.send(raw); } catch { /* ignore */ }
    }
  }
}

function roomsInfo() {
  return ROOM_DEFS.map((def) => {
    const room = rooms.get(def.id);
    let players = 0;
    let spectators = 0;
    for (const c of room.clients.values()) {
      if (c.role === 'player') players++;
      else spectators++;
    }
    return { id: def.id, name: def.name, players, spectators, hostId: room.hostId };
  });
}

function rosterOf(room) {
  const players = [];
  const spectators = [];
  for (const c of room.clients.values()) {
    const entry = { id: c.id, name: c.name, walletId: c.walletId, committed: !!c.committed };
    if (c.role === 'player') players.push(entry);
    else spectators.push(entry);
  }
  return { players, spectators, hostId: room.hostId };
}

function broadcastLobby() {
  const info = { type: 'roomsInfo', rooms: roomsInfo() };
  const raw = JSON.stringify(info);
  for (const room of rooms.values()) {
    for (const c of room.clients.values()) {
      if (c.ws.readyState === c.ws.OPEN) { try { c.ws.send(raw); } catch {} }
    }
  }
  for (const ws of lobbyOnly) {
    if (ws.readyState === ws.OPEN) { try { ws.send(raw); } catch {} }
  }
}

// Connections that have not joined a room yet (they just watch the lobby counts).
const lobbyOnly = new Set();

function electHostIfNeeded(room) {
  if (room.hostId && room.clients.has(room.hostId)) {
    const h = room.clients.get(room.hostId);
    if (h.role === 'player') return; // current host still valid
  }
  // pick the earliest-joined player
  let chosen = null;
  for (const c of room.clients.values()) {
    if (c.role === 'player') { chosen = c; break; }
  }
  const prev = room.hostId;
  room.hostId = chosen ? chosen.id : null;
  if (room.hostId !== prev) {
    broadcastRoom(room, { type: 'hostChanged', hostId: room.hostId });
  }
}

function leaveRoom(client) {
  const room = client.room ? rooms.get(client.room) : null;
  client.room = null;
  if (!room) return;
  room.clients.delete(client.id);
  broadcastRoom(room, { type: 'peerLeft', id: client.id });
  electHostIfNeeded(room);
  broadcastRoom(room, { type: 'roster', ...rosterOf(room) });
  broadcastLobby();
}

function handleJoin(client, msg) {
  const room = rooms.get(msg.room);
  if (!room) { send(client.ws, { type: 'error', error: 'unknown room' }); return; }
  if (client.room) leaveRoom(client);
  lobbyOnly.delete(client.ws);

  client.room = room.id;
  client.role = msg.role === 'spectator' ? 'spectator' : 'player';
  client.name = String(msg.name || 'Anon').slice(0, 20);
  client.walletId = msg.walletId ? String(msg.walletId).slice(0, 64) : null;
  client.committed = !!msg.committed && !!client.walletId;
  client.lastState = null;

  room.clients.set(client.id, client);
  electHostIfNeeded(room);

  send(client.ws, {
    type: 'welcome',
    id: client.id,
    room: room.id,
    roomName: room.name,
    role: client.role,
    isHost: room.hostId === client.id,
    hostId: room.hostId,
    roster: rosterOf(room),
  });
  broadcastRoom(room, {
    type: 'peerJoined',
    id: client.id, name: client.name, walletId: client.walletId,
    role: client.role, committed: client.committed,
  }, client.id);
  broadcastRoom(room, { type: 'roster', ...rosterOf(room) });
  broadcastLobby();
}

function handleMatchState(client, msg) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room || room.hostId !== client.id) return; // only host owns match state
  const state = msg.state;
  if (!state || typeof state.phase !== 'string') return;
  broadcastRoom(room, { type: 'matchState', state }, client.id);

  // A fresh match clears the "already rewarded" latch.
  if (state.phase === 'start') { room.rewarded = false; return; }

  // Reward accounting on match end — paid at most ONCE per match, only to a
  // committed *player* in this room, and only to that player's own registered wallet.
  if (state.phase === 'over' && state.winnerId && !room.rewarded) {
    const winner = room.clients.get(state.winnerId);
    const eligible = winner && winner.role === 'player' && winner.committed && winner.walletId;
    room.rewarded = true; // latch regardless, so re-sent 'over' messages can't re-pay
    const reward = {
      type: 'reward',
      winnerId: state.winnerId,
      name: winner ? winner.name : (state.winnerName || 'Winner'),
      walletId: winner ? winner.walletId : null,
      committed: !!(winner && winner.committed),
      amountSol: 0,
      status: 'none',
    };
    if (eligible) {
      reward.amountSol = REWARD_SOL;
      reward.status = 'pending';
      broadcastRoom(room, reward);
      payoutWinner(winner.walletId, REWARD_SOL)
        .then((sig) => broadcastRoom(room, { ...reward, status: sig ? 'paid' : 'logged', signature: sig || null }))
        .catch((err) => broadcastRoom(room, { ...reward, status: 'failed', error: String(err && err.message || err) }));
    } else {
      broadcastRoom(room, reward); // uncommitted/ineligible winner: no payout
    }
  }
}

const wss = new WebSocketServer({ noServer: true });
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: roomsInfo() }));
    return;
  }
  res.writeHead(404); res.end();
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const client = { id: clientId(), ws, room: null, role: null, name: 'Anon', walletId: null, committed: false, lastState: null };
  ws.isAlive = true;
  lobbyOnly.add(ws);

  send(ws, { type: 'roomsInfo', rooms: roomsInfo() });

  ws.on('message', (data) => {
    if (data && data.length > 16384) return; // drop oversized frames (anti-amplification)
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    const room = client.room ? rooms.get(client.room) : null;

    switch (msg.type) {
      case 'ping': send(ws, { type: 'pong', t: msg.t }); break;
      case 'listRooms': send(ws, { type: 'roomsInfo', rooms: roomsInfo() }); break;
      case 'join': handleJoin(client, msg); break;
      case 'leave': leaveRoom(client); lobbyOnly.add(ws); break;
      case 'setCommit':
        client.committed = !!msg.committed && !!client.walletId;
        if (room) broadcastRoom(room, { type: 'roster', ...rosterOf(room) });
        break;
      case 'state': // my player snapshot
        if (!room || client.role !== 'player') break;
        client.lastState = msg.snapshot;
        broadcastRoom(room, { type: 'state', id: client.id, snapshot: msg.snapshot }, client.id);
        break;
      case 'botState': // host-owned bots
        if (!room || room.hostId !== client.id) break;
        broadcastRoom(room, { type: 'botState', bots: msg.bots }, client.id);
        break;
      case 'event': // discrete gameplay event (fire, hit, death, grenade, pickup, chat)
        if (!room) break;
        broadcastRoom(room, { type: 'event', from: client.id, event: msg.event }, client.id);
        break;
      case 'matchState': handleMatchState(client, msg); break;
      default: break;
    }
  });

  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('close', () => { lobbyOnly.delete(ws); leaveRoom(client); });
  ws.on('error', () => { lobbyOnly.delete(ws); leaveRoom(client); });
});

// Heartbeat to drop dead sockets.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[toonshooter] relay listening on :${PORT} — rooms: ${ROOM_DEFS.map((r) => r.id).join(', ')}`);
});
