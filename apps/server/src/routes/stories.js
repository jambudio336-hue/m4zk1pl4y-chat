import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { id } from '../ids.js';
import { requireAuth, rateLimit } from '../auth.js';

const router = Router();
router.use(requireAuth);

const TTL = 24 * 60 * 60 * 1000;

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*, u.handle, u.display_name, u.accent,
              COALESCE(sr.nonce, s.nonce) AS viewer_nonce,
              COALESCE(sr.ciphertext, s.ciphertext) AS viewer_ciphertext,
              (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id) AS view_count,
              (SELECT COUNT(*) FROM story_views v WHERE v.story_id = s.id AND v.user_id = ?) AS seen
       FROM stories s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN story_recipients sr ON sr.story_id = s.id AND sr.user_id = ?
       WHERE s.expires_at > ?
         AND (
           s.user_id = ?
           OR EXISTS (
             SELECT 1
             FROM story_recipients sr2
             JOIN contacts c ON c.owner_id = ? AND c.peer_id = s.user_id AND c.status = 'accepted'
             WHERE sr2.story_id = s.id AND sr2.user_id = ?
           )
         )
       ORDER BY s.created_at DESC`,
    )
    .all(req.user.id, req.user.id, now(), req.user.id, req.user.id, req.user.id);

  res.json({
    stories: rows.map((s) => ({
      id: s.id,
      userId: s.user_id,
      handle: s.handle,
      displayName: s.display_name,
      accent: s.accent,
      nonce: s.viewer_nonce,
      ciphertext: s.viewer_ciphertext,
      kind: s.kind,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
      viewCount: s.view_count,
      seen: s.seen > 0,
      mine: s.user_id === req.user.id,
    })),
  });
});

router.post('/', rateLimit({ max: 30 }), (req, res) => {
  const parsed = z
    .object({
      nonce: z.string().max(64),
      ciphertext: z.string().max(200_000),
      recipients: z.array(z.object({
        userId: z.string(),
        nonce: z.string().max(64),
        ciphertext: z.string().max(200_000),
      })).max(500).optional(),
      kind: z.enum(['text', 'image']).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const story = {
    id: id(),
    user_id: req.user.id,
    nonce: parsed.data.nonce,
    ciphertext: parsed.data.ciphertext,
    kind: parsed.data.kind || 'text',
    expires_at: now() + TTL,
    created_at: now(),
  };

  db.prepare(
    `INSERT INTO stories (id, user_id, nonce, ciphertext, kind, expires_at, created_at)
     VALUES (@id, @user_id, @nonce, @ciphertext, @kind, @expires_at, @created_at)`,
  ).run(story);

  const insertRecipient = db.prepare(
    'INSERT INTO story_recipients (story_id, user_id, nonce, ciphertext) VALUES (?, ?, ?, ?)',
  );
  const insertRecipients = db.transaction((recipients) => {
    const seen = new Set();
    for (const recipient of recipients) {
      if (seen.has(recipient.userId) || recipient.userId === req.user.id) continue;
      seen.add(recipient.userId);
      const accepted = db.prepare(
        "SELECT 1 FROM contacts WHERE owner_id = ? AND peer_id = ? AND status = 'accepted'",
      ).get(req.user.id, recipient.userId);
      if (!accepted) continue;
      const blocked = db.prepare(
        'SELECT 1 FROM blocks WHERE (owner_id = ? AND peer_id = ?) OR (owner_id = ? AND peer_id = ?)',
      ).get(req.user.id, recipient.userId, recipient.userId, req.user.id);
      if (blocked) continue;
      insertRecipient.run(story.id, recipient.userId, recipient.nonce, recipient.ciphertext);
    }
  });
  insertRecipients(parsed.data.recipients || []);

  res.status(201).json({ id: story.id, expiresAt: story.expires_at });
});

router.post('/:storyId/view', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.storyId);
  if (!story || story.expires_at <= now()) return res.status(404).json({ error: 'not_found' });
  if (story.user_id === req.user.id) return res.json({ ok: true });
  const allowed = db.prepare(
    "SELECT 1 FROM story_recipients WHERE story_id = ? AND user_id = ?",
  ).get(story.id, req.user.id);
  if (!allowed) return res.status(403).json({ error: 'story_not_shared' });

  db.prepare(
    'INSERT OR IGNORE INTO story_views (story_id, user_id, created_at) VALUES (?, ?, ?)',
  ).run(story.id, req.user.id, now());

  res.json({ ok: true });
});

router.delete('/:storyId', (req, res) => {
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(req.params.storyId);
  if (!story) return res.status(404).json({ error: 'not_found' });
  if (story.user_id !== req.user.id) return res.status(403).json({ error: 'forbidden' });

  db.prepare('DELETE FROM stories WHERE id = ?').run(story.id);
  res.json({ ok: true });
});

export default router;
