import { Router } from 'express';
import { z } from 'zod';
import { db, now } from '../db.js';
import { id } from '../ids.js';
import { b64, randomBytes, verifySignature, isValidPublicKey } from '../crypto.js';
import { requireAuth, signToken, rateLimit } from '../auth.js';

const router = Router();
const TTL = Number(process.env.CHALLENGE_TTL_MS || 120_000);

const handleSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-z0-9_]+$/, 'handle must be lowercase alnum or underscore');

const publicUser = (u) => ({
  id: u.id,
  handle: u.handle,
  displayName: u.display_name,
  publicKey: u.public_key,
  boxPublicKey: u.box_public_key,
  bio: u.bio,
  accent: u.accent,
  lastSeen: u.last_seen,
  createdAt: u.created_at,
});

function issueChallenge(publicKey) {
  const challenge = {
    id: id(),
    public_key: publicKey,
    nonce: b64.encode(randomBytes(32)),
    expires_at: now() + TTL,
  };
  db.prepare(
    'INSERT INTO challenges (id, public_key, nonce, expires_at) VALUES (?, ?, ?, ?)',
  ).run(challenge.id, challenge.public_key, challenge.nonce, challenge.expires_at);
  return challenge;
}

function consumeChallenge(challengeId, publicKey) {
  const row = db.prepare('SELECT * FROM challenges WHERE id = ?').get(challengeId);
  if (!row) return null;
  db.prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);
  if (row.expires_at < now()) return null;
  if (row.public_key !== publicKey) return null;
  return row;
}

router.post('/challenge', rateLimit({ max: 30 }), (req, res) => {
  const parsed = z.object({ publicKey: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });
  if (!isValidPublicKey(parsed.data.publicKey)) {
    return res.status(400).json({ error: 'invalid_public_key' });
  }

  const challenge = issueChallenge(parsed.data.publicKey);
  res.json({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    expiresAt: challenge.expires_at,
    message: `${challenge.id}:${challenge.nonce}`,
  });
});

router.post('/register', rateLimit({ max: 20 }), (req, res) => {
  const parsed = z
    .object({
      handle: handleSchema,
      displayName: z.string().min(1).max(48),
      publicKey: z.string(),
      boxPublicKey: z.string(),
      challengeId: z.string(),
      signature: z.string(),
      accent: z.string().max(9).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
  }
  const body = parsed.data;

  if (!isValidPublicKey(body.publicKey) || !isValidPublicKey(body.boxPublicKey)) {
    return res.status(400).json({ error: 'invalid_public_key' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE handle = ?').get(body.handle)) {
    return res.status(409).json({ error: 'handle_taken' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE public_key = ?').get(body.publicKey)) {
    return res.status(409).json({ error: 'key_registered' });
  }

  const challenge = consumeChallenge(body.challengeId, body.publicKey);
  if (!challenge) return res.status(400).json({ error: 'challenge_invalid' });

  const message = `${challenge.id}:${challenge.nonce}`;
  if (!verifySignature(message, body.signature, body.publicKey)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  const user = {
    id: id(),
    handle: body.handle,
    display_name: body.displayName,
    public_key: body.publicKey,
    box_public_key: body.boxPublicKey,
    bio: '',
    accent: body.accent || '#FFE600',
    last_seen: now(),
    created_at: now(),
  };

  db.prepare(
    `INSERT INTO users (id, handle, display_name, public_key, box_public_key, bio, accent, last_seen, created_at)
     VALUES (@id, @handle, @display_name, @public_key, @box_public_key, @bio, @accent, @last_seen, @created_at)`,
  ).run(user);

  res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
});

router.post('/login', rateLimit({ max: 30 }), (req, res) => {
  const parsed = z
    .object({ challengeId: z.string(), signature: z.string() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const pending = db
    .prepare('SELECT * FROM challenges WHERE id = ?')
    .get(parsed.data.challengeId);
  if (!pending) return res.status(400).json({ error: 'challenge_invalid' });

  const challenge = consumeChallenge(parsed.data.challengeId, pending.public_key);
  if (!challenge) return res.status(400).json({ error: 'challenge_invalid' });

  const message = `${challenge.id}:${challenge.nonce}`;
  if (!verifySignature(message, parsed.data.signature, challenge.public_key)) {
    return res.status(401).json({ error: 'bad_signature' });
  }

  const user = db
    .prepare('SELECT * FROM users WHERE public_key = ?')
    .get(challenge.public_key);
  if (!user) return res.status(404).json({ error: 'unknown_user' });

  res.json({ token: signToken(user.id), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', requireAuth, (req, res) => {
  const parsed = z
    .object({
      displayName: z.string().min(1).max(48).optional(),
      bio: z.string().max(160).optional(),
      accent: z.string().max(9).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  const patch = parsed.data;
  if (patch.displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(patch.displayName, req.user.id);
  }
  if (patch.bio !== undefined) {
    db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(patch.bio, req.user.id);
  }
  if (patch.accent !== undefined) {
    db.prepare('UPDATE users SET accent = ? WHERE id = ?').run(patch.accent, req.user.id);
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: publicUser(user) });
});

router.post('/location', requireAuth, (req, res) => {
  const parsed = z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_body' });

  // Coarsen to ~110m so exact positions aren't exposed.
  const lat = Math.round(parsed.data.lat * 1000) / 1000;
  const lng = Math.round(parsed.data.lng * 1000) / 1000;

  db.prepare('UPDATE users SET lat = ?, lng = ?, location_at = ? WHERE id = ?').run(
    lat, lng, now(), req.user.id,
  );
  res.json({ ok: true, lat, lng });
});

router.delete('/me', requireAuth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default router;
