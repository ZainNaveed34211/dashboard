import handler from '../worker/src/index.js';
import { ShimDB } from './d1shim.mjs';
import { sha256Hex } from '../worker/src/crypto.js';

const DASH_ORIGIN = 'https://dash.kluzar.com';
const WRONG_ORIGIN = 'https://evil.example.test';
const FUTURE = new Date(Date.now() + 86400000).toISOString();

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

async function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db };
  const now = new Date().toISOString();
  const entitlements = [
    ['kluzar-user-owner-a', 'max', 'active'],
    ['kluzar-user-owner-b', 'max', 'active'],
    ['kluzar-user-starter', 'free', 'active'],
    ['kluzar-user-growth', 'growth', 'active'],
    ['kluzar-user-expired', 'max', 'expired'],
    ['kluzar-user-rate', 'max', 'active'],
  ];
  for (const [userId, plan, status] of entitlements) {
    db.insert('entitlements', { user_id: userId, plan, status });
  }
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-b', owner_user_id: 'kluzar-user-owner-b', name: 'Beta Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-expired', owner_user_id: 'kluzar-user-expired', name: 'Expired Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-rate', owner_user_id: 'kluzar-user-rate', name: 'Rate Company', created_at: now, updated_at: now });
  const members = [
    ['comp-a', 'kluzar-user-owner-a', 'owner', null, 'active'],
    ['comp-a', 'kluzar-user-admin-a', 'admin', null, 'active'],
    ['comp-a', 'dash-manager-a', 'manager', 'dept-a1', 'active'],
    ['comp-a', 'dash-employee-a', 'employee', 'dept-a1', 'active'],
    ['comp-a', 'dash-employee2-a', 'employee', 'dept-a2', 'active'],
    ['comp-a', 'dash-removed-a', 'employee', 'dept-a1', 'removed'],
    ['comp-b', 'kluzar-user-owner-b', 'owner', null, 'active'],
    ['comp-b', 'dash-employee-b', 'employee', 'dept-b1', 'active'],
    ['comp-expired', 'kluzar-user-expired', 'owner', null, 'active'],
    ['comp-rate', 'kluzar-user-rate', 'owner', null, 'active'],
  ];
  for (const [companyId, userId, role, dept, status] of members) {
    db.insert('company_members', { company_id: companyId, user_id: userId, role, department_id: dept, status, invited_by: null, joined_at: now });
  }
  db.insert('departments', { id: 'dept-a1', company_id: 'comp-a', name: 'Dept A1', manager_user_id: null, created_at: now });
  db.insert('departments', { id: 'dept-a2', company_id: 'comp-a', name: 'Dept A2', manager_user_id: null, created_at: now });
  db.insert('dashboard_layouts', { id: 'layout-personal-a', company_id: 'comp-a', user_id: 'kluzar-user-owner-a', widgets: JSON.stringify([{ id: 'team', x: 0, y: 0, w: 12, h: 4 }]), is_company_default: 0, created_at: now, updated_at: now });
  db.insert('dashboard_layouts', { id: 'layout-default-a', company_id: 'comp-a', user_id: null, widgets: JSON.stringify([{ id: 'departments', x: 0, y: 0, w: 12, h: 4 }]), is_company_default: 1, created_at: now, updated_at: now });
  for (let i = 1; i <= 60; i++) {
    const stamp = '2026-01-01T00:' + String(i).padStart(2, '0') + ':00.000Z';
    db.insert('activity_logs', { id: 'log-' + i, company_id: 'comp-a', actor_user_id: 'kluzar-user-owner-a', action: 'test_action', target_type: 'company', target_id: 'comp-a', created_at: stamp });
  }
  const tokens = {
    ownerA: 'int-owner-a-token-test',
    adminA: 'int-admin-a-token-test',
    managerA: 'int-manager-a-token-test',
    employeeA: 'int-employee-a-token-test',
    removedA: 'int-removed-a-token-test',
    ownerB: 'int-owner-b-token-test',
    starter: 'int-starter-token-test',
    growth: 'int-growth-token-test',
    expired: 'int-expired-token-test',
    rate: 'int-rate-token-test',
  };
  const tokenUsers = {
    ownerA: 'kluzar-user-owner-a',
    adminA: 'kluzar-user-admin-a',
    managerA: 'dash-manager-a',
    employeeA: 'dash-employee-a',
    removedA: 'dash-removed-a',
    ownerB: 'kluzar-user-owner-b',
    starter: 'kluzar-user-starter',
    growth: 'kluzar-user-growth',
    expired: 'kluzar-user-expired',
    rate: 'kluzar-user-rate',
  };
  for (const [key, token] of Object.entries(tokens)) {
    const hash = await sha256Hex(token);
    db.insert('dashboard_sessions', { id: 'sess-' + key, user_id: tokenUsers[key], user_type: 'owner', token_hash: hash, purpose: 'session', company_id: null, expires_at: FUTURE, created_at: now });
  }
  return { env, db, tokens };
}

await test('router layout get guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-a');
  eq(res.status, 401, 'status');
});

await test('router layout get personal layout for owner', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-a', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  eq(res.data.layout.source, 'personal', 'source');
  eq(res.data.layout.widgets[0].id, 'team', 'widget id');
});

await test('router layout get falls back to company default', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-a', { token: tokens.adminA });
  eq(res.status, 200, 'status');
  eq(res.data.layout.source, 'company-default', 'source');
  eq(res.data.layout.widgets[0].id, 'departments', 'widget id');
});

await test('router layout get falls back to built-in default', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-b', { token: tokens.ownerB });
  eq(res.status, 200, 'status');
  eq(res.data.layout.source, 'built-in', 'source');
  ok(res.data.layout.widgets.length >= 5, 'built-in widget count');
});

await test('router layout get cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-b', { token: tokens.ownerA });
  eq(res.status, 404, 'status');
});

await test('router layout get removed member denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-a', { token: tokens.removedA });
  eq(res.status, 404, 'status');
});

await test('router layout get expired company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts?company_id=comp-expired', { token: tokens.expired });
  eq(res.status, 403, 'status');
});

await test('router layout save personal and reload', async () => {
  const { env, tokens } = await makeEnv();
  const widgets = [{ id: 'overview', x: 0, y: 0, w: 12, h: 4 }, { id: 'activity', x: 0, y: 4, w: 6, h: 4 }];
  const saved = await call(env, 'POST', '/api/layouts', { token: tokens.employeeA, body: { companyId: 'comp-a', widgets } });
  eq(saved.status, 200, 'save status');
  const loaded = await call(env, 'GET', '/api/layouts?company_id=comp-a', { token: tokens.employeeA });
  eq(loaded.status, 200, 'load status');
  eq(loaded.data.layout.source, 'personal', 'source');
  eq(loaded.data.layout.widgets.length, 2, 'widget count');
  eq(loaded.data.layout.widgets[1].id, 'activity', 'second widget');
});

await test('router layout save invalid widget rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/layouts', { token: tokens.ownerA, body: { companyId: 'comp-a', widgets: [{ id: 'nope', x: 0, y: 0, w: 12, h: 4 }] } });
  eq(res.status, 400, 'status');
});

await test('router layout save too many widgets rejected', async () => {
  const { env, tokens } = await makeEnv();
  const widgets = [];
  for (let i = 0; i < 21; i++) widgets.push({ id: 'overview', x: 0, y: i, w: 12, h: 4 });
  const res = await call(env, 'POST', '/api/layouts', { token: tokens.ownerA, body: { companyId: 'comp-a', widgets } });
  eq(res.status, 400, 'status');
});

await test('router layout save strips injected fields', async () => {
  const { env, tokens } = await makeEnv();
  const widgets = [{ id: 'overview', x: 0, y: 0, w: 12, h: 4, admin: true, role: 'owner' }];
  const saved = await call(env, 'POST', '/api/layouts', { token: tokens.ownerA, body: { companyId: 'comp-a', widgets } });
  eq(saved.status, 200, 'save status');
  eq(saved.data.layout.widgets[0].admin, undefined, 'admin stripped');
  eq(saved.data.layout.widgets[0].role, undefined, 'role stripped');
});

await test('router company default get and set rules', async () => {
  const { env, tokens } = await makeEnv();
  const before = await call(env, 'GET', '/api/layouts/company-default?company_id=comp-a', { token: tokens.managerA });
  eq(before.status, 200, 'get status');
  eq(before.data.layout.source, 'company-default', 'get source');
  const denied = await call(env, 'POST', '/api/layouts/company-default', { token: tokens.managerA, body: { companyId: 'comp-a', widgets: [{ id: 'team', x: 0, y: 0, w: 12, h: 4 }] } });
  eq(denied.status, 403, 'manager set status');
  const widgets = [{ id: 'activity', x: 0, y: 0, w: 12, h: 4 }];
  const set = await call(env, 'POST', '/api/layouts/company-default', { token: tokens.adminA, body: { companyId: 'comp-a', widgets } });
  eq(set.status, 200, 'admin set status');
  const after = await call(env, 'GET', '/api/layouts/company-default?company_id=comp-a', { token: tokens.employeeA });
  eq(after.status, 200, 'after status');
  eq(after.data.layout.widgets[0].id, 'activity', 'after widget');
  eq(after.data.layout.widgets.length, 1, 'exactly one default row');
});

await test('router company default cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/layouts/company-default?company_id=comp-b', { token: tokens.ownerA });
  eq(res.status, 404, 'status');
});

await test('router company create via router', async () => {
  const { env, db, tokens } = await makeEnv();
  const denied = await call(env, 'POST', '/api/companies', { token: tokens.growth, body: { name: 'Nope Company' } });
  eq(denied.status, 403, 'growth create status');
  const res = await call(env, 'POST', '/api/companies', { token: tokens.ownerA, body: { name: 'Gamma Company' } });
  eq(res.status, 200, 'create status');
  ok(res.data.company.id, 'company id');
  const memberRows = await db.prepare('SELECT * FROM company_members WHERE company_id = ? AND user_id = ?').bind(res.data.company.id, 'kluzar-user-owner-a').all();
  eq(memberRows.results.length, 1, 'owner membership row');
  const logRows = await db.prepare('SELECT * FROM activity_logs WHERE company_id = ? AND action = ?').bind(res.data.company.id, 'company_created').all();
  eq(logRows.results.length, 1, 'company created log');
});

await test('router company create guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies', { body: { name: 'Nope Company' } });
  eq(res.status, 401, 'status');
});

await test('router activity newest first default limit', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/activity', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  eq(res.data.activity.length, 20, 'default count');
  eq(res.data.total, 60, 'total');
  eq(res.data.activity[0].id, undefined, 'no row id leaked');
  eq(res.data.activity[0].action, 'test_action', 'action');
  eq(res.data.activity[0].targetType, 'company', 'target type');
  eq(res.data.activity[0].createdAt, '2026-01-01T00:60:00.000Z', 'newest first');
  ok(!('token_hash' in res.data.activity[0]), 'no token hash');
  ok(!('password' in res.data.activity[0]), 'no password field');
});

await test('router activity limit capped at 50', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/activity?limit=200', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  eq(res.data.activity.length, 50, 'capped count');
  const res50 = await call(env, 'GET', '/api/companies/comp-a/activity?limit=50', { token: tokens.ownerA });
  eq(res50.data.activity.length, 50, 'limit 50 count');
});

await test('router activity cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-b/activity', { token: tokens.ownerA });
  eq(res.status, 404, 'status');
});

await test('router activity guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/activity');
  eq(res.status, 401, 'status');
});

await test('router layout CORS dash origin present wrong origin absent', async () => {
  const { env } = await makeEnv();
  const dash = await call(env, 'OPTIONS', '/api/layouts?company_id=comp-a', { origin: DASH_ORIGIN });
  eq(dash.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash ACAO');
  const wrong = await call(env, 'OPTIONS', '/api/layouts?company_id=comp-a', { origin: WRONG_ORIGIN });
  eq(wrong.headers.get('Access-Control-Allow-Origin'), null, 'wrong ACAO absent');
  const act = await call(env, 'OPTIONS', '/api/companies/comp-a/activity', { origin: DASH_ORIGIN });
  eq(act.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'activity dash ACAO');
  const actWrong = await call(env, 'OPTIONS', '/api/companies/comp-a/activity', { origin: WRONG_ORIGIN });
  eq(actWrong.headers.get('Access-Control-Allow-Origin'), null, 'activity wrong ACAO absent');
});

await test('router layout write rate limit still enforced once', async () => {
  const { env, tokens } = await makeEnv();
  let last = null;
  for (let i = 0; i < 601; i++) {
    last = await call(env, 'POST', '/api/layouts', { token: tokens.rate, body: { companyId: 'comp-rate', widgets: [{ id: 'overview', x: 0, y: 0, w: 12, h: 4 }] } });
  }
  eq(last.status, 429, '601st write status');
});

console.log('Phase 5 integration: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
