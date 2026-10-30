import handler from '../worker/src/index.js';
import { ShimDB } from './d1shim.mjs';
import { encryptText, hashPassword, sha256Hex, totpCode } from '../worker/src/crypto.js';
import { validateNext } from '../src/lib/next.ts';

const DASH_ORIGIN = 'https://dash.kluzar.com';
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();
const MEMBER_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
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

async function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db, DASH_ASSERTION_PUBLIC_KEY: '{}', DASH_ENCRYPTION_KEY: 'local-test-encryption-key-only' };
  db.insert('users', { id: 'kluzar-user-owner-a', status: 'active' });
  db.insert('entitlements', { user_id: 'kluzar-user-owner-a', plan: 'max', status: 'active' });
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-a', user_id: 'kluzar-user-owner-a', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  const memberHash = await hashPassword(MEMBER_PASSWORD);
  const memberSecretEnc = await encryptText(env.DASH_ENCRYPTION_KEY, MEMBER_SECRET);
  db.insert('dashboard_users', { id: 'dash-member-a', email: 'membera@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'active', created_at: FUTURE, updated_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-a', user_id: 'dash-member-a', role: 'employee', department_id: null, status: 'active', invited_by: 'kluzar-user-owner-a', joined_at: FUTURE });
  const pendingHash = await hashPassword(PENDING_PASSWORD);
  const pendingPasswordEnc = await encryptText(env.DASH_ENCRYPTION_KEY, PENDING_PASSWORD);
  db.insert('dashboard_users', { id: 'dash-pending', email: 'pending@example.test', password_hash: pendingHash, mfa_secret_enc: '', mfa_enabled: 0, status: 'pending', created_at: FUTURE, updated_at: FUTURE });
  db.insert('invitations', { id: 'invite-pending', company_id: 'comp-a', email: 'pending@example.test', role: 'employee', department_id: null, token_hash: 'pending-invite-token-hash', password_enc: pendingPasswordEnc, expires_at: FUTURE, used_at: null, revoked_at: null, created_by: 'kluzar-user-owner-a', created_at: FUTURE });
  db.insert('dashboard_users', { id: 'dash-suspended', email: 'suspended@example.test', password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'suspended', created_at: FUTURE, updated_at: FUTURE });
  return { env, db };
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

async function step1(env, email, password) {
  return call(env, 'POST', '/api/auth/member-login/step1', { body: { email, password } });
}

async function pendingSetup(env) {
  const first = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  eq(first.status, 200, 'pending step1 status');
  eq(first.data.next, 'setup', 'pending next');
  const setup = await call(env, 'POST', '/api/auth/member-login/setup', { body: { loginToken: first.data.loginToken } });
  eq(setup.status, 200, 'setup status');
  return { loginToken: first.data.loginToken, setup };
}

await test('step1 active member returns mfa step and login token', async () => {
  const { env } = await makeEnv();
  const res = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  eq(res.status, 200, 'status');
  eq(res.data.next, 'mfa', 'next');
  ok(res.data.loginToken, 'login token');
});

await test('step1 pending member returns setup step and login token', async () => {
  const { env } = await makeEnv();
  const res = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  eq(res.status, 200, 'status');
  eq(res.data.next, 'setup', 'next');
  ok(res.data.loginToken, 'login token');
});

await test('step1 generic error on wrong credentials without enumeration', async () => {
  const { env } = await makeEnv();
  const wrongPass = await step1(env, 'membera@example.test', 'WrongPass123!');
  const unknown = await step1(env, 'nobody@example.test', 'Whatever123!');
  const suspended = await step1(env, 'suspended@example.test', MEMBER_PASSWORD);
  eq(wrongPass.status, 401, 'wrong password status');
  eq(unknown.status, 401, 'unknown email status');
  eq(suspended.status, 401, 'suspended status');
  eq(wrongPass.data.error, unknown.data.error, 'generic message match');
  eq(wrongPass.data.loginToken, undefined, 'no token on wrong password');
  eq(unknown.data.loginToken, undefined, 'no token on unknown email');
});

await test('step1 rate limit blocks the 21st attempt', async () => {
  const { env } = await makeEnv();
  let lastStatus = 0;
  for (let i = 0; i < 21; i++) {
    const res = await step1(env, 'ratelimit@example.test', 'WrongPass123!');
    lastStatus = res.status;
  }
  eq(lastStatus, 429, '21st status');
});

await test('setup returns otpauth url secret and eight backup codes', async () => {
  const { env } = await makeEnv();
  const { setup } = await pendingSetup(env);
  ok(setup.data.otpauthUrl.startsWith('otpauth://totp/'), 'otpauth scheme');
  ok(setup.data.otpauthUrl.includes('issuer=Kluzar'), 'otpauth issuer');
  ok(setup.data.otpauthUrl.includes('secret='), 'otpauth secret');
  ok(setup.data.secret, 'secret');
  eq(setup.data.backupCodes.length, 8, 'backup code count');
  eq(new Set(setup.data.backupCodes).size, 8, 'backup codes unique');
  for (const code of setup.data.backupCodes) eq(code.length, 8, 'backup code length');
});

await test('setup rotation invalidates the previous backup codes', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  const setupA = await call(env, 'POST', '/api/auth/member-login/setup', { body: { loginToken: first.data.loginToken } });
  const setupB = await call(env, 'POST', '/api/auth/member-login/setup', { body: { loginToken: first.data.loginToken } });
  ok(setupB.data.secret !== setupA.data.secret, 'secret rotated');
  const codeB = await totpCode(setupB.data.secret, Date.now());
  const verified = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken: first.data.loginToken, totpCode: codeB } });
  eq(verified.status, 200, 'setup verify status');
  const second = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  const reuse = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: second.data.loginToken, code: setupA.data.backupCodes[0] } });
  eq(reuse.status, 401, 'old backup code status');
});

await test('setup verify wrong code is denied and token stays usable', async () => {
  const { env } = await makeEnv();
  const { loginToken, setup } = await pendingSetup(env);
  const wrong = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken, totpCode: '000000' } });
  eq(wrong.status, 401, 'wrong code status');
  const code = await totpCode(setup.data.secret, Date.now());
  const right = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken, totpCode: code } });
  eq(right.status, 200, 'retry status');
  ok(right.data.sessionToken, 'session token');
});

await test('setup verify activates member consumes invite and deletes pending password', async () => {
  const { env, db } = await makeEnv();
  const { loginToken, setup } = await pendingSetup(env);
  const code = await totpCode(setup.data.secret, Date.now());
  const res = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken, totpCode: code } });
  eq(res.status, 200, 'status');
  ok(res.data.sessionToken, 'session token');
  eq(res.data.companies[0].id, 'comp-a', 'company');
  const invite = await db.prepare('SELECT * FROM invitations WHERE email = ?').bind('pending@example.test').first();
  ok(invite.used_at, 'used at set');
  eq(invite.password_enc, null, 'pending password deleted');
  const user = await db.prepare('SELECT * FROM dashboard_users WHERE email = ?').bind('pending@example.test').first();
  eq(user.status, 'active', 'user active');
  eq(user.mfa_enabled, 1, 'mfa enabled');
  const member = await db.prepare('SELECT * FROM company_members WHERE company_id = ? AND user_id = ?').bind('comp-a', 'dash-pending').first();
  eq(member.status, 'active', 'membership active');
  const codes = await db.prepare('SELECT * FROM dashboard_backup_codes WHERE user_id = ?').bind('dash-pending').all();
  eq(codes.results.length, 8, 'backup codes stored');
  ok(codes.results.every((row) => !row.used_at), 'backup codes unused');
});

await test('setup verify with bad token is denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken: 'bad-login-token-test', totpCode: '123456' } });
  eq(res.status, 401, 'status');
});

await test('setup for already active member is denied', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const res = await call(env, 'POST', '/api/auth/member-login/setup', { body: { loginToken: first.data.loginToken } });
  eq(res.status, 400, 'status');
});

await test('returning login with TOTP mints a session', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code } });
  eq(res.status, 200, 'status');
  ok(res.data.sessionToken, 'session token');
  const me = await call(env, 'GET', '/api/auth/me', { token: res.data.sessionToken });
  eq(me.status, 200, 'me status');
});

await test('backup code works once then second use is denied', async () => {
  const { env } = await makeEnv();
  const { loginToken, setup } = await pendingSetup(env);
  const code = await totpCode(setup.data.secret, Date.now());
  const activated = await call(env, 'POST', '/api/auth/member-login/setup-verify', { body: { loginToken, totpCode: code } });
  eq(activated.status, 200, 'activation status');
  const backup = setup.data.backupCodes[0];
  const first = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  const use = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code: backup } });
  eq(use.status, 200, 'first backup use status');
  ok(use.data.sessionToken, 'backup session token');
  const second = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  const reuse = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: second.data.loginToken, code: backup } });
  eq(reuse.status, 401, 'second backup use status');
});

await test('verify wrong code is denied', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code: '000000' } });
  eq(res.status, 401, 'status');
});

await test('verify for pending member returns setup required', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'pending@example.test', PENDING_PASSWORD);
  const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code: '123456' } });
  eq(res.status, 403, 'status');
  eq(res.data.setupRequired, true, 'setup required');
});

await test('second step1 invalidates the first login token', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const second = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const stale = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code } });
  eq(stale.status, 401, 'stale token status');
  const fresh = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: second.data.loginToken, code } });
  eq(fresh.status, 200, 'fresh token status');
});

await test('login token reuse after success is denied', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const okRes = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code } });
  eq(okRes.status, 200, 'first status');
  const again = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code } });
  eq(again.status, 401, 'reuse status');
});

await test('expired login token is denied', async () => {
  const { env, db } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  const tokenHash = await sha256Hex(first.data.loginToken);
  await db.prepare('UPDATE dashboard_sessions SET expires_at = ? WHERE token_hash = ?').bind(PAST, tokenHash).run();
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code } });
  eq(res.status, 401, 'status');
});

await test('verify rate limit blocks the 21st attempt', async () => {
  const { env } = await makeEnv();
  const first = await step1(env, 'membera@example.test', MEMBER_PASSWORD);
  let lastStatus = 0;
  for (let i = 0; i < 21; i++) {
    const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: first.data.loginToken, code: '000000' } });
    lastStatus = res.status;
  }
  eq(lastStatus, 429, '21st status');
});

await test('wrong origin gets no access header on stepped endpoints', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/auth/member-login/step1', { body: { email: 'membera@example.test', password: MEMBER_PASSWORD }, origin: 'https://evil.example.test' });
  eq(res.headers.get('Access-Control-Allow-Origin'), null, 'evil ACAO absent');
  const preflight = await new Request('https://dashboard-api.kluzar.com/api/auth/member-login/verify', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.test' } });
  const preRes = await handler.fetch(preflight, env);
  eq(preRes.headers.get('Access-Control-Allow-Origin'), null, 'evil preflight ACAO absent');
});

await test('next validation accepts dash paths and rejects the rest', async () => {
  eq(validateNext('/employees'), '/employees', 'relative path');
  eq(validateNext('/'), '/', 'root');
  eq(validateNext('https://dash.kluzar.com/employees'), '/employees', 'absolute dash url');
  eq(validateNext('https://dash.kluzar.com'), '/', 'dash origin only');
  eq(validateNext('https://evil.example.test/employees'), '/', 'external url');
  eq(validateNext('https://dash.kluzar.com@evil.example.test/'), '/', 'host spoof');
  eq(validateNext('https://user:pass@dash.kluzar.com/employees'), '/', 'credential url');
  eq(validateNext('javascript:alert(1)'), '/', 'javascript url');
  eq(validateNext('//evil.example.test/'), '/', 'protocol relative');
  eq(validateNext('/employees?tab=1'), '/employees', 'query stripped');
  eq(validateNext(''), '/', 'empty');
  eq(validateNext(null), '/', 'null');
  eq(validateNext('x'.repeat(3000)), '/', 'length cap');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
