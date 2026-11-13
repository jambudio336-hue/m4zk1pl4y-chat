import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { db } from './db.js';
import { readToken } from './auth.js';
import accountRoutes from './routes/account.js';
import contactRoutes from './routes/contacts.js';
import messageRoutes from './routes/messages.js';
import storyRoutes from './routes/stories.js';
import nearbyRoutes from './routes/nearby.js';
import blockRoutes from './routes/blocks.js';

const app = express();
const server = http.createServer(app);

const origins = (process.env.CORS_ORIGIN || '*') === '*'
  ? true
  : process.env.CORS_ORIGIN.split(',').map((o) => o.trim());

const io = new Server(server, { cors: { origin: origins } });

app.set('io', io);
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '8mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/v1/account', accountRoutes);
app.use('/v1/contacts', contactRoutes);
app.use('/v1/messages', messageRoutes);
app.use('/v1/stories', storyRoutes);
app.use('/v1/nearby', nearbyRoutes);
app.use('/v1/blocks', blockRoutes);
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

io.use((socket, next) => {
  const userId = readToken(socket.handshake.auth?.token);
  if (!userId) return next(new Error('unauthorized'));
  socket.data.userId = userId;
  next();
});

io.on('connection', (socket) => {
  const { userId } = socket.data;
  socket.join(`user:${userId}`);
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), userId);

  const canSignal = (peerId) => {
    if (typeof peerId !== 'string' || peerId === userId) return false;
    const accepted = db.prepare(
      "SELECT 1 FROM contacts WHERE owner_id = ? AND peer_id = ? AND status = 'accepted'",
    ).get(userId, peerId);
    if (!accepted) return false;
    return !db.prepare(
      'SELECT 1 FROM blocks WHERE (owner_id = ? AND peer_id = ?) OR (owner_id = ? AND peer_id = ?)',
    ).get(userId, peerId, peerId, userId);
  };

  socket.on('typing', (payload = {}) => {
    const { to, active } = payload;
    if (canSignal(to)) io.to(`user:${to}`).emit('typing', { from: userId, active: !!active });
  });

  socket.on('call:offer', (payload = {}) => {
    const { to, callId, sdp, mode } = payload;
    if (!canSignal(to) || typeof callId !== 'string' || callId.length > 100 || !sdp) return;
    db.prepare(
      `INSERT INTO calls (id, caller_id, callee_id, mode, status, created_at)
       VALUES (?, ?, ?, ?, 'ringing', ?)
       ON CONFLICT(id) DO UPDATE SET status = 'ringing'`,
    ).run(callId, userId, to, mode === 'video' ? 'video' : 'audio', Date.now());
    io.to(`user:${to}`).emit('call:offer', { from: userId, callId, sdp, mode: mode === 'video' ? 'video' : 'audio' });
  });

  socket.on('call:answer', (payload = {}) => {
    const { to, callId, sdp } = payload;
    if (!canSignal(to) || typeof callId !== 'string' || !sdp) return;
    const call = db.prepare(
      "SELECT 1 FROM calls WHERE id = ? AND caller_id = ? AND callee_id = ? AND status = 'ringing'",
    ).get(callId, to, userId);
    if (!call) return;
    db.prepare("UPDATE calls SET status = 'active' WHERE id = ?").run(callId);
    io.to(`user:${to}`).emit('call:answer', { from: userId, callId, sdp });
  });

  socket.on('call:ice', (payload = {}) => {
    const { to, callId, candidate } = payload;
    if (!canSignal(to) || typeof callId !== 'string' || !candidate) return;
    const call = db.prepare(
      'SELECT 1 FROM calls WHERE id = ? AND ((caller_id = ? AND callee_id = ?) OR (caller_id = ? AND callee_id = ?))',
    ).get(callId, userId, to, to, userId);
    if (!call) return;
    io.to(`user:${to}`).emit('call:ice', { from: userId, callId, candidate });
  });

  socket.on('call:end', (payload = {}) => {
    const { to, callId } = payload;
    if (!canSignal(to) || typeof callId !== 'string') return;
    const result = db.prepare(
      "UPDATE calls SET status = 'ended' WHERE id = ? AND ((caller_id = ? AND callee_id = ?) OR (caller_id = ? AND callee_id = ?))",
    ).run(callId, userId, to, to, userId);
    if (result.changes) io.to(`user:${to}`).emit('call:end', { from: userId, callId });
  });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`m4zk1pl4y api listening on :${port}`));
