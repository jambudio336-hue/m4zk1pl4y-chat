import jwt from 'jsonwebtoken';
import { db } from './db.js';

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';
const TTL = '30d';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: TTL });
}

export function readToken(token) {
  try {
    return jwt.verify(token, SECRET).sub;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  const userId = readToken(token);
  if (!userId) return res.status(401).json({ error: 'invalid_token' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(401).json({ error: 'unknown_user' });

  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(Date.now(), user.id);
  req.user = user;
  next();
}

/** Fixed-window in-memory rate limiter. */
export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const at = Date.now();
    const entry = hits.get(key) ?? { count: 0, reset: at + windowMs };
    if (at > entry.reset) {
      entry.count = 0;
      entry.reset = at + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'rate_limited' });
    next();
  };
}
