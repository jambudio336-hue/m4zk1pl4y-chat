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

  socket.on('typing', ({ to, active }) => {
    if (to) io.to(`user:${to}`).emit('typing', { from: userId, active: !!active });
  });

  socket.on('call:offer', ({ to, callId, sdp, mode }) => {
    io.to(`user:${to}`).emit('call:offer', { from: userId, callId, sdp, mode });
  });

  socket.on('call:answer', ({ to, callId, sdp }) => {
    io.to(`user:${to}`).emit('call:answer', { from: userId, callId, sdp });
  });

  socket.on('call:ice', ({ to, callId, candidate }) => {
    io.to(`user:${to}`).emit('call:ice', { from: userId, callId, candidate });
  });

  socket.on('call:end', ({ to, callId }) => {
    io.to(`user:${to}`).emit('call:end', { from: userId, callId });
    if (callId) {
      db.prepare("UPDATE calls SET status = 'ended' WHERE id = ?").run(callId);
    }
  });
});

const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`m4zk1pl4y api listening on :${port}`));
