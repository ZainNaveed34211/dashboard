import { generateKeyPairSync, sign } from 'node:crypto';
import handler from '../worker/src/index.js';
import { ShimDB } from './d1shim.mjs';
import { encryptText, hashPassword, sha256Hex, totpCode } from '../worker/src/crypto.js';
import { checkRateLimit } from '../worker/src/verify.js';

const DASH_ORIGIN = 'https://dash.kluzar.com';
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();
const MEMBER_SECRET = 'JBSWY3DPEHPK3PXP';
const MEMBER_PASSWORD = 'MemberPass123!';
const PENDING_PASSWORD = 'PendingPass123!';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS ' + name);
  } catch (e) {
    failed++;
    console.log('FAIL ' + name + ': ' + (e && e.message ? e.message : e));
  }
}

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function ok(value, label) {
  if (!value) throw new Error(label + ': expected truthy value');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function makeEnv() {
  const db = new ShimDB();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const env = { DB: db, DASH_ASSERTION_PUBLIC_KEY: JSON.stringify(publicJwk), DASH_ENCRYPTION_KEY: 'local-test-encryption-key-only' };
  const users = [
    ['kluzar-user-owner-a', 'owner-a'],
    ['kluzar-user-owner-b', 'owner-b'],
    ['kluzar-user-starter', 'starter'],
    ['kluzar-user-growth', 'growth'],
    ['kluzar-user-expired', 'expired'],
  ];
  for (const [id] of users) db.insert('users', { id, status: 'active' });
  const sids = [
    ['sid-owner-a', 'kluzar-user-owner-a'],
    ['sid-owner-b', 'kluzar-user-owner-b'],
    ['sid-starter', 'kluzar-user-starter'],
    ['sid-growth', 'kluzar-user-growth'],
    ['sid-expired', 'kluzar-user-expired'],
    ['sid-old', 'kluzar-user-owner-a'],
  ];
  for (const [id, userId] of sids) {
    db.insert('sessions', { id, user_id: userId, expires_at: id === 'sid-old' ? PAST : FUTURE });
  }
  db.insert('entitlements', { user_id: 'kluzar-user-owner-a', plan: 'max', status: 'active' });
  db.insert('entitlements', { user_id: 'kluzar-user-owner-b', plan: 'max', status: 'active' });
  db.insert('entitlements', { user_id: 'kluzar-user-starter', plan: 'free', status: 'active' });
  db.insert('entitlements', { user_id: 'kluzar-user-growth', plan: 'growth', status: 'active' });
  db.insert('entitlements', { user_id: 'kluzar-user-expired', plan: 'max', status: 'expired' });
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('companies', { id: 'comp-b', owner_user_id: 'kluzar-user-owner-b', name: 'Beta Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('companies', { id: 'comp-expired', owner_user_id: 'kluzar-user-expired', name: 'Expired Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-a', user_id: 'kluzar-user-owner-a', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-b', user_id: 'kluzar-user-owner-b', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-expired', user_id: 'kluzar-user-expired', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  db.insert('departments', { id: 'dept-a1', company_id: 'comp-a', name: 'Dept A1', manager_user_id: null, created_at: FUTURE });
  const memberHash = await hashPassword(MEMBER_PASSWORD);
  const memberSecretEnc = await encryptText(env.DASH_ENCRYPTION_KEY, MEMBER_SECRET);
  db.insert('dashboard_users', { id: 'dash-member-a', email: 'membera@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'active', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-a', user_id: 'dash-member-a', role: 'employee', department_id: 'dept-a1', status: 'active', invited_by: 'kluzar-user-owner-a', joined_at: FUTURE });
  const pendingHash = await hashPassword(PENDING_PASSWORD);
  db.insert('dashboard_users', { id: 'dash-pending', email: 'pending@example.test', password_hash: pendingHash, mfa_secret_enc: '', mfa_enabled: 0, status: 'pending', created_at: FUTURE, updated_at: FUTURE });
  db.insert('dashboard_users', { id: 'dash-suspended', email: 'suspended@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'suspended', created_at: FUTURE, updated_at: FUTURE });
  db.insert('dashboard_users', { id: 'dash-expired-member', email: 'expiredmember@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'active', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-expired', user_id: 'dash-expired-member', role: 'employee', department_id: null, status: 'active', invited_by: 'kluzar-user-expired', joined_at: FUTURE });
  db.insert('dashboard_users', { id: 'dash-revoked', email: 'revoked@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'active', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-a', user_id: 'dash-revoked', role: 'employee', department_id: null, status: 'removed', invited_by: 'kluzar-user-owner-a', joined_at: FUTURE });
  const expiredTokenHash = await sha256Hex('expired-invite-token-test');
  db.insert('invitations', { id: 'invite-expired', company_id: 'comp-a', email: 'expiredinvite@example.test', role: 'employee', department_id: null, token_hash: expiredTokenHash, password_enc: 'unused', expires_at: PAST, used_at: null, created_by: 'kluzar-user-owner-a', created_at: FUTURE });
  return { env, db, privateKey };
}

function signAssertion(privateKey, overrides) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid: overrides.kid || 'dash-assertion-v1' }));
  const payload = b64url(JSON.stringify({ sub: overrides.sub, sid: overrides.sid, aud: overrides.aud || 'kluzar-dashboard-api', iat: overrides.iat !== undefined ? overrides.iat : nowSec, exp: overrides.exp !== undefined ? overrides.exp : nowSec + 300, jti: 'test-jti-' + Math.random().toString(36).slice(2) }));
  const input = header + '.' + payload;
  const sig = sign(null, Buffer.from(input), privateKey);
  return input + '.' + b64url(sig);
}

async function call(env, method, path, options) {
  const opts = options || {};
  const headers = { 'Content-Type': 'application/json' };
  if (opts.origin !== false) headers.Origin = opts.origin || DASH_ORIGIN;
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const req = new Request('https://dashboard-api.kluzar.com' + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const res = await handler.fetch(req, env);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: res.headers };
}

async function ownerSession(env, privateKey, sub, sid) {
  const assertion = signAssertion(privateKey, { sub, sid });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  return res;
}

async function memberLogin(env, email, password, totp) {
  return call(env, 'POST', '/api/auth/member-login', { body: { email, password, totp } });
}

async function memberSession(env) {
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await memberLogin(env, 'membera@example.test', MEMBER_PASSWORD, code);
  eq(res.status, 200, 'member login status');
  return res.data.sessionToken;
}

await test('health returns ok', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/health');
  eq(res.status, 200, 'status');
  eq(res.data.service, 'kluzar-dashboard-api', 'service');
});

await test('CORS allows only dash origin', async () => {
  const { env } = await makeEnv();
  const req = new Request('https://dashboard-api.kluzar.com/api/health', { method: 'OPTIONS', headers: { Origin: DASH_ORIGIN } });
  const res = await handler.fetch(req, env);
  eq(res.status, 204, 'dash options status');
  eq(res.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash ACAO');
  const req2 = new Request('https://dashboard-api.kluzar.com/api/health', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.test' } });
  const res2 = await handler.fetch(req2, env);
  eq(res2.headers.get('Access-Control-Allow-Origin'), null, 'evil ACAO absent');
});

await test('guest denial on me and invitations', async () => {
  const { env } = await makeEnv();
  const me = await call(env, 'GET', '/api/auth/me');
  eq(me.status, 401, 'me status');
  const invite = await call(env, 'POST', '/api/invitations', { body: { companyId: 'comp-a', email: 'x@example.test', role: 'employee' } });
  eq(invite.status, 401, 'invite status');
});

await test('assertion without bearer is denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/auth/session', {});
  eq(res.status, 401, 'status');
});

await test('assertion wrong origin is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-owner-a' });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion, origin: 'https://evil.example.test' });
  eq(res.status, 403, 'status');
});

await test('assertion wrong audience is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-owner-a', aud: 'kluzar-business-api' });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 401, 'status');
});

await test('assertion expired is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-owner-a', iat: nowSec - 600, exp: nowSec - 300 });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 401, 'status');
});

await test('assertion wrong kid is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-owner-a', kid: 'business-assertion-v1' });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 401, 'status');
});

await test('assertion bad signature is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-owner-a' });
  const tampered = assertion.slice(0, -4) + 'AAAA';
  const res = await call(env, 'POST', '/api/auth/session', { token: tampered });
  eq(res.status, 401, 'status');
});

await test('assertion revoked session is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-missing' });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 401, 'status');
});

await test('assertion expired D1 session is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const assertion = signAssertion(privateKey, { sub: 'kluzar-user-owner-a', sid: 'sid-old' });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 401, 'status');
});

await test('Starter assertion is denied with plan', async () => {
  const { env, privateKey } = await makeEnv();
  const res = await ownerSession(env, privateKey, 'kluzar-user-starter', 'sid-starter');
  eq(res.status, 403, 'status');
  eq(res.data.plan, 'free', 'plan');
});

await test('Growth assertion is denied with plan', async () => {
  const { env, privateKey } = await makeEnv();
  const res = await ownerSession(env, privateKey, 'kluzar-user-growth', 'sid-growth');
  eq(res.status, 403, 'status');
  eq(res.data.plan, 'growth', 'plan');
});

await test('Max owner assertion mints session and lists companies', async () => {
  const { env, privateKey } = await makeEnv();
  const res = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  eq(res.status, 200, 'status');
  ok(res.data.sessionToken, 'session token');
  eq(res.data.userType, 'owner', 'user type');
  eq(res.data.companies.length, 1, 'company count');
  eq(res.data.companies[0].id, 'comp-a', 'company id');
  eq(res.data.companies[0].role, 'owner', 'role');
  const me = await call(env, 'GET', '/api/auth/me', { token: res.data.sessionToken });
  eq(me.status, 200, 'me status');
  eq(me.data.companies[0].name, 'Alpha Company', 'company name');
});

await test('expired owner assertion is denied for all members', async () => {
  const { env, privateKey } = await makeEnv();
  const res = await ownerSession(env, privateKey, 'kluzar-user-expired', 'sid-expired');
  eq(res.status, 403, 'status');
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const login = await memberLogin(env, 'expiredmember@example.test', MEMBER_PASSWORD, code);
  eq(login.status, 403, 'member login status');
});

await test('member me sees only own company', async () => {
  const { env } = await makeEnv();
  const token = await memberSession(env);
  const me = await call(env, 'GET', '/api/auth/me', { token });
  eq(me.status, 200, 'status');
  eq(me.data.companies.length, 1, 'company count');
  eq(me.data.companies[0].id, 'comp-a', 'company id');
  eq(me.data.companies[0].role, 'employee', 'role');
});

await test('revoked member login is denied', async () => {
  const { env } = await makeEnv();
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const login = await memberLogin(env, 'revoked@example.test', MEMBER_PASSWORD, code);
  eq(login.status, 403, 'status');
});

await test('invite happy path returns link without password', async () => {
  const { env, privateKey, db } = await makeEnv();
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-a', email: 'newmember@example.test', role: 'manager', departmentId: 'dept-a1' } });
  eq(res.status, 200, 'status');
  ok(res.data.inviteLink.startsWith('https://dash.kluzar.com/invite?token='), 'invite link');
  eq(res.data.password, undefined, 'no password in response');
  const user = await db.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind('newmember@example.test').first();
  eq(user.status, 'pending', 'pending user');
});

await test('invite cross-company is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-b', email: 'cross@example.test', role: 'employee' } });
  eq(res.status, 404, 'status');
});

await test('invite invalid role is rejected', async () => {
  const { env, privateKey } = await makeEnv();
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-a', email: 'badrole@example.test', role: 'superadmin' } });
  eq(res.status, 400, 'status');
});

await test('invite manipulated body fields are ignored', async () => {
  const { env, privateKey, db } = await makeEnv();
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-a', email: 'clean@example.test', role: 'employee', owner_user_id: 'kluzar-user-owner-b', company_id: 'comp-b' } });
  eq(res.status, 200, 'status');
  const invite = await db.prepare('SELECT * FROM invitations WHERE email = ?').bind('clean@example.test').first();
  eq(invite.created_by, 'kluzar-user-owner-a', 'created by');
  eq(invite.company_id, 'comp-a', 'company id');
});

await test('invite rate limit blocks the 21st invite', async () => {
  const { env, privateKey } = await makeEnv();
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  let lastStatus = 0;
  for (let i = 0; i < 21; i++) {
    const res = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-a', email: 'bulk' + i + '@example.test', role: 'employee' } });
    lastStatus = res.status;
  }
  eq(lastStatus, 429, '21st status');
});

await test('invite claim expired and bogus tokens are denied', async () => {
  const { env } = await makeEnv();
  const expired = await call(env, 'POST', '/api/auth/invite/claim', { body: { token: 'expired-invite-token-test' } });
  eq(expired.status, 404, 'expired status');
  const bogus = await call(env, 'POST', '/api/auth/invite/claim', { body: { token: 'no-such-token-test' } });
  eq(bogus.status, 404, 'bogus status');
});

async function inviteFlow(env, privateKey) {
  const session = await ownerSession(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const invite = await call(env, 'POST', '/api/invitations', { token: session.data.sessionToken, body: { companyId: 'comp-a', email: 'flowmember@example.test', role: 'employee' } });
  eq(invite.status, 200, 'invite status');
  const token = new URL(invite.data.inviteLink).searchParams.get('token');
  const claim = await call(env, 'POST', '/api/auth/invite/claim', { body: { token } });
  return { invite, claim, token };
}

await test('invite claim returns one-time password and setup token', async () => {
  const { env, privateKey } = await makeEnv();
  const { claim } = await inviteFlow(env, privateKey);
  eq(claim.status, 200, 'status');
  eq(claim.data.password.length, 20, 'password length');
  eq(claim.data.email, 'flowmember@example.test', 'email');
  eq(claim.data.companyName, 'Alpha Company', 'company');
  eq(claim.data.role, 'employee', 'role');
  ok(claim.data.setupToken, 'setup token');
});

await test('MFA setup with bad token is denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/auth/mfa/setup', { body: { setupToken: 'bad-setup-token-test' } });
  eq(res.status, 401, 'status');
});

await test('MFA verify wrong code is denied', async () => {
  const { env, privateKey } = await makeEnv();
  const { claim } = await inviteFlow(env, privateKey);
  const setup = await call(env, 'POST', '/api/auth/mfa/setup', { body: { setupToken: claim.data.setupToken } });
  eq(setup.status, 200, 'setup status');
  const verify = await call(env, 'POST', '/api/auth/mfa/verify', { body: { setupToken: claim.data.setupToken, code: '000000' } });
  eq(verify.status, 401, 'status');
});

await test('MFA verify activates member and consumes invite', async () => {
  const { env, privateKey, db } = await makeEnv();
  const { claim, token } = await inviteFlow(env, privateKey);
  const setup = await call(env, 'POST', '/api/auth/mfa/setup', { body: { setupToken: claim.data.setupToken } });
  const code = await totpCode(setup.data.secret, Date.now());
  const verify = await call(env, 'POST', '/api/auth/mfa/verify', { body: { setupToken: claim.data.setupToken, code } });
  eq(verify.status, 200, 'status');
  ok(verify.data.sessionToken, 'session token');
  eq(verify.data.companies[0].id, 'comp-a', 'company');
  const again = await call(env, 'POST', '/api/auth/invite/claim', { body: { token } });
  eq(again.status, 404, 'double claim status');
  const invite = await db.prepare('SELECT * FROM invitations WHERE email = ?').bind('flowmember@example.test').first();
  ok(invite.used_at, 'used at set');
  eq(invite.password_enc, null, 'pending password deleted');
  const user = await db.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind('flowmember@example.test').first();
  eq(user.status, 'active', 'user active');
  eq(user.mfa_enabled, 1, 'mfa enabled');
});

await test('member login wrong password is denied', async () => {
  const { env } = await makeEnv();
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await memberLogin(env, 'membera@example.test', 'WrongPass123!', code);
  eq(res.status, 401, 'status');
});

await test('member login wrong TOTP is denied', async () => {
  const { env } = await makeEnv();
  const res = await memberLogin(env, 'membera@example.test', MEMBER_PASSWORD, '000000');
  eq(res.status, 401, 'status');
});

await test('member login pending MFA returns setup required', async () => {
  const { env } = await makeEnv();
  const res = await memberLogin(env, 'pending@example.test', PENDING_PASSWORD, '123456');
  eq(res.status, 403, 'status');
  eq(res.data.setupRequired, true, 'setup required');
});

await test('member login suspended is denied', async () => {
  const { env } = await makeEnv();
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await memberLogin(env, 'suspended@example.test', MEMBER_PASSWORD, code);
  eq(res.status, 401, 'status');
});

await test('member login happy path mints session', async () => {
  const { env } = await makeEnv();
  const token = await memberSession(env);
  ok(token, 'token');
  const me = await call(env, 'GET', '/api/auth/me', { token });
  eq(me.status, 200, 'me status');
  eq(me.data.userType, 'member', 'user type');
});

await test('logout revokes the session', async () => {
  const { env } = await makeEnv();
  const token = await memberSession(env);
  const out = await call(env, 'POST', '/api/auth/logout', { token });
  eq(out.status, 200, 'logout status');
  const me = await call(env, 'GET', '/api/auth/me', { token });
  eq(me.status, 401, 'me status');
});

await test('expired dashboard session is denied', async () => {
  const { env, db } = await makeEnv();
  const tokenHash = await sha256Hex('expired-session-token-test');
  db.insert('dashboard_sessions', { id: 'sess-expired', user_id: 'dash-member-a', user_type: 'member', token_hash: tokenHash, purpose: 'session', company_id: null, expires_at: PAST, created_at: PAST });
  const me = await call(env, 'GET', '/api/auth/me', { token: 'expired-session-token-test' });
  eq(me.status, 401, 'status');
});

await test('guessed session token is denied', async () => {
  const { env } = await makeEnv();
  const me = await call(env, 'GET', '/api/auth/me', { token: 'guessed-token-test-value' });
  eq(me.status, 401, 'status');
});

await test('write rate limit blocks after 600', async () => {
  const { env } = await makeEnv();
  let allowed = true;
  for (let i = 0; i < 601; i++) {
    allowed = await checkRateLimit(env.DB, 'rate-test-user', 'write', 600, 3600);
  }
  eq(allowed, false, '601st blocked');
});

await test('unknown route and wrong method are rejected', async () => {
  const { env } = await makeEnv();
  const unknown = await call(env, 'GET', '/api/nope');
  eq(unknown.status, 404, 'unknown status');
  const wrongMethod = await call(env, 'POST', '/api/health');
  eq(wrongMethod.status, 405, 'method status');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
