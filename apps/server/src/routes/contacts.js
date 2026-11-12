import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { id } from '../ids.js';
import { requireAuth, rateLimit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const peerView = (u) => ({
  id: u.id,
  handle: u.handle,
  displayName: u.display_name,
  boxPublicKey: u.box_public_key,
  accent: u.accent,
  bio: u.bio,
  lastSeen: u.last_seen,
});

const listQuery = `
  SELECT u.*, c.id AS contact_id, c.status AS contact_status, c.created_at AS contact_created
  FROM contacts c
  JOIN users u ON u.id = c.peer_id
  WHERE c.owner_id = ?
  ORDER BY c.created_at DESC
`;

router.get('/', (req, res) => {
  const rows = db.prepare(listQuery).all(req.user.id);
  res.json({
    contacts: rows.map((r) => ({
      contactId: r.contact_id,
      status: r.contact_status,
      createdAt: r.contact_created,
      peer: peerView(r),
    })),
  });
});

router.post('/', rateLimit({ max: 40 }), (req, res) => {
  const parsed = z.object({ handle: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const handle = parsed.data.handle.replace(/^@/, '').toLowerCase();
  const peer = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
  if (!peer) return res.status(404).json({ error: 'user_not_found' });
  if (peer.id === req.user.id) return res.status(400).json({ error: 'self' });

  const existing = db
    .prepare('SELECT * FROM contacts WHERE owner_id = ? AND peer_id = ?')
    .get(req.user.id, peer.id);
  if (existing) {
    return res.json({ contactId: existing.id, status: existing.status, peer: peerView(peer) });
  }

  const contactId = id();
  db.prepare(
    'INSERT INTO contacts (id, owner_id, peer_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(contactId, req.user.id, peer.id, 'pending', now());

  const reciprocal = db
    .prepare('SELECT * FROM contacts WHERE owner_id = ? AND peer_id = ?')
    .get(peer.id, req.user.id);
  if (reciprocal) {
    db.prepare("UPDATE contacts SET status = 'accepted' WHERE id IN (?, ?)").run(
      contactId, reciprocal.id,
    );
  }

  const io = req.app.get('io');
  io?.to(`user:${peer.id}`).emit('contact:request', {
    contactId,
    peer: peerView(req.user),
  });

  res.status(201).json({ contactId, status: reciprocal ? 'accepted' : 'pending', peer: peerView(peer) });
});

router.patch('/:contactId/accept', (req, res) => {
  const row = db
    .prepare('SELECT * FROM contacts WHERE id = ? AND peer_id = ?')
    .get(req.params.contactId, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  db.prepare("UPDATE contacts SET status = 'accepted' WHERE id = ?").run(row.id);
  db.prepare(
    "UPDATE contacts SET status = 'accepted' WHERE owner_id = ? AND peer_id = ?",
  ).run(req.user.id, row.owner_id);

  const io = req.app.get('io');
  io?.to(`user:${row.owner_id}`).emit('contact:accepted', { peerId: req.user.id });

  res.json({ ok: true });
});

router.delete('/:contactId', (req, res) => {
  const row = db
    .prepare('SELECT * FROM contacts WHERE id = ? AND owner_id = ?')
    .get(req.params.contactId, req.user.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  db.prepare('DELETE FROM contacts WHERE (owner_id = ? AND peer_id = ?) OR (owner_id = ? AND peer_id = ?)')
    .run(req.user.id, row.peer_id, row.peer_id, req.user.id);

  res.json({ ok: true });
});

export default router;
