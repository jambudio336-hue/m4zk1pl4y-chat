import { Router } from 'express';
import { db, now } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();
router.use(requireAuth);

const STALE_MS = 30 * 60 * 1000;

function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

router.get('/', (req, res) => {
  const me = req.user;
  if (me.lat == null || me.lng == null) {
    return res.json({ users: [], reason: 'no_location' });
  }

  const radius = Math.min(Number(req.query.radius || 2000), 20_000);
  const cutoff = now() - STALE_MS;

  const rows = db
    .prepare(
      `SELECT * FROM users
       WHERE id != ? AND lat IS NOT NULL AND lng IS NOT NULL AND location_at > ?
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.owner_id = ? AND b.peer_id = users.id)`,
    )
    .all(me.id, cutoff, me.id);

  const users = rows
    .map((u) => ({
      id: u.id,
      handle: u.handle,
      displayName: u.display_name,
      accent: u.accent,
      bio: u.bio,
      boxPublicKey: u.box_public_key,
      lastSeen: u.last_seen,
      distance: Math.round(haversine({ lat: me.lat, lng: me.lng }, { lat: u.lat, lng: u.lng })),
    }))
    .filter((u) => u.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 100);

  res.json({ users, radius });
});

export default router;
