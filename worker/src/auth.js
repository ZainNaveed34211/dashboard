import { checkRateLimit, fail } from './verify.js';
import { decryptText, encryptText, generateBackupCode, generatePassword, generateTotpSecret, hashPassword, randomToken, sha256Hex, verifyPassword, verifyTotp } from './crypto.js';
import { canInvite } from './permissions.js';
import { DASHBOARD_SESSION_TTL_SEC, LOGIN_STEP_TTL_SEC, deleteLoginStepSessions, getSession, mintSession } from './sessions.js';

function nowIso() {
  return new Date().toISOString();
}

export async function ownerEntitlement(db, ownerUserId) {
  const row = await db.prepare('SELECT * FROM entitlements WHERE user_id = ?').bind(ownerUserId).first();
  if (!row) return { plan: 'free', status: 'inactive' };
  return { plan: row.plan, status: row.status };
}

async function entitledCompanies(db, memberUserId) {
  const res = await db.prepare("SELECT * FROM company_members WHERE user_id = ? AND status = 'active'").bind(memberUserId).all();
  const memberships = (res && res.results) || [];
  const companies = [];
  for (const membership of memberships) {
    const company = await db.prepare('SELECT * FROM companies WHERE id = ?').bind(membership.company_id).first();
    if (!company) continue;
    const entitlement = await ownerEntitlement(db, company.owner_user_id);
    if (entitlement.plan === 'max' && entitlement.status === 'active') {
      companies.push({ id: company.id, name: company.name, role: membership.role });
    }
  }
  return companies;
}

function deniedWith(status, message, data) {
  const err = new Error(message);
  err.status = status;
  err.data = data;
  throw err;
}

export async function sessionFromAssertion(env, auth) {
  const companies = await entitledCompanies(env.DB, auth.userId);
  if (companies.length === 0) {
    const own = await ownerEntitlement(env.DB, auth.userId);
    deniedWith(403, 'A Max subscription is required.', { plan: own.plan, status: own.status });
  }
  const minted = await mintSession(env.DB, auth.userId, 'owner', 'session', null, DASHBOARD_SESSION_TTL_SEC);
  return { ok: true, sessionToken: minted.token, userType: 'owner', userId: auth.userId, companies };
}

export async function createInvite(env, session, data) {
  if (!session || session.purpose !== 'session') fail(403, 'Only company owners and admins can invite members.');
  const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(data.companyId).first();
  if (!company) fail(404, 'Not found.');
  const membership = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(company.id, session.user_id).first();
  if (!membership) fail(404, 'Not found.');
  const entitlement = await ownerEntitlement(env.DB, company.owner_user_id);
  if (entitlement.plan !== 'max' || entitlement.status !== 'active') fail(403, 'A Max subscription is required.');
  if (!canInvite(membership.role, data.role)) fail(403, 'This role cannot invite members with that role.');
  if (data.departmentId) {
    const department = await env.DB.prepare('SELECT * FROM departments WHERE id = ? AND company_id = ?').bind(data.departmentId, company.id).first();
    if (!department) fail(400, 'Invalid request.');
  }
  const allowedInvite = await checkRateLimit(env.DB, session.user_id, 'invitations', 20, 3600);
  if (!allowedInvite) fail(429, 'Too many invitations. Try again later.');
  const email = data.email.toLowerCase();
  const existing = await env.DB.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind(email).first();
  if (existing) fail(400, 'Invitation could not be created.');
  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const passwordEnc = await encryptText(env.DASH_ENCRYPTION_KEY, password);
  const userId = crypto.randomUUID();
  const createdAt = nowIso();
  await env.DB.prepare('INSERT INTO dashboard_users (id, email, password_hash, mfa_secret_enc, mfa_enabled, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(userId, email, passwordHash, '', 0, 'pending', createdAt, createdAt).run();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const inviteId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO invitations (id, company_id, email, role, department_id, token_hash, password_enc, expires_at, used_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(inviteId, company.id, email, data.role, data.departmentId || null, tokenHash, passwordEnc, expiresAt, null, session.user_id, createdAt).run();
  await env.DB.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), company.id, session.user_id, 'invite_created', 'invitation', inviteId, '', createdAt).run();
  return { ok: true, inviteLink: 'https://dash.kluzar.com/invite?token=' + token };
}

export async function claimInvite(env, data) {
  const tokenHash = await sha256Hex(data.token);
  const invite = await env.DB.prepare('SELECT * FROM invitations WHERE token_hash = ?').bind(tokenHash).first();
  if (!invite || invite.used_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) fail(404, 'Not found.');
  const user = await env.DB.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind(invite.email).first();
  if (!user || user.status !== 'pending') fail(404, 'Not found.');
  const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(invite.company_id).first();
  if (!company) fail(404, 'Not found.');
  const password = await decryptText(env.DASH_ENCRYPTION_KEY, invite.password_enc);
  return { ok: true, password, email: invite.email, companyName: company.name, role: invite.role };
}

async function loadLoginStepSession(env, loginToken) {
  const session = await getSession(env.DB, loginToken);
  if (!session || session.purpose !== 'login-step') fail(401, 'Sign-in required.');
  const user = await env.DB.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(session.user_id).first();
  if (!user) fail(401, 'Sign-in required.');
  return { session, user };
}

export async function memberLoginStep1(env, data) {
  const email = data.email.toLowerCase();
  const allowedStep = await checkRateLimit(env.DB, 'login-step:' + email, 'member-login-step1', 20, 3600);
  if (!allowedStep) fail(429, 'Too many login attempts. Try again later.');
  const user = await env.DB.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind(email).first();
  if (!user || user.status === 'suspended') fail(401, 'Invalid email or password.');
  const passwordOk = await verifyPassword(data.password, user.password_hash);
  if (!passwordOk) fail(401, 'Invalid email or password.');
  const next = user.status === 'pending' || user.mfa_enabled !== 1 ? 'setup' : 'mfa';
  await deleteLoginStepSessions(env.DB, user.id);
  const minted = await mintSession(env.DB, user.id, 'member', 'login-step', null, LOGIN_STEP_TTL_SEC);
  return { ok: true, loginToken: minted.token, next };
}

export async function memberLoginSetup(env, data) {
  const loaded = await loadLoginStepSession(env, data.loginToken);
  if (loaded.user.status === 'suspended') fail(401, 'Sign-in required.');
  if (loaded.user.mfa_enabled === 1) fail(400, 'Invalid request.');
  const secret = generateTotpSecret();
  const secretEnc = await encryptText(env.DASH_ENCRYPTION_KEY, secret);
  await env.DB.prepare('UPDATE dashboard_users SET mfa_secret_enc = ?, updated_at = ? WHERE id = ?').bind(secretEnc, nowIso(), loaded.user.id).run();
  const backupCodes = [];
  for (let i = 0; i < 8; i++) backupCodes.push(generateBackupCode());
  await env.DB.prepare('DELETE FROM dashboard_backup_codes WHERE user_id = ?').bind(loaded.user.id).run();
  for (const code of backupCodes) {
    const codeHash = await sha256Hex(code);
    await env.DB.prepare('INSERT INTO dashboard_backup_codes (id, user_id, code_hash, used_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), loaded.user.id, codeHash, null, nowIso()).run();
  }
  const label = encodeURIComponent('Kluzar Dashboard:' + loaded.user.email);
  const otpauthUrl = 'otpauth://totp/' + label + '?secret=' + secret + '&issuer=' + encodeURIComponent('Kluzar') + '&digits=6&period=30';
  return { ok: true, otpauthUrl, secret, backupCodes };
}

export async function memberLoginSetupVerify(env, data) {
  const loaded = await loadLoginStepSession(env, data.loginToken);
  const allowedVerify = await checkRateLimit(env.DB, 'login-verify:' + loaded.user.email, 'member-login-verify', 20, 3600);
  if (!allowedVerify) fail(429, 'Too many login attempts. Try again later.');
  if (loaded.user.status === 'suspended') fail(401, 'Sign-in required.');
  if (loaded.user.mfa_enabled === 1) fail(400, 'Invalid request.');
  if (!loaded.user.mfa_secret_enc) fail(400, 'Invalid request.');
  const secret = await decryptText(env.DASH_ENCRYPTION_KEY, loaded.user.mfa_secret_enc);
  const valid = await verifyTotp(secret, data.totpCode, Date.now());
  if (!valid) fail(401, 'Invalid code.');
  if (loaded.user.status === 'pending') {
    const invite = await env.DB.prepare('SELECT * FROM invitations WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL').bind(loaded.user.email).first();
    if (!invite) fail(404, 'Not found.');
    const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(invite.company_id).first();
    if (!company) fail(404, 'Not found.');
    const entitlement = await ownerEntitlement(env.DB, company.owner_user_id);
    if (entitlement.plan !== 'max' || entitlement.status !== 'active') fail(403, 'A Max subscription is required.');
    const claimed = await env.DB.prepare('UPDATE invitations SET used_at = ?, password_enc = ? WHERE id = ? AND used_at IS NULL').bind(nowIso(), null, invite.id).run();
    const changes = claimed && claimed.meta ? claimed.meta.changes : 0;
    if (!changes) fail(404, 'Not found.');
    const existingMember = await env.DB.prepare('SELECT * FROM company_members WHERE company_id = ? AND user_id = ?').bind(company.id, loaded.user.id).first();
    if (existingMember) {
      await env.DB.prepare("UPDATE company_members SET role = ?, department_id = ?, status = ?, invited_by = ?, joined_at = ? WHERE company_id = ? AND user_id = ?").bind(invite.role, invite.department_id, 'active', invite.created_by, nowIso(), company.id, loaded.user.id).run();
    } else {
      await env.DB.prepare('INSERT INTO company_members (company_id, user_id, role, department_id, status, invited_by, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(company.id, loaded.user.id, invite.role, invite.department_id, 'active', invite.created_by, nowIso()).run();
    }
  }
  await env.DB.prepare('UPDATE dashboard_users SET mfa_enabled = ?, status = ?, updated_at = ? WHERE id = ?').bind(1, 'active', nowIso(), loaded.user.id).run();
  const companies = await entitledCompanies(env.DB, loaded.user.id);
  if (companies.length === 0) fail(403, 'A Max subscription is required.');
  await deleteLoginStepSessions(env.DB, loaded.user.id);
  const minted = await mintSession(env.DB, loaded.user.id, 'member', 'session', null, DASHBOARD_SESSION_TTL_SEC);
  return { ok: true, sessionToken: minted.token, userType: 'member', userId: loaded.user.id, companies };
}

export async function memberLoginVerify(env, data) {
  const loaded = await loadLoginStepSession(env, data.loginToken);
  const allowedVerify = await checkRateLimit(env.DB, 'login-verify:' + loaded.user.email, 'member-login-verify', 20, 3600);
  if (!allowedVerify) fail(429, 'Too many login attempts. Try again later.');
  if (loaded.user.status !== 'active' || loaded.user.mfa_enabled !== 1) deniedWith(403, 'Finish your invitation setup first.', { setupRequired: true });
  if (!loaded.user.mfa_secret_enc) fail(401, 'Invalid code.');
  let backupHash = null;
  let codeOk = false;
  if (/^\d{6}$/.test(data.code)) {
    const secret = await decryptText(env.DASH_ENCRYPTION_KEY, loaded.user.mfa_secret_enc);
    codeOk = await verifyTotp(secret, data.code, Date.now());
  } else {
    const normalized = data.code.toUpperCase().replace(/[\s-]/g, '');
    backupHash = await sha256Hex(normalized);
    const row = await env.DB.prepare('SELECT * FROM dashboard_backup_codes WHERE code_hash = ?').bind(backupHash).first();
    codeOk = !!row && !row.used_at && row.user_id === loaded.user.id;
  }
  if (!codeOk) fail(401, 'Invalid code.');
  const companies = await entitledCompanies(env.DB, loaded.user.id);
  if (companies.length === 0) fail(403, 'A Max subscription is required.');
  if (backupHash) {
    const consumed = await env.DB.prepare('UPDATE dashboard_backup_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL').bind(nowIso(), backupHash).run();
    const changes = consumed && consumed.meta ? consumed.meta.changes : 0;
    if (!changes) fail(401, 'Invalid code.');
  }
  await deleteLoginStepSessions(env.DB, loaded.user.id);
  const minted = await mintSession(env.DB, loaded.user.id, 'member', 'session', null, DASHBOARD_SESSION_TTL_SEC);
  return { ok: true, sessionToken: minted.token, userType: 'member', userId: loaded.user.id, companies };
}

export async function me(env, session) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const companies = await entitledCompanies(env.DB, session.user_id);
  if (companies.length === 0) fail(403, 'A Max subscription is required.');
  return { ok: true, userType: session.user_type, userId: session.user_id, companies };
}
