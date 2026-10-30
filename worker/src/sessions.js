import { randomToken, sha256Hex } from './crypto.js';

export const DASHBOARD_SESSION_TTL_SEC = 172800;
export const LOGIN_STEP_TTL_SEC = 600;

export async function mintSession(db, userId, userType, purpose, companyId, ttlSec) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSec * 1000).toISOString();
  await db.prepare('INSERT INTO dashboard_sessions (id, user_id, user_type, token_hash, purpose, company_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), userId, userType, tokenHash, purpose, companyId, expiresAt, now.toISOString()).run();
  return { token, expiresAt };
}

export async function getSession(db, token) {
  if (typeof token !== 'string' || token.length < 16) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare('SELECT * FROM dashboard_sessions WHERE token_hash = ?').bind(tokenHash).first();
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  return row;
}

export async function deleteSession(db, token) {
  if (typeof token !== 'string' || token.length < 16) return;
  const tokenHash = await sha256Hex(token);
  await db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function deleteLoginStepSessions(db, userId) {
  await db.prepare('DELETE FROM dashboard_sessions WHERE user_id = ? AND purpose = ?').bind(userId, 'login-step').run();
}

export async function deleteUserSessions(db, userId) {
  await db.prepare('DELETE FROM dashboard_sessions WHERE user_id = ?').bind(userId).run();
}
