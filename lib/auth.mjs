import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { migrate } from './migrations.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const scopes = ['admin', 'worker:outreach'];
const sessionLifetime = 8 * 60 * 60 * 1000;

export function openKeys(path) {
  const db = new DatabaseSync(path);
  try {
    migrate(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    create(id, scope) {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !scopes.includes(scope)) {
        throw new Error(
          'Podaj identyfikator (1–128 liter, cyfr, _ lub -) i zakres admin albo worker:outreach.'
        );
      }
      const token = `hos_${randomBytes(32).toString('base64url')}`;
      const result = db
        .prepare('INSERT OR IGNORE INTO api_keys (id, key_hash, scope) VALUES (?, ?, ?)')
        .run(id, hash(token), scope);
      if (!result.changes) {
        const existing = db.prepare('SELECT scope FROM api_keys WHERE id=?').get(id);
        if (existing.scope !== scope) {
          throw new Error('Identyfikator ma już inny zakres.');
        }
        return null;
      }
      return token;
    },
    revoke(id) {
      db.prepare(
        "UPDATE api_keys SET revoked_at=COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id=?"
      ).run(id);
    },
    authenticate(token) {
      if (typeof token !== 'string' || token.length > 128) {
        return null;
      }
      return (
        db
          .prepare('SELECT id, scope FROM api_keys WHERE key_hash=? AND revoked_at IS NULL')
          .get(hash(token)) || null
      );
    },
    close: () => db.close(),
  };
}

export function createSessions(password, now = Date.now) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw new Error('Ustaw HIREOS_RECRUITER_PASSWORD (12–1024 znaki).');
  }
  const salt = randomBytes(16);
  const passwordHash = scryptSync(password, salt, 64);
  const secret = randomBytes(32);
  const sessions = new Map();
  const requests = new Map();
  let windowEnd = 0;
  let attempts = 0;
  const tokenFor = (key) => createHmac('sha256', secret).update(key).digest('base64url');
  function prune() {
    for (const [key, expires] of sessions) {
      if (expires <= now()) {
        sessions.delete(key);
      }
    }
    for (const [key, entry] of requests) {
      if (entry.expires <= now()) {
        requests.delete(key);
      }
    }
  }
  return {
    login(input, key) {
      prune();
      if (typeof key !== 'string' || !key || key.length > 128) {
        return { status: 400 };
      }
      if (typeof input !== 'string' || input.length > 1024) {
        return { status: 400 };
      }
      if (now() >= windowEnd) {
        attempts = 0;
        windowEnd = now() + 15 * 60 * 1000;
      }
      if (attempts >= 5) {
        return { status: 429 };
      }
      const fingerprint = createHmac('sha256', secret).update(input).digest('hex');
      const previous = requests.get(key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) {
          attempts += 1;
          return { status: 409 };
        }
        const token = tokenFor(previous.nonce);
        return sessions.has(hash(token)) ? { status: 200, token } : { status: 401 };
      }
      attempts += 1;
      if (!timingSafeEqual(scryptSync(input, salt, 64), passwordHash)) {
        return { status: 401 };
      }
      const nonce = randomBytes(32).toString('hex');
      const token = tokenFor(nonce);
      const expires = now() + sessionLifetime;
      sessions.clear();
      sessions.set(hash(token), expires);
      requests.set(key, { fingerprint, expires, nonce });
      return { status: 200, token };
    },
    valid(token) {
      prune();
      return typeof token === 'string' && sessions.has(hash(token));
    },
    logout(token) {
      if (typeof token === 'string') {
        sessions.delete(hash(token));
      }
    },
  };
}
