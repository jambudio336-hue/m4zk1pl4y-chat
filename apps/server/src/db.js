import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const file = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'm4zk1pl4y.db');
fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  handle         TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  public_key     TEXT NOT NULL,
  box_public_key TEXT NOT NULL,
  bio            TEXT NOT NULL DEFAULT '',
  accent         TEXT NOT NULL DEFAULT '#FFE600',
  lat            REAL,
  lng            REAL,
  location_at    INTEGER,
  last_seen      INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id         TEXT PRIMARY KEY,
  public_key TEXT NOT NULL,
  nonce      TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE (owner_id, peer_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY,
  sender_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce        TEXT NOT NULL,
  ciphertext   TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'text',
  created_at   INTEGER NOT NULL,
  read_at      INTEGER
);

CREATE TABLE IF NOT EXISTS stories (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce      TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'text',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS story_views (
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (story_id, user_id)
);

CREATE TABLE IF NOT EXISTS calls (
  id         TEXT PRIMARY KEY,
  caller_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL DEFAULT 'audio',
  status     TEXT NOT NULL DEFAULT 'ringing',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages (sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages (recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_stories_expiry ON stories (expires_at);
`);

export const now = () => Date.now();
