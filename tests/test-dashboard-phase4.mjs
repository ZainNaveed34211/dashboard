import { generateKeyPairSync, sign } from 'node:crypto';
import handler from '../worker/src/index.js';
import { ShimDB } from './d1shim.mjs';
import { encryptText, hashPassword, sha256Hex, totpCode } from '../worker/src/crypto.js';

const DASH_ORIGIN = 'https://dash.kluzar.com';
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();
const MEMBER_SECRET = 'JBSWY3DPEHPK3PXP';
const MEMBER_PASSWORD = 'MemberPass123!';

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
  const kluzarUsers = [
    ['kluzar-user-owner-a', 'max', 'active'],
    ['kluzar-user-owner-b', 'max', 'active'],
    ['kluzar-user-admin2-a', 'max', 'active'],
    ['kluzar-user-starter', 'free', 'active'],
    ['kluzar-user-growth', 'growth', 'active'],
    ['kluzar-user-expired', 'max', 'expired'],
  ];
  for (const [id, plan, status] of kluzarUsers) {
    db.insert('users', { id, status: 'active' });
    db.insert('entitlements', { user_id: id, plan, status });
  }
  const sids = [
    ['sid-owner-a', 'kluzar-user-owner-a'],
    ['sid-owner-b', 'kluzar-user-owner-b'],
    ['sid-admin2-a', 'kluzar-user-admin2-a'],
    ['sid-starter', 'kluzar-user-starter'],
    ['sid-growth', 'kluzar-user-growth'],
    ['sid-expired', 'kluzar-user-expired'],
  ];
  for (const [id, userId] of sids) {
    db.insert('sessions', { id, user_id: userId, expires_at: FUTURE });
  }
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('companies', { id: 'comp-b', owner_user_id: 'kluzar-user-owner-b', name: 'Beta Company', created_at: FUTURE, updated_at: FUTURE });
  db.insert('companies', { id: 'comp-expired', owner_user_id: 'kluzar-user-expired', name: 'Expired Company', created_at: FUTURE, updated_at: FUTURE });
  const membersA = [
    ['kluzar-user-owner-a', 'owner', null],
    ['kluzar-user-admin2-a', 'admin', null],
    ['dash-admin-a', 'admin', null],
    ['dash-manager-a', 'manager', 'dept-a1'],
    ['dash-employee-a', 'employee', 'dept-a1'],
    ['dash-employee2-a', 'employee', 'dept-a2'],
  ];
  for (const [userId, role, dept] of membersA) {
    db.insert('company_members', { company_id: 'comp-a', user_id: userId, role, department_id: dept, status: 'active', invited_by: 'kluzar-user-owner-a', joined_at: FUTURE });
  }
  db.insert('company_members', { company_id: 'comp-b', user_id: 'kluzar-user-owner-b', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-b', user_id: 'dash-employee-b', role: 'employee', department_id: 'dept-b1', status: 'active', invited_by: 'kluzar-user-owner-b', joined_at: FUTURE });
  db.insert('company_members', { company_id: 'comp-expired', user_id: 'kluzar-user-expired', role: 'owner', department_id: null, status: 'active', invited_by: null, joined_at: FUTURE });
  const memberHash = await hashPassword(MEMBER_PASSWORD);
  const memberSecretEnc = await encryptText(env.DASH_ENCRYPTION_KEY, MEMBER_SECRET);
  const dashUsers = [
    ['dash-admin-a', 'admina@example.test'],
    ['dash-manager-a', 'managera@example.test'],
    ['dash-employee-a', 'employeea@example.test'],
    ['dash-employee2-a', 'employee2a@example.test'],
    ['dash-employee-b', 'employeeb@example.test'],
  ];
  for (const [id, email] of dashUsers) {
    db.insert('dashboard_users', { id, email, password_hash: memberHash, mfa_secret_enc: memberSecretEnc, mfa_enabled: 1, status: 'active', created_at: FUTURE, updated_at: FUTURE });
  }
  db.insert('departments', { id: 'dept-a1', company_id: 'comp-a', name: 'Dept A1', manager_user_id: null, created_at: FUTURE });
  db.insert('departments', { id: 'dept-a2', company_id: 'comp-a', name: 'Dept A2', manager_user_id: null, created_at: FUTURE });
  db.insert('departments', { id: 'dept-empty', company_id: 'comp-a', name: 'Dept Empty', manager_user_id: null, created_at: FUTURE });
  db.insert('departments', { id: 'dept-proj-only', company_id: 'comp-a', name: 'Dept Proj Only', manager_user_id: null, created_at: FUTURE });
  db.insert('departments', { id: 'dept-b1', company_id: 'comp-b', name: 'Dept B1', manager_user_id: null, created_at: FUTURE });
  db.insert('projects', { id: 'proj-a1', company_id: 'comp-a', department_id: 'dept-a1', name: 'Project A1', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: FUTURE, updated_at: FUTURE });
  db.insert('projects', { id: 'proj-a2', company_id: 'comp-a', department_id: 'dept-proj-only', name: 'Project A2', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: FUTURE, updated_at: FUTURE });
  db.insert('projects', { id: 'proj-b1', company_id: 'comp-b', department_id: 'dept-b1', name: 'Project B1', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-b', start_date: null, end_date: null, created_at: FUTURE, updated_at: FUTURE });
  const inviteRows = [
    ['invite-pending-a', 'pendinginvite@example.test', 'employee', null, 'pending-invite-token-test', '2026-01-01T00:00:00.000Z', null, null, FUTURE],
    ['invite-used-a', 'usedinvite@example.test', 'employee', null, 'used-invite-token-test', '2026-01-02T00:00:00.000Z', FUTURE, null, FUTURE],
    ['invite-expired-a', 'expiredinvite@example.test', 'employee', null, 'expired-invite-token-test', '2026-01-03T00:00:00.000Z', null, null, PAST],
    ['invite-revoked-a', 'revokedinvite@example.test', 'employee', null, 'revoked-invite-token-test', '2026-01-04T00:00:00.000Z', null, FUTURE, FUTURE],
  ];
  for (const [id, email, role, dept, token, created, used, revoked, expires] of inviteRows) {
    const tokenHash = await sha256Hex(token);
    db.insert('invitations', { id, company_id: 'comp-a', email, role, department_id: dept, token_hash: tokenHash, password_enc: 'unused', expires_at: expires, used_at: used, revoked_at: revoked, created_by: 'kluzar-user-owner-a', created_at: created });
  }
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

async function ownerToken(env, privateKey, sub, sid) {
  const assertion = signAssertion(privateKey, { sub, sid });
  const res = await call(env, 'POST', '/api/auth/session', { token: assertion });
  eq(res.status, 200, 'owner session status');
  return res.data.sessionToken;
}

async function memberToken(env, email) {
  const step1 = await call(env, 'POST', '/api/auth/member-login/step1', { body: { email, password: MEMBER_PASSWORD } });
  eq(step1.status, 200, 'member step1 status for ' + email);
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const res = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: step1.data.loginToken, code } });
  eq(res.status, 200, 'member login status for ' + email);
  return res.data.sessionToken;
}

await test('guest denied on all new endpoints', async () => {
  const { env } = await makeEnv();
  const calls = [
    call(env, 'GET', '/api/companies'),
    call(env, 'GET', '/api/companies/comp-a'),
    call(env, 'GET', '/api/companies/comp-a/members'),
    call(env, 'POST', '/api/companies/comp-a/members/update', { body: { userId: 'dash-employee-a', role: 'manager' } }),
    call(env, 'POST', '/api/companies/comp-a/members/remove', { body: { userId: 'dash-employee-a' } }),
    call(env, 'GET', '/api/companies/comp-a/invitations'),
    call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { body: { invitationId: 'invite-pending-a' } }),
    call(env, 'POST', '/api/companies/comp-a/transfer', { body: { newOwnerUserId: 'dash-admin-a' } }),
    call(env, 'GET', '/api/companies/comp-a/departments'),
    call(env, 'POST', '/api/companies/comp-a/departments', { body: { name: 'Dept New' } }),
    call(env, 'POST', '/api/companies/comp-a/departments/update', { body: { deptId: 'dept-a1', name: 'Dept Renamed' } }),
    call(env, 'POST', '/api/companies/comp-a/departments/delete', { body: { deptId: 'dept-a1' } }),
  ];
  const results = await Promise.all(calls);
  for (const res of results) eq(res.status, 401, 'guest status');
});

await test('Starter and Growth cannot mint dashboard sessions', async () => {
  const { env, privateKey } = await makeEnv();
  const starter = signAssertion(privateKey, { sub: 'kluzar-user-starter', sid: 'sid-starter' });
  const starterRes = await call(env, 'POST', '/api/auth/session', { token: starter });
  eq(starterRes.status, 403, 'starter status');
  const growth = signAssertion(privateKey, { sub: 'kluzar-user-growth', sid: 'sid-growth' });
  const growthRes = await call(env, 'POST', '/api/auth/session', { token: growth });
  eq(growthRes.status, 403, 'growth status');
  const noToken = await call(env, 'GET', '/api/companies');
  eq(noToken.status, 401, 'no token status');
});

await test('wrong Origin gets no ACAO echo on new endpoints', async () => {
  const { env, privateKey } = await makeEnv();
  const token = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const optionsReq = new Request('https://dashboard-api.kluzar.com/api/companies/comp-a/members', { method: 'OPTIONS', headers: { Origin: 'https://evil.example.test' } });
  const optionsRes = await handler.fetch(optionsReq, env);
  eq(optionsRes.headers.get('Access-Control-Allow-Origin'), null, 'evil options ACAO absent');
  const optionsGood = new Request('https://dashboard-api.kluzar.com/api/companies/comp-a/members', { method: 'OPTIONS', headers: { Origin: DASH_ORIGIN } });
  const optionsGoodRes = await handler.fetch(optionsGood, env);
  eq(optionsGoodRes.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash options ACAO present');
  const getWrong = await call(env, 'GET', '/api/companies', { token, origin: 'https://evil.example.test' });
  eq(getWrong.headers.get('Access-Control-Allow-Origin'), null, 'evil get ACAO absent');
  const getGood = await call(env, 'GET', '/api/companies', { token });
  eq(getGood.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash get ACAO present');
});

await test('GET companies lists own companies with roles', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'GET', '/api/companies', { token: owner });
  eq(res.status, 200, 'status');
  eq(res.data.companies.length, 1, 'company count');
  eq(res.data.companies[0].id, 'comp-a', 'company id');
  eq(res.data.companies[0].role, 'owner', 'role');
  const employee = await memberToken(env, 'employeea@example.test');
  const empRes = await call(env, 'GET', '/api/companies', { token: employee });
  eq(empRes.status, 200, 'employee status');
  eq(empRes.data.companies[0].role, 'employee', 'employee role');
});

await test('GET company detail member only', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'GET', '/api/companies/comp-a', { token: owner });
  eq(res.status, 200, 'status');
  eq(res.data.company.ownerUserId, 'kluzar-user-owner-a', 'owner id');
  const cross = await call(env, 'GET', '/api/companies/comp-b', { token: owner });
  eq(cross.status, 404, 'cross status');
});

await test('GET members scoping by role', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const ownerRes = await call(env, 'GET', '/api/companies/comp-a/members', { token: owner });
  eq(ownerRes.status, 200, 'owner status');
  eq(ownerRes.data.total, 6, 'owner total');
  const admin = await memberToken(env, 'admina@example.test');
  const adminRes = await call(env, 'GET', '/api/companies/comp-a/members', { token: admin });
  eq(adminRes.data.total, 6, 'admin total');
  const manager = await memberToken(env, 'managera@example.test');
  const managerRes = await call(env, 'GET', '/api/companies/comp-a/members', { token: manager });
  eq(managerRes.data.total, 2, 'manager total');
  const employee = await memberToken(env, 'employeea@example.test');
  const employeeRes = await call(env, 'GET', '/api/companies/comp-a/members', { token: employee });
  eq(employeeRes.data.total, 1, 'employee total');
  eq(employeeRes.data.members[0].userId, 'dash-employee-a', 'employee self');
});

await test('GET members pagination slices visible rows', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'GET', '/api/companies/comp-a/members?limit=2', { token: owner });
  eq(res.status, 200, 'status');
  eq(res.data.members.length, 2, 'page size');
  eq(res.data.total, 6, 'total');
});

await test('admin invite allowed for manager and employee', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const managerInvite = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-a', email: 'newmanager@example.test', role: 'manager', departmentId: null } });
  eq(managerInvite.status, 200, 'manager invite status');
  ok(managerInvite.data.inviteLink, 'manager invite link');
  const employeeInvite = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-a', email: 'newemployee@example.test', role: 'employee', departmentId: null } });
  eq(employeeInvite.status, 200, 'employee invite status');
});

await test('assertion admin can invite manager', async () => {
  const { env, privateKey } = await makeEnv();
  const admin = await ownerToken(env, privateKey, 'kluzar-user-admin2-a', 'sid-admin2-a');
  const res = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-a', email: 'assertmanager@example.test', role: 'manager', departmentId: null } });
  eq(res.status, 200, 'status');
});

await test('admin invite forbidden for owner and admin roles', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const ownerInvite = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-a', email: 'badowner@example.test', role: 'owner', departmentId: null } });
  eq(ownerInvite.status, 403, 'owner invite status');
  const adminInvite = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-a', email: 'badadmin@example.test', role: 'admin', departmentId: null } });
  eq(adminInvite.status, 403, 'admin invite status');
});

await test('manager and employee cannot invite', async () => {
  const { env } = await makeEnv();
  const manager = await memberToken(env, 'managera@example.test');
  const managerRes = await call(env, 'POST', '/api/invitations', { token: manager, body: { companyId: 'comp-a', email: 'badinvite@example.test', role: 'employee', departmentId: null } });
  eq(managerRes.status, 403, 'manager status');
  const employee = await memberToken(env, 'employeea@example.test');
  const employeeRes = await call(env, 'POST', '/api/invitations', { token: employee, body: { companyId: 'comp-a', email: 'badinvite2@example.test', role: 'employee', departmentId: null } });
  eq(employeeRes.status, 403, 'employee status');
});

await test('owner invite any role allowed', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/invitations', { token: owner, body: { companyId: 'comp-a', email: 'ownerinvite@example.test', role: 'admin', departmentId: null } });
  eq(res.status, 200, 'status');
  ok(res.data.inviteLink, 'link');
});

await test('invite to another company denied', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const res = await call(env, 'POST', '/api/invitations', { token: admin, body: { companyId: 'comp-b', email: 'crossinvite@example.test', role: 'employee', departmentId: null } });
  eq(res.status, 404, 'status');
});

await test('owner promotes employee to manager', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: owner, body: { userId: 'dash-employee-a', role: 'manager', departmentId: 'dept-a1' } });
  eq(res.status, 200, 'status');
  eq(res.data.member.role, 'manager', 'new role');
  const members = await call(env, 'GET', '/api/companies/comp-a/members', { token: owner });
  const row = members.data.members.find((m) => m.userId === 'dash-employee-a');
  eq(row.role, 'manager', 'stored role');
});

await test('department-only member change keeps role', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: owner, body: { userId: 'dash-employee-a', departmentId: 'dept-a2' } });
  eq(res.status, 200, 'status');
  eq(res.data.member.role, 'employee', 'role kept');
  eq(res.data.member.departmentId, 'dept-a2', 'new department');
});

await test('member change with neither field rejected', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: owner, body: { userId: 'dash-employee-a' } });
  eq(res.status, 400, 'status');
});

await test('self-promotion denied', async () => {
  const { env } = await makeEnv();
  const employee = await memberToken(env, 'employeea@example.test');
  const employeeRes = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: employee, body: { userId: 'dash-employee-a', role: 'admin', departmentId: null } });
  eq(employeeRes.status, 403, 'employee status');
  const admin = await memberToken(env, 'admina@example.test');
  const adminRes = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: admin, body: { userId: 'dash-admin-a', role: 'owner', departmentId: null } });
  eq(adminRes.status, 403, 'admin status');
});

await test('sole-owner demotion denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: owner, body: { userId: 'kluzar-user-owner-a', role: 'admin', departmentId: null } });
  eq(res.status, 403, 'status');
});

await test('admin cannot promote to admin or owner', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const toAdmin = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: admin, body: { userId: 'dash-employee-a', role: 'admin', departmentId: null } });
  eq(toAdmin.status, 403, 'to admin status');
  const toOwner = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: admin, body: { userId: 'dash-employee-a', role: 'owner', departmentId: null } });
  eq(toOwner.status, 403, 'to owner status');
});

await test('admin cannot change owner or admin rows', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const ownerRow = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: admin, body: { userId: 'kluzar-user-owner-a', role: 'manager', departmentId: null } });
  eq(ownerRow.status, 403, 'owner row status');
  const adminRow = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: admin, body: { userId: 'kluzar-user-admin2-a', role: 'manager', departmentId: null } });
  eq(adminRow.status, 403, 'admin row status');
});

await test('manager cannot change roles', async () => {
  const { env } = await makeEnv();
  const manager = await memberToken(env, 'managera@example.test');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: manager, body: { userId: 'dash-employee-a', role: 'manager', departmentId: null } });
  eq(res.status, 403, 'status');
});

await test('cross-company role change denied', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const res = await call(env, 'POST', '/api/companies/comp-b/members/update', { token: admin, body: { userId: 'dash-employee-b', role: 'manager', departmentId: null } });
  eq(res.status, 404, 'status');
});

await test('manipulated body fields are ignored', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: owner, body: { userId: 'dash-employee-a', role: 'manager', departmentId: 'dept-a1', companyId: 'comp-b', owner_user_id: 'kluzar-user-owner-b' } });
  eq(res.status, 200, 'status');
  const ownerB = await ownerToken(env, privateKey, 'kluzar-user-owner-b', 'sid-owner-b');
  const membersB = await call(env, 'GET', '/api/companies/comp-b/members', { token: ownerB });
  const rowB = membersB.data.members.find((m) => m.userId === 'dash-employee-b');
  eq(rowB.role, 'employee', 'comp-b unchanged');
});

await test('owner removes employee and sessions die immediately', async () => {
  const { env, privateKey } = await makeEnv();
  const employee = await memberToken(env, 'employeea@example.test');
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: owner, body: { userId: 'dash-employee-a' } });
  eq(res.status, 200, 'status');
  const me = await call(env, 'GET', '/api/auth/me', { token: employee });
  eq(me.status, 401, 'old token status');
  const code = await totpCode(MEMBER_SECRET, Date.now());
  const step1 = await call(env, 'POST', '/api/auth/member-login/step1', { body: { email: 'employeea@example.test', password: MEMBER_PASSWORD } });
  const login = await call(env, 'POST', '/api/auth/member-login/verify', { body: { loginToken: step1.data.loginToken, code } });
  eq(login.status, 403, 'relogin status');
  const members = await call(env, 'GET', '/api/companies/comp-a/members', { token: owner });
  eq(members.data.members.some((m) => m.userId === 'dash-employee-a'), false, 'member gone');
});

await test('sole-owner self-removal denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: owner, body: { userId: 'kluzar-user-owner-a' } });
  eq(res.status, 403, 'status');
});

await test('admin cannot remove owner or admin', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const ownerRes = await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: admin, body: { userId: 'kluzar-user-owner-a' } });
  eq(ownerRes.status, 403, 'owner status');
  const adminRes = await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: admin, body: { userId: 'kluzar-user-admin2-a' } });
  eq(adminRes.status, 403, 'admin status');
});

await test('cross-company remove denied', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const res = await call(env, 'POST', '/api/companies/comp-b/members/remove', { token: admin, body: { userId: 'dash-employee-b' } });
  eq(res.status, 404, 'status');
});

await test('transfer by non-owner denied', async () => {
  const { env } = await makeEnv();
  const admin = await memberToken(env, 'admina@example.test');
  const res = await call(env, 'POST', '/api/companies/comp-a/transfer', { token: admin, body: { newOwnerUserId: 'kluzar-user-admin2-a' } });
  eq(res.status, 403, 'status');
});

await test('transfer to non-admin denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/transfer', { token: owner, body: { newOwnerUserId: 'dash-employee-a' } });
  eq(res.status, 400, 'status');
});

await test('transfer to non-member denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/transfer', { token: owner, body: { newOwnerUserId: 'nobody-at-all' } });
  eq(res.status, 404, 'status');
});

await test('successful transfer swaps roles and owner id', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/transfer', { token: owner, body: { newOwnerUserId: 'kluzar-user-admin2-a' } });
  eq(res.status, 200, 'status');
  const detail = await call(env, 'GET', '/api/companies/comp-a', { token: owner });
  eq(detail.data.company.ownerUserId, 'kluzar-user-admin2-a', 'new owner id');
  const members = await call(env, 'GET', '/api/companies/comp-a/members', { token: owner });
  const oldOwner = members.data.members.find((m) => m.userId === 'kluzar-user-owner-a');
  eq(oldOwner.role, 'admin', 'old owner now admin');
  const newOwner = members.data.members.find((m) => m.userId === 'kluzar-user-admin2-a');
  eq(newOwner.role, 'owner', 'new owner role');
  const admin2 = await ownerToken(env, privateKey, 'kluzar-user-admin2-a', 'sid-admin2-a');
  const me = await call(env, 'GET', '/api/auth/me', { token: admin2 });
  eq(me.data.companies.find((c) => c.id === 'comp-a').role, 'owner', 'assertion role');
});

await test('department duplicate name denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments', { token: owner, body: { name: 'Dept A1', managerUserId: null } });
  eq(res.status, 400, 'status');
});

await test('department delete blocked by members', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments/delete', { token: owner, body: { deptId: 'dept-a2' } });
  eq(res.status, 400, 'status');
  ok(res.data.error.includes('members'), 'message mentions members');
});

await test('department delete blocked by projects only', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments/delete', { token: owner, body: { deptId: 'dept-proj-only' } });
  eq(res.status, 400, 'status');
  ok(res.data.error.includes('projects'), 'message mentions projects');
});

await test('department delete empty succeeds', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments/delete', { token: owner, body: { deptId: 'dept-empty' } });
  eq(res.status, 200, 'status');
  const list = await call(env, 'GET', '/api/companies/comp-a/departments', { token: owner });
  eq(list.data.departments.some((d) => d.id === 'dept-empty'), false, 'dept gone');
});

await test('department cross-company denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const create = await call(env, 'POST', '/api/companies/comp-b/departments', { token: owner, body: { name: 'Dept Cross', managerUserId: null } });
  eq(create.status, 404, 'create status');
  const del = await call(env, 'POST', '/api/companies/comp-b/departments/delete', { token: owner, body: { deptId: 'dept-b1' } });
  eq(del.status, 404, 'delete status');
});

await test('department manage forbidden for manager and employee', async () => {
  const { env } = await makeEnv();
  const manager = await memberToken(env, 'managera@example.test');
  const create = await call(env, 'POST', '/api/companies/comp-a/departments', { token: manager, body: { name: 'Dept Bad', managerUserId: null } });
  eq(create.status, 403, 'manager create status');
  const employee = await memberToken(env, 'employeea@example.test');
  const update = await call(env, 'POST', '/api/companies/comp-a/departments/update', { token: employee, body: { deptId: 'dept-a1', name: 'Dept Bad' } });
  eq(update.status, 403, 'employee update status');
});

await test('department manager must be a member', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments', { token: owner, body: { name: 'Dept Bad Manager', managerUserId: 'nobody-at-all' } });
  eq(res.status, 400, 'status');
});

await test('department rename duplicate denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/departments/update', { token: owner, body: { deptId: 'dept-a2', name: 'Dept A1' } });
  eq(res.status, 400, 'status');
});

await test('department list scoping by role', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const ownerRes = await call(env, 'GET', '/api/companies/comp-a/departments', { token: owner });
  eq(ownerRes.data.total, 4, 'owner total');
  const manager = await memberToken(env, 'managera@example.test');
  const managerRes = await call(env, 'GET', '/api/companies/comp-a/departments', { token: manager });
  eq(managerRes.data.total, 1, 'manager total');
  eq(managerRes.data.departments[0].id, 'dept-a1', 'manager dept');
  const employee = await memberToken(env, 'employeea@example.test');
  const employeeRes = await call(env, 'GET', '/api/companies/comp-a/departments', { token: employee });
  eq(employeeRes.data.total, 1, 'employee total');
});

await test('invitation list and states', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'GET', '/api/companies/comp-a/invitations', { token: owner });
  eq(res.status, 200, 'status');
  const states = {};
  for (const invite of res.data.invitations) states[invite.id] = invite.state;
  eq(states['invite-pending-a'], 'pending', 'pending state');
  eq(states['invite-used-a'], 'used', 'used state');
  eq(states['invite-expired-a'], 'expired', 'expired state');
  eq(states['invite-revoked-a'], 'revoked', 'revoked state');
  ok(!JSON.stringify(res.data).includes('token_hash'), 'no token hash leaked');
});

await test('invitation list forbidden for manager and employee', async () => {
  const { env } = await makeEnv();
  const manager = await memberToken(env, 'managera@example.test');
  const managerRes = await call(env, 'GET', '/api/companies/comp-a/invitations', { token: manager });
  eq(managerRes.status, 403, 'manager status');
  const employee = await memberToken(env, 'employeea@example.test');
  const employeeRes = await call(env, 'GET', '/api/companies/comp-a/invitations', { token: employee });
  eq(employeeRes.status, 403, 'employee status');
});

await test('revoke pending invitation succeeds', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const res = await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: owner, body: { invitationId: 'invite-pending-a' } });
  eq(res.status, 200, 'status');
  const list = await call(env, 'GET', '/api/companies/comp-a/invitations', { token: owner });
  const row = list.data.invitations.find((i) => i.id === 'invite-pending-a');
  eq(row.state, 'revoked', 'revoked state');
});

await test('revoke used expired revoked denied', async () => {
  const { env, privateKey } = await makeEnv();
  const owner = await ownerToken(env, privateKey, 'kluzar-user-owner-a', 'sid-owner-a');
  const used = await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: owner, body: { invitationId: 'invite-used-a' } });
  eq(used.status, 400, 'used status');
  const expired = await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: owner, body: { invitationId: 'invite-expired-a' } });
  eq(expired.status, 400, 'expired status');
  const revoked = await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: owner, body: { invitationId: 'invite-revoked-a' } });
  eq(revoked.status, 400, 'revoked status');
});

await test('revoked invite claim denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/auth/invite/claim', { body: { token: 'revoked-invite-token-test' } });
  eq(res.status, 404, 'status');
});

await test('revoke forbidden for manager', async () => {
  const { env } = await makeEnv();
  const manager = await memberToken(env, 'managera@example.test');
  const res = await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: manager, body: { invitationId: 'invite-pending-a' } });
  eq(res.status, 403, 'status');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exit(1);
