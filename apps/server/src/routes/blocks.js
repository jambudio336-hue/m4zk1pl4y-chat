import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

const peerView = (u) => ({
  id: u.id,
  handle: u.handle,
  displayName: u.display_name,
  accent: u.accent,
});

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.*, b.created_at AS blocked_at
       FROM blocks b JOIN users u ON u.id = b.peer_id
       WHERE b.owner_id = ? ORDER BY b.created_at DESC`,
    )
    .all(req.user.id);

  res.json({ blocked: rows.map((r) => ({ ...peerView(r), blockedAt: r.blocked_at })) });
});

router.post('/', (req, res) => {
  const parsed = z.object({ handle: z.string().optional(), userId: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const { handle, userId } = parsed.data;
  if (!handle && !userId) return res.status(400).json({ error: 'missing_target' });

  const peer = userId
    ? db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
    : db.prepare('SELECT * FROM users WHERE handle = ?').get(handle.replace(/^@/, '').toLowerCase());

  if (!peer) return res.status(404).json({ error: 'user_not_found' });
  if (peer.id === req.user.id) return res.status(400).json({ error: 'self' });

  db.prepare('INSERT OR IGNORE INTO blocks (owner_id, peer_id, created_at) VALUES (?, ?, ?)')
    .run(req.user.id, peer.id, now());

  const io = req.app.get('io');
  io?.to(`user:${peer.id}`).emit('block:changed', { by: req.user.id, blocked: true });

  res.status(201).json({ blocked: peerView(peer) });
});

router.delete('/:peerId', (req, res) => {
  db.prepare('DELETE FROM blocks WHERE owner_id = ? AND peer_id = ?')
    .run(req.user.id, req.params.peerId);
  res.json({ ok: true });
});

export default router;
