import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { id } from '../ids.js';
import { requireAuth, rateLimit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const shape = (m) => ({
  id: m.id,
  senderId: m.sender_id,
  recipientId: m.recipient_id,
  nonce: m.nonce,
  ciphertext: m.ciphertext,
  kind: m.kind,
  createdAt: m.created_at,
  readAt: m.read_at,
});

router.get('/:peerId', (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 200);
  const before = Number(req.query.before || Date.now() + 1);

  const rows = db
    .prepare(
      `SELECT * FROM messages
       WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
         AND created_at < ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(req.user.id, req.params.peerId, req.params.peerId, req.user.id, before, limit);

  res.json({ messages: rows.reverse().map(shape) });
});

router.post('/', rateLimit({ max: 240 }), (req, res) => {
  const parsed = z
    .object({
      to: z.string(),
      nonce: z.string().max(64),
      ciphertext: z.string().max(100_000),
      kind: z.enum(['text', 'image', 'voice']).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { to, nonce, ciphertext, kind } = parsed.data;
  if (to === req.user.id) return res.status(400).json({ error: 'self' });
  if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(to)) {
    return res.status(404).json({ error: 'user_not_found' });
  }
  const connected = db.prepare(
    "SELECT 1 FROM contacts WHERE owner_id = ? AND peer_id = ? AND status = 'accepted'",
  ).get(req.user.id, to);
  if (!connected) return res.status(403).json({ error: 'contact_not_accepted' });
  const blocked = db.prepare(
    'SELECT 1 FROM blocks WHERE (owner_id = ? AND peer_id = ?) OR (owner_id = ? AND peer_id = ?)',
  ).get(req.user.id, to, to, req.user.id);
  if (blocked) return res.status(403).json({ error: 'contact_blocked' });
if (db.prepare('SELECT 1 FROM blocks WHERE owner_id = ? AND peer_id = ?').get(to, req.user.id)) {
    return res.status(403).json({ error: 'blocked_by_recipient' });
  }
  
  const message = {
    id: id(),
    sender_id: req.user.id,
    recipient_id: to,
    nonce,
    ciphertext,
    kind: kind || 'text',
    created_at: now(),
  };

  db.prepare(
    `INSERT INTO messages (id, sender_id, recipient_id, nonce, ciphertext, kind, created_at)
     VALUES (@id, @sender_id, @recipient_id, @nonce, @ciphertext, @kind, @created_at)`,
  ).run(message);

  const payload = shape(message);
  const io = req.app.get('io');
  io?.to(`user:${to}`).emit('message:new', payload);
  io?.to(`user:${req.user.id}`).emit('message:new', payload);

  res.status(201).json({ message: payload });
});

router.post('/:peerId/read', (req, res) => {
  db.prepare(
    `UPDATE messages SET read_at = ?
     WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL`,
  ).run(now(), req.user.id, req.params.peerId);

  const io = req.app.get('io');
  io?.to(`user:${req.params.peerId}`).emit('message:read', { by: req.user.id, at: now() });

  res.json({ ok: true });
});

router.delete('/:messageId', (req, res) => {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.messageId);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.sender_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  db.prepare('DELETE FROM messages WHERE id = ?').run(row.id);
  const io = req.app.get('io');
  io?.to(`user:${row.recipient_id}`).emit('message:deleted', { id:  row.id });
  res.json({ ok: true });
});
export default router;
