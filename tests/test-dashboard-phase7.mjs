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

async function callRaw(env, method, path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.origin !== false) headers.Origin = opts.origin || DASH_ORIGIN;
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const req = new Request('https://dashboard-api.kluzar.com' + path, { method, headers });
  const res = await handler.fetch(req, env);
  return { status: res.status, headers: res.headers, text: await res.text(), contentType: res.headers.get('Content-Type') };
}

async function callForm(env, path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.origin !== false) headers.Origin = opts.origin || DASH_ORIGIN;
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const form = new FormData();
  if (opts.fields) {
    for (const [key, value] of Object.entries(opts.fields)) form.append(key, value);
  }
  if (opts.file) form.append('file', opts.file);
  const req = new Request('https://dashboard-api.kluzar.com' + path, { method: 'POST', headers, body: form });
  const res = await handler.fetch(req, env);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: res.headers };
}

function testFile(name, type, size) {
  return new File([new Uint8Array(size)], name, { type });
}

function testTextFile(name, type, text) {
  return new File([new TextEncoder().encode(text)], name, { type });
}

async function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db };
  const now = new Date().toISOString();
  const entitlements = [
    ['kluzar-user-owner-a', 'max', 'active'],
    ['kluzar-user-owner-b', 'max', 'active'],
    ['kluzar-user-free', 'free', 'active'],
    ['kluzar-user-growth', 'growth', 'active'],
    ['kluzar-user-expired', 'max', 'expired'],
    ['kluzar-user-rate', 'max', 'active'],
  ];
  for (const [userId, plan, status] of entitlements) {
    db.insert('entitlements', { user_id: userId, plan, status });
  }
  db.insert('companies', { id: 'comp-a', owner_user_id: 'kluzar-user-owner-a', name: 'Alpha Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-b', owner_user_id: 'kluzar-user-owner-b', name: 'Beta Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-free', owner_user_id: 'kluzar-user-free', name: 'Free Company', created_at: now, updated_at: now });
  db.insert('companies', { id: 'comp-growth', owner_user_id: 'kluzar-user-growth', name: 'Growth Company', created_at: now, updated_at: now });
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
    ['comp-free', 'kluzar-user-free', 'owner', null, 'active'],
    ['comp-growth', 'kluzar-user-growth', 'owner', null, 'active'],
    ['comp-expired', 'kluzar-user-expired', 'owner', null, 'active'],
    ['comp-rate', 'kluzar-user-rate', 'owner', null, 'active'],
  ];
  for (const [companyId, userId, role, dept, status] of members) {
    db.insert('company_members', { company_id: companyId, user_id: userId, role, department_id: dept, status, invited_by: null, joined_at: now });
  }
  db.insert('departments', { id: 'dept-a1', company_id: 'comp-a', name: 'Dept A1', manager_user_id: null, created_at: now });
  db.insert('departments', { id: 'dept-a2', company_id: 'comp-a', name: 'Dept A2', manager_user_id: null, created_at: now });
  db.insert('departments', { id: 'dept-b1', company_id: 'comp-b', name: 'Dept B1', manager_user_id: null, created_at: now });
  db.insert('projects', { id: 'proj-a1', company_id: 'comp-a', department_id: 'dept-a1', name: 'Project A1', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: now, updated_at: now });
  db.insert('projects', { id: 'proj-b', company_id: 'comp-b', department_id: 'dept-b1', name: 'Project B', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-b', start_date: null, end_date: null, created_at: now, updated_at: now });
  db.insert('tasks', { id: 'task-a1', company_id: 'comp-a', project_id: 'proj-a1', assignee_user_id: 'dash-employee-a', title: 'Task A1', description: '', status: 'todo', priority: 'medium', category: '', due_at: null, created_by: 'kluzar-user-owner-a', created_at: now, updated_at: now });
  db.insert('tasks', { id: 'task-a2', company_id: 'comp-a', project_id: null, assignee_user_id: 'dash-employee2-a', title: 'Task A2', description: '', status: 'todo', priority: 'medium', category: '', due_at: null, created_by: 'kluzar-user-owner-a', created_at: now, updated_at: now });
  db.insert('tasks', { id: 'task-b', company_id: 'comp-b', project_id: 'proj-b', assignee_user_id: 'dash-employee-b', title: 'Task B', description: '', status: 'todo', priority: 'medium', category: '', due_at: null, created_by: 'kluzar-user-owner-b', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-manager-a', email: 'manager-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee-a', email: 'employee-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: 'Ayesha', last_name: 'Khan', job_title: 'Designer', phone: '100', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee2-a', email: 'employee2-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee-b', email: 'employee-b@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('users', { id: 'kluzar-user-owner-a', email: 'owner-a@example.test', firstName: 'Owner', lastName: 'Alpha', phone: '111', status: 'active' });
  db.insert('documents', { id: 'doc-a1', company_id: 'comp-a', project_id: null, task_id: 'task-a1', r2_key: 'd1:doc-a1', filename: 'report.pdf', mime: 'application/pdf', size: 100, uploaded_by: 'dash-employee-a', created_at: now, content: new TextEncoder().encode('hello-doc-a1'), external_link: '' });
  db.insert('documents', { id: 'doc-a2', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-a2', filename: 'notes.txt', mime: 'text/plain', size: 250, uploaded_by: 'kluzar-user-owner-a', created_at: now, content: new TextEncoder().encode('hello-doc-a2'), external_link: '' });
  db.insert('documents', { id: 'doc-link', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-link', filename: 'external-report.pdf', mime: '', size: 0, uploaded_by: 'kluzar-user-owner-a', created_at: now, content: null, external_link: 'https://example.test/shared/report.pdf' });
  db.insert('documents', { id: 'doc-b', company_id: 'comp-b', project_id: null, task_id: null, r2_key: 'd1:doc-b', filename: 'secret.pdf', mime: 'application/pdf', size: 50, uploaded_by: 'kluzar-user-owner-b', created_at: now, content: new TextEncoder().encode('hello-doc-b'), external_link: '' });
  db.insert('announcements', { id: 'ann-a1', company_id: 'comp-a', author_user_id: 'dash-manager-a', title: 'Welcome', body: 'Hello team', created_at: now, updated_at: now });
  db.insert('announcements', { id: 'ann-b', company_id: 'comp-b', author_user_id: 'kluzar-user-owner-b', title: 'Beta news', body: 'Hi', created_at: now, updated_at: now });
  db.insert('attendance_records', { id: 'att-a1', company_id: 'comp-a', user_id: 'dash-employee-a', date: '2026-10-30', status: 'present', check_in_at: now, check_out_at: null, note: '', created_at: now, updated_at: now });
  db.insert('attendance_records', { id: 'att-a2', company_id: 'comp-a', user_id: 'dash-employee2-a', date: '2026-10-30', status: 'present', check_in_at: now, check_out_at: now, note: '', created_at: now, updated_at: now });
  const tokens = {
    ownerA: 'p7-owner-a-token-test',
    adminA: 'p7-admin-a-token-test',
    managerA: 'p7-manager-a-token-test',
    employeeA: 'p7-employee-a-token-test',
    employee2A: 'p7-employee2-a-token-test',
    removedA: 'p7-removed-a-token-test',
    ownerB: 'p7-owner-b-token-test',
    employeeB: 'p7-employee-b-token-test',
    freeOwner: 'p7-free-token-test',
    growthOwner: 'p7-growth-token-test',
    expired: 'p7-expired-token-test',
    rate: 'p7-rate-token-test',
  };
  const tokenUsers = {
    ownerA: 'kluzar-user-owner-a',
    adminA: 'kluzar-user-admin-a',
    managerA: 'dash-manager-a',
    employeeA: 'dash-employee-a',
    employee2A: 'dash-employee2-a',
    removedA: 'dash-removed-a',
    ownerB: 'kluzar-user-owner-b',
    employeeB: 'dash-employee-b',
    freeOwner: 'kluzar-user-free',
    growthOwner: 'kluzar-user-growth',
    expired: 'kluzar-user-expired',
    rate: 'kluzar-user-rate',
  };
  for (const [key, token] of Object.entries(tokens)) {
    const hash = await sha256Hex(token);
    db.insert('dashboard_sessions', { id: 'sess-' + key, user_id: tokenUsers[key], user_type: 'owner', token_hash: hash, purpose: 'session', company_id: null, expires_at: FUTURE, created_at: now });
  }
  return { env, db, tokens };
}

await test('documents guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/documents');
  eq(res.status, 401, 'status');
});

await test('documents free growth expired denial', async () => {
  const { env, tokens } = await makeEnv();
  const free = await call(env, 'GET', '/api/companies/comp-free/documents', { token: tokens.freeOwner });
  eq(free.status, 403, 'free status');
  const growth = await call(env, 'GET', '/api/companies/comp-growth/documents', { token: tokens.growthOwner });
  eq(growth.status, 403, 'growth status');
  const expired = await call(env, 'GET', '/api/companies/comp-expired/documents', { token: tokens.expired });
  eq(expired.status, 403, 'expired status');
});

await test('documents owner list usage sum and no bytes leaked', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  eq(res.data.usage.totalSize, 350, 'usage total');
  eq(res.data.usage.count, 3, 'usage count');
  ok(!res.data.documents.some((d) => 'content' in d), 'no bytes leaked');
  const link = res.data.documents.find((d) => d.id === 'doc-link');
  ok(link, 'link doc listed');
  eq(link.externalLink, 'https://example.test/shared/report.pdf', 'link stored');
});

await test('documents cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const list = await call(env, 'GET', '/api/companies/comp-b/documents', { token: tokens.ownerA });
  eq(list.status, 404, 'list status');
  const download = await callRaw(env, 'GET', '/api/companies/comp-b/documents/doc-b/download', { token: tokens.ownerA });
  eq(download.status, 404, 'download status');
});

await test('documents guessed id denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-nope/download', { token: tokens.ownerA });
  eq(res.status, 404, 'status');
});

await test('upload owner success and usage grows', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('plan.pdf', 'application/pdf', 500) });
  eq(res.status, 200, 'status');
  ok(res.data.document.id, 'doc id');
  const list = await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.ownerA });
  eq(list.data.usage.totalSize, 850, 'usage after upload');
  eq(list.data.usage.count, 4, 'count after upload');
});

await test('download bytes equal upload bytes', async () => {
  const { env, tokens } = await makeEnv();
  const up = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testTextFile('roundtrip.txt', 'text/plain', 'round-trip-bytes-123') });
  eq(up.status, 200, 'upload status');
  const down = await callRaw(env, 'GET', '/api/companies/comp-a/documents/' + up.data.document.id + '/download', { token: tokens.employeeA });
  eq(down.status, 200, 'download status');
  eq(down.text, 'round-trip-bytes-123', 'bytes equal');
  eq(down.contentType, 'text/plain', 'content type');
});

await test('upload employee own task success', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, file: testFile('work.png', 'image/png', 200), fields: { taskId: 'task-a1' } });
  eq(res.status, 200, 'status');
  eq(res.data.document.taskId, 'task-a1', 'task link');
});

await test('upload employee without task denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, file: testFile('work.png', 'image/png', 200) });
  eq(res.status, 403, 'status');
});

await test('upload employee other task denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, file: testFile('work.png', 'image/png', 200), fields: { taskId: 'task-a2' } });
  eq(res.status, 403, 'status');
});

await test('upload over 1MB rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('big.pdf', 'application/pdf', 1024 * 1024 + 1) });
  eq(res.status, 400, 'status');
});

await test('upload exactly 1MB accepted', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('exact.pdf', 'application/pdf', 1024 * 1024) });
  eq(res.status, 200, 'status');
  eq(res.data.document.size, 1024 * 1024, 'size');
});

await test('upload disallowed type rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('run.exe', 'application/x-msdownload', 100) });
  eq(res.status, 400, 'status');
});

await test('upload type mismatch rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('report.pdf', 'image/png', 100) });
  eq(res.status, 400, 'status');
});

await test('upload traversal filename rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, file: testFile('../../evil.pdf', 'application/pdf', 100) });
  eq(res.status, 400, 'status');
});

await test('download seeded bytes and type', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-a1/download', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  eq(res.text, 'hello-doc-a1', 'bytes');
  eq(res.contentType, 'application/pdf', 'content type');
});

await test('download link-only document rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-link/download', { token: tokens.ownerA });
  eq(res.status, 400, 'status');
});

await test('link-only upload valid https accepted', async () => {
  const { env, tokens } = await makeEnv();
  const res = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, fields: { filename: 'big-deck.pdf', externalLink: 'https://example.test/shared/deck.pdf' } });
  eq(res.status, 200, 'status');
  eq(res.data.document.externalLink, 'https://example.test/shared/deck.pdf', 'link stored');
  eq(res.data.document.size, 0, 'no bytes stored');
});

await test('link validation rejects http javascript and overlong', async () => {
  const { env, tokens } = await makeEnv();
  const http = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, fields: { filename: 'x.pdf', externalLink: 'http://example.test/x.pdf' } });
  eq(http.status, 400, 'http rejected');
  const js = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, fields: { filename: 'x.pdf', externalLink: 'javascript:alert(1)' } });
  eq(js.status, 400, 'javascript rejected');
  const long = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, fields: { filename: 'x.pdf', externalLink: 'https://example.test/' + 'a'.repeat(2000) } });
  eq(long.status, 400, 'overlong rejected');
  const neither = await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, fields: { filename: 'x.pdf' } });
  eq(neither.status, 400, 'neither file nor link rejected');
});

await test('delete employee other doc denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies/comp-a/documents/doc-a2/delete', { token: tokens.employeeA, body: { documentId: 'doc-a2' } });
  eq(res.status, 403, 'status');
});

await test('delete uploader own doc removes row', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies/comp-a/documents/doc-a1/delete', { token: tokens.employeeA, body: { documentId: 'doc-a1' } });
  eq(res.status, 200, 'status');
  const list = await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.ownerA });
  eq(list.data.documents.some((d) => d.id === 'doc-a1'), false, 'row removed');
  eq(list.data.usage.totalSize, 250, 'usage freed');
});

await test('delete manager any doc allowed', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies/comp-a/documents/doc-a2/delete', { token: tokens.managerA, body: { documentId: 'doc-a2' } });
  eq(res.status, 200, 'status');
});

await test('announcements list member ok', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/announcements', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  eq(res.data.total, 1, 'total');
  eq(res.data.announcements[0].id, 'ann-a1', 'ann id');
});

await test('announcements create manager ok employee denied', async () => {
  const { env, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/announcements', { token: tokens.managerA, body: { title: 'Update', body: 'News here' } });
  eq(created.status, 200, 'manager status');
  const denied = await call(env, 'POST', '/api/companies/comp-a/announcements', { token: tokens.employeeA, body: { title: 'Nope', body: 'Nope' } });
  eq(denied.status, 403, 'employee status');
});

await test('announcements cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies/comp-b/announcements', { token: tokens.managerA, body: { title: 'X', body: 'Y' } });
  eq(res.status, 404, 'status');
});

await test('announcements update and delete rules', async () => {
  const { env, tokens } = await makeEnv();
  const ownUpdate = await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/update', { token: tokens.managerA, body: { announcementId: 'ann-a1', title: 'Welcome edited' } });
  eq(ownUpdate.status, 200, 'author update');
  const adminUpdate = await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/update', { token: tokens.adminA, body: { announcementId: 'ann-a1', title: 'Admin edit' } });
  eq(adminUpdate.status, 200, 'admin update');
  const employeeEdit = await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/update', { token: tokens.employeeA, body: { announcementId: 'ann-a1', title: 'Hack' } });
  eq(employeeEdit.status, 403, 'employee update denied');
  const ownerDelete = await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/delete', { token: tokens.ownerA, body: { announcementId: 'ann-a1' } });
  eq(ownerDelete.status, 200, 'owner delete');
  const after = await call(env, 'GET', '/api/companies/comp-a/announcements', { token: tokens.ownerA });
  eq(after.data.total, 0, 'deleted');
});

await test('profile get member and update own', async () => {
  const { env, tokens } = await makeEnv();
  const got = await call(env, 'GET', '/api/profile', { token: tokens.employeeA });
  eq(got.status, 200, 'get status');
  eq(got.data.profile.firstName, 'Ayesha', 'first name');
  eq(got.data.profile.jobTitle, 'Designer', 'job title');
  const updated = await call(env, 'POST', '/api/profile/update', { token: tokens.employeeA, body: { jobTitle: 'Senior Designer', phone: '200' } });
  eq(updated.status, 200, 'update status');
  eq(updated.data.profile.jobTitle, 'Senior Designer', 'new title');
  eq(updated.data.profile.phone, '200', 'new phone');
  eq(updated.data.profile.firstName, 'Ayesha', 'first name kept');
});

await test('profile role injection stripped', async () => {
  const { env, tokens } = await makeEnv();
  const updated = await call(env, 'POST', '/api/profile/update', { token: tokens.employeeA, body: { jobTitle: 'Lead', role: 'owner', company_id: 'comp-b' } });
  eq(updated.status, 200, 'update status');
  const members = await call(env, 'GET', '/api/companies/comp-a/members', { token: tokens.ownerA });
  const row = members.data.members.find((m) => m.userId === 'dash-employee-a');
  ok(row, 'member row');
  eq(row.role, 'employee', 'role unchanged');
  eq(row.jobTitle, 'Lead', 'title updated');
});

await test('profile owner get and update rules', async () => {
  const { env, tokens } = await makeEnv();
  const got = await call(env, 'GET', '/api/profile', { token: tokens.ownerA });
  eq(got.status, 200, 'get status');
  eq(got.data.profile.firstName, 'Owner', 'owner first name');
  const updated = await call(env, 'POST', '/api/profile/update', { token: tokens.ownerA, body: { jobTitle: 'Boss' } });
  eq(updated.status, 403, 'owner update denied');
});

await test('attendance check-in checkout flow', async () => {
  const { env, tokens } = await makeEnv();
  const inRes = await call(env, 'POST', '/api/companies/comp-a/attendance/check-in', { token: tokens.employeeA, body: { date: '2026-10-31', status: 'remote', note: 'Working from home' } });
  eq(inRes.status, 200, 'check-in status');
  eq(inRes.data.attendance.status, 'remote', 'remote status');
  const again = await call(env, 'POST', '/api/companies/comp-a/attendance/check-in', { token: tokens.employeeA, body: { date: '2026-10-31' } });
  eq(again.status, 400, 'second check-in denied');
  const outRes = await call(env, 'POST', '/api/companies/comp-a/attendance/check-out', { token: tokens.employeeA, body: { date: '2026-10-31' } });
  eq(outRes.status, 200, 'check-out status');
  ok(outRes.data.attendance.checkOutAt, 'check-out set');
  const noCheckIn = await call(env, 'POST', '/api/companies/comp-a/attendance/check-out', { token: tokens.employeeA, body: { date: '2026-11-01' } });
  eq(noCheckIn.status, 400, 'check-out without check-in denied');
});

await test('attendance scope employee manager owner', async () => {
  const { env, tokens } = await makeEnv();
  const emp = await call(env, 'GET', '/api/companies/comp-a/attendance', { token: tokens.employeeA });
  eq(emp.status, 200, 'employee status');
  eq(emp.data.total, 1, 'employee sees own only');
  const mgr = await call(env, 'GET', '/api/companies/comp-a/attendance', { token: tokens.managerA });
  eq(mgr.data.total, 1, 'manager sees own department only');
  eq(mgr.data.attendance[0].userId, 'dash-employee-a', 'manager row user');
  const own = await call(env, 'GET', '/api/companies/comp-a/attendance', { token: tokens.ownerA });
  eq(own.data.total, 2, 'owner sees all');
});

await test('attendance cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-b/attendance', { token: tokens.employeeA });
  eq(res.status, 404, 'status');
});

await test('phase7 CORS dash origin only', async () => {
  const { env, tokens } = await makeEnv();
  const good = await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.ownerA });
  eq(good.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash acao');
  const bad = await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.ownerA, origin: WRONG_ORIGIN });
  eq(bad.headers.get('Access-Control-Allow-Origin'), null, 'wrong origin no acao');
});

await test('phase7 write rate limit blocks after 600', async () => {
  const { env, tokens } = await makeEnv();
  let last = 0;
  for (let i = 0; i < 601; i++) {
    const res = await call(env, 'POST', '/api/companies/comp-rate/announcements', { token: tokens.rate, body: { title: 'Note ' + i, body: 'Body' } });
    last = res.status;
  }
  eq(last, 429, '601st write blocked');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
process.exit(failed === 0 ? 0 : 1);
