import handler from '../worker/src/index.js';
import { ShimDB } from './d1shim.mjs';
import { hashPassword, sha256Hex } from '../worker/src/crypto.js';
import { encryptText } from '../worker/src/crypto.js';

async function encryptTextForTest(text) {
  return encryptText('local-test-encryption-key-only', text);
}

const DASH_ORIGIN = 'https://dash.kluzar.com';
const WRONG_ORIGIN = 'https://evil.example.test';
const FUTURE = new Date(Date.now() + 86400000).toISOString();
const PAST = new Date(Date.now() - 86400000).toISOString();

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
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function callForm(env, path, options) {
  const opts = options || {};
  const headers = {};
  if (opts.origin !== false) headers.Origin = opts.origin || DASH_ORIGIN;
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;
  const req = new Request('https://dashboard-api.kluzar.com' + path, { method: 'POST', headers, body: opts.form });
  const res = await handler.fetch(req, env);
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data, headers: res.headers };
}

function dayStr(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db, DASH_ENCRYPTION_KEY: 'local-test-encryption-key-only' };
  const now = new Date().toISOString();
  const today = dayStr(0);
  const passwordHash = await hashPassword('correct-password');
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
  db.insert('projects', { id: 'proj-a2', company_id: 'comp-a', department_id: 'dept-a2', name: 'Project A2', description: '', status: 'planned', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: now, updated_at: now });
  db.insert('projects', { id: 'proj-b', company_id: 'comp-b', department_id: 'dept-b1', name: 'Project B', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-b', start_date: null, end_date: null, created_at: now, updated_at: now });
  const tasks = [
    ['task-a1', 'comp-a', 'proj-a1', 'dash-employee-a', 'Task A1', 'todo', 'medium', null, now],
    ['task-a2', 'comp-a', 'proj-a2', 'dash-employee2-a', 'Task A2', 'in_progress', 'high', null, now],
    ['task-b', 'comp-b', 'proj-b', 'dash-employee-b', 'Task B', 'todo', 'medium', null, now],
  ];
  for (const [id, companyId, projectId, assignee, title, status, priority, dueAt, created] of tasks) {
    db.insert('tasks', { id, company_id: companyId, project_id: projectId, assignee_user_id: assignee, title, description: '', status, priority, category: '', due_at: dueAt, created_by: 'kluzar-user-owner-a', created_at: created, updated_at: created });
  }
  db.insert('task_comments', { id: 'comment-a1', company_id: 'comp-a', task_id: 'task-a1', author_user_id: 'dash-employee-a', body: 'First comment', created_at: now });
  db.insert('task_comments', { id: 'comment-b', company_id: 'comp-b', task_id: 'task-b', author_user_id: 'dash-employee-b', body: 'Beta comment', created_at: now });
  db.insert('calendar_events', { id: 'event-company', company_id: 'comp-a', title: 'Company Event', description: '', start_at: now, end_at: now, kind: 'event', visibility: 'company', department_id: null, task_id: null, created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('calendar_events', { id: 'event-dept', company_id: 'comp-a', title: 'Dept Event', description: '', start_at: now, end_at: now, kind: 'event', visibility: 'department', department_id: 'dept-a1', task_id: null, created_by: 'dash-manager-a', created_at: now });
  db.insert('calendar_events', { id: 'event-personal', company_id: 'comp-a', title: 'Personal Event', description: '', start_at: now, end_at: now, kind: 'event', visibility: 'personal', department_id: null, task_id: null, created_by: 'dash-employee-a', created_at: now });
  db.insert('calendar_events', { id: 'event-personal2', company_id: 'comp-a', title: 'Other Personal Event', description: '', start_at: now, end_at: now, kind: 'event', visibility: 'personal', department_id: null, task_id: null, created_by: 'dash-employee2-a', created_at: now });
  db.insert('calendar_events', { id: 'event-b', company_id: 'comp-b', title: 'Beta Event', description: '', start_at: now, end_at: now, kind: 'event', visibility: 'company', department_id: null, task_id: null, created_by: 'kluzar-user-owner-b', created_at: now });
  db.insert('documents', { id: 'doc-a1', company_id: 'comp-a', project_id: null, task_id: 'task-a1', r2_key: 'd1:doc-a1', filename: 'report.pdf', mime: 'application/pdf', size: 100, uploaded_by: 'dash-employee-a', created_at: now, content: new TextEncoder().encode('hello'), external_link: '' });
  db.insert('documents', { id: 'doc-a2', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-a2', filename: 'owner.pdf', mime: 'application/pdf', size: 50, uploaded_by: 'kluzar-user-owner-a', created_at: now, content: new TextEncoder().encode('owner-bytes'), external_link: '' });
  db.insert('documents', { id: 'doc-link', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-link', filename: 'big.pdf', mime: '', size: 0, uploaded_by: 'kluzar-user-owner-a', created_at: now, content: null, external_link: 'https://example.test/big.pdf' });
  db.insert('documents', { id: 'doc-b', company_id: 'comp-b', project_id: null, task_id: null, r2_key: 'd1:doc-b', filename: 'secret.pdf', mime: 'application/pdf', size: 50, uploaded_by: 'kluzar-user-owner-b', created_at: now, content: new TextEncoder().encode('secret'), external_link: '' });
  db.insert('announcements', { id: 'ann-a1', company_id: 'comp-a', author_user_id: 'dash-manager-a', title: 'News A', body: 'Hello', created_at: now, updated_at: now });
  db.insert('announcements', { id: 'ann-b', company_id: 'comp-b', author_user_id: 'kluzar-user-owner-b', title: 'News B', body: 'Hello', created_at: now, updated_at: now });
  db.insert('attendance_records', { id: 'att-a1', company_id: 'comp-a', user_id: 'dash-employee-a', date: today, status: 'present', check_in_at: now, check_out_at: null, note: '', created_at: now, updated_at: now });
  db.insert('attendance_records', { id: 'att-a2', company_id: 'comp-a', user_id: 'dash-employee2-a', date: today, status: 'remote', check_in_at: now, check_out_at: now, note: '', created_at: now, updated_at: now });
  db.insert('notifications', { id: 'notif-a', company_id: 'comp-a', user_id: 'dash-employee-a', kind: 'task_assigned', title: 'New task', body: 'Task A1', target_id: 'task-a1', read_at: null, created_at: now });
  db.insert('notifications', { id: 'notif-a2', company_id: 'comp-a', user_id: 'dash-employee2-a', kind: 'announcement', title: 'News', body: 'Hi', target_id: '', read_at: null, created_at: now });
  db.insert('notifications', { id: 'notif-b', company_id: 'comp-b', user_id: 'dash-employee-b', kind: 'task_assigned', title: 'New task', body: 'Task B', target_id: 'task-b', read_at: null, created_at: now });
  db.insert('activity_logs', { id: 'act-a1', company_id: 'comp-a', actor_user_id: 'kluzar-user-owner-a', action: 'task_created', target_type: 'task', target_id: 'task-a1', detail: '', created_at: now });
  db.insert('activity_logs', { id: 'act-b', company_id: 'comp-b', actor_user_id: 'kluzar-user-owner-b', action: 'task_created', target_type: 'task', target_id: 'task-b', detail: '', created_at: now });
  db.insert('invitations', { id: 'inv-a', company_id: 'comp-a', email: 'invited-a@example.test', role: 'employee', department_id: null, token_hash: await sha256Hex('invite-token-1'), password_enc: await encryptTextForTest('invited-password'), expires_at: FUTURE, used_at: null, revoked_at: null, created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('invitations', { id: 'inv-b', company_id: 'comp-b', email: 'invited-b@example.test', role: 'employee', department_id: null, token_hash: 'hash-inv-b', password_enc: '', expires_at: FUTURE, used_at: null, revoked_at: null, created_by: 'kluzar-user-owner-b', created_at: now });
  const dashUsers = [
    ['dash-manager-a', 'manager-a@example.test', 'Manager', 'One', 'Manager', ''],
    ['dash-employee-a', 'employee-a@example.test', 'Ayesha', 'Khan', 'Designer', '100'],
    ['dash-employee2-a', 'employee2-a@example.test', 'Bilal', 'Ahmed', 'Dev', '200'],
    ['dash-employee-b', 'employee-b@example.test', 'Sara', 'Ali', 'Dev', '300'],
  ];
  for (const [id, email, first, last, job, phone] of dashUsers) {
    db.insert('dashboard_users', { id, email, password_hash: passwordHash, mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: first, last_name: last, job_title: job, phone, created_at: now, updated_at: now });
  }
  db.insert('dashboard_users', { id: 'dash-invited-a', email: 'invited-a@example.test', password_hash: passwordHash, mfa_secret_enc: '', mfa_enabled: 0, status: 'pending', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('users', { id: 'kluzar-user-owner-a', email: 'owner-a@example.test', firstName: 'Owner', lastName: 'Alpha', phone: '111', status: 'active' });
  db.insert('users', { id: 'kluzar-user-owner-b', email: 'owner-b@example.test', firstName: 'Owner', lastName: 'Beta', phone: '222', status: 'active' });
  const tokens = {
    ownerA: 'p9-owner-a-token-test',
    adminA: 'p9-admin-a-token-test',
    managerA: 'p9-manager-a-token-test',
    employeeA: 'p9-employee-a-token-test',
    employee2A: 'p9-employee2-a-token-test',
    removedA: 'p9-removed-a-token-test',
    ownerB: 'p9-owner-b-token-test',
    employeeB: 'p9-employee-b-token-test',
    freeOwner: 'p9-free-token-test',
    growthOwner: 'p9-growth-token-test',
    expired: 'p9-expired-token-test',
    rate: 'p9-rate-token-test',
    expiredSession: 'p9-expired-session-token-test',
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
    expiredSession: 'dash-employee-a',
  };
  for (const [key, token] of Object.entries(tokens)) {
    const hash = await sha256Hex(token);
    const expires = key === 'expiredSession' ? PAST : FUTURE;
    db.insert('dashboard_sessions', { id: 'sess-' + key, user_id: tokenUsers[key], user_type: 'member', token_hash: hash, purpose: 'session', company_id: null, expires_at: expires, created_at: now });
  }
  return { env, db, tokens };
}

await test('guest denied on protected routes', async () => {
  const { env } = await makeEnv();
  eq((await call(env, 'GET', '/api/companies')).status, 401, 'companies');
  eq((await call(env, 'GET', '/api/companies/comp-a/reports')).status, 401, 'reports');
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks')).status, 401, 'tasks');
  eq((await call(env, 'GET', '/api/notifications?company_id=comp-a')).status, 401, 'notifications');
  eq((await call(env, 'GET', '/api/layouts?company_id=comp-a')).status, 401, 'layouts');
  eq((await call(env, 'GET', '/api/companies/comp-a/documents')).status, 401, 'documents');
  eq((await call(env, 'GET', '/api/auth/me')).status, 401, 'me');
});

await test('starter growth expired denial', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/companies/comp-free/reports', { token: tokens.freeOwner })).status, 403, 'free reports');
  eq((await call(env, 'GET', '/api/companies/comp-free/tasks', { token: tokens.freeOwner })).status, 403, 'free tasks');
  eq((await call(env, 'GET', '/api/companies/comp-growth/reports', { token: tokens.growthOwner })).status, 403, 'growth reports');
  eq((await call(env, 'GET', '/api/companies/comp-expired/reports', { token: tokens.expired })).status, 403, 'expired reports');
  eq((await call(env, 'GET', '/api/companies/comp-expired/tasks', { token: tokens.expired })).status, 403, 'expired tasks');
});

await test('active max access allowed', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  ok(res.data.companies.some((c) => c.id === 'comp-a'), 'comp-a listed');
  eq((await call(env, 'GET', '/api/companies/comp-a', { token: tokens.ownerA })).status, 200, 'detail');
});

await test('cross-company read denied for every resource type', async () => {
  const { env, tokens } = await makeEnv();
  const t = tokens.employeeA;
  eq((await call(env, 'GET', '/api/companies/comp-b', { token: t })).status, 404, 'company');
  eq((await call(env, 'GET', '/api/companies/comp-b/members', { token: t })).status, 404, 'members');
  eq((await call(env, 'GET', '/api/companies/comp-b/departments', { token: t })).status, 404, 'departments');
  eq((await call(env, 'GET', '/api/companies/comp-b/projects/proj-b', { token: t })).status, 404, 'project');
  eq((await call(env, 'GET', '/api/companies/comp-b/tasks/task-b', { token: t })).status, 404, 'task');
  eq((await call(env, 'GET', '/api/companies/comp-b/tasks/task-b/comments', { token: t })).status, 404, 'comments');
  eq((await call(env, 'GET', '/api/companies/comp-b/events/event-b', { token: t })).status, 404, 'event');
  eq((await call(env, 'GET', '/api/companies/comp-b/documents', { token: t })).status, 404, 'documents');
  eq((await callRaw(env, 'GET', '/api/companies/comp-b/documents/doc-b/download', { token: t })).status, 404, 'download');
  eq((await call(env, 'GET', '/api/companies/comp-b/announcements', { token: t })).status, 404, 'announcements');
  eq((await call(env, 'GET', '/api/companies/comp-b/attendance', { token: t })).status, 404, 'attendance');
  eq((await call(env, 'GET', '/api/companies/comp-b/reports', { token: t })).status, 404, 'reports');
  eq((await call(env, 'GET', '/api/notifications?company_id=comp-b', { token: t })).status, 404, 'notifications');
  eq((await call(env, 'GET', '/api/layouts?company_id=comp-b', { token: t })).status, 404, 'layouts');
  eq((await call(env, 'GET', '/api/companies/comp-b/activity', { token: t })).status, 404, 'activity');
  eq((await call(env, 'GET', '/api/companies/comp-b/invitations', { token: t })).status, 404, 'invitations');
});

await test('cross-company write denied for every resource type', async () => {
  const { env, tokens } = await makeEnv();
  const t = tokens.employeeA;
  eq((await call(env, 'POST', '/api/companies/comp-b/departments', { token: t, body: { name: 'X' } })).status, 404, 'department create');
  eq((await call(env, 'POST', '/api/companies/comp-b/departments/update', { token: t, body: { deptId: 'dept-b1', name: 'X' } })).status, 404, 'department update');
  eq((await call(env, 'POST', '/api/companies/comp-b/departments/delete', { token: t, body: { deptId: 'dept-b1' } })).status, 404, 'department delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/projects', { token: t, body: { name: 'X' } })).status, 404, 'project create');
  eq((await call(env, 'POST', '/api/companies/comp-b/projects/proj-b/update', { token: t, body: { projectId: 'proj-b', name: 'X' } })).status, 404, 'project update');
  eq((await call(env, 'POST', '/api/companies/comp-b/projects/proj-b/delete', { token: t, body: { projectId: 'proj-b' } })).status, 404, 'project delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks', { token: t, body: { title: 'X' } })).status, 404, 'task create');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks/task-b/update', { token: t, body: { taskId: 'task-b', title: 'X' } })).status, 404, 'task update');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks/task-b/delete', { token: t, body: { taskId: 'task-b' } })).status, 404, 'task delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks/task-b/comments', { token: t, body: { body: 'X' } })).status, 404, 'comment create');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks/task-b/comments/comment-b/update', { token: t, body: { commentId: 'comment-b', body: 'X' } })).status, 404, 'comment update');
  eq((await call(env, 'POST', '/api/companies/comp-b/tasks/task-b/comments/comment-b/delete', { token: t, body: { commentId: 'comment-b' } })).status, 404, 'comment delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/events', { token: t, body: { title: 'X', startAt: '2026-01-01T09:00:00', endAt: '2026-01-01T10:00:00' } })).status, 404, 'event create');
  eq((await call(env, 'POST', '/api/companies/comp-b/events/event-b/update', { token: t, body: { eventId: 'event-b', title: 'X' } })).status, 404, 'event update');
  eq((await call(env, 'POST', '/api/companies/comp-b/events/event-b/delete', { token: t, body: { eventId: 'event-b' } })).status, 404, 'event delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/documents/doc-b/delete', { token: t, body: { documentId: 'doc-b' } })).status, 404, 'document delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/announcements', { token: t, body: { title: 'X', body: 'X' } })).status, 404, 'announcement create');
  eq((await call(env, 'POST', '/api/companies/comp-b/announcements/ann-b/update', { token: t, body: { announcementId: 'ann-b', title: 'X' } })).status, 404, 'announcement update');
  eq((await call(env, 'POST', '/api/companies/comp-b/announcements/ann-b/delete', { token: t, body: { announcementId: 'ann-b' } })).status, 404, 'announcement delete');
  eq((await call(env, 'POST', '/api/companies/comp-b/attendance/check-in', { token: t, body: {} })).status, 404, 'attendance check-in');
  eq((await call(env, 'POST', '/api/layouts', { token: t, body: { companyId: 'comp-b', widgets: [] } })).status, 404, 'layout save');
  eq((await call(env, 'POST', '/api/layouts/company-default', { token: t, body: { companyId: 'comp-b', widgets: [] } })).status, 404, 'layout default');
  eq((await call(env, 'POST', '/api/companies/comp-b/members/update', { token: t, body: { userId: 'dash-employee-b', role: 'admin' } })).status, 404, 'member update');
  eq((await call(env, 'POST', '/api/companies/comp-b/members/remove', { token: t, body: { userId: 'dash-employee-b' } })).status, 404, 'member remove');
  eq((await call(env, 'POST', '/api/companies/comp-b/invitations/revoke', { token: t, body: { invitationId: 'inv-b' } })).status, 404, 'invite revoke');
  eq((await call(env, 'POST', '/api/notifications/read', { token: t, body: { companyId: 'comp-b', notificationId: 'notif-b' } })).status, 404, 'notification read');
});

await test('guessed ids return 404 without leaking', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks/does-not-exist', { token: tokens.ownerA })).status, 404, 'task');
  eq((await call(env, 'GET', '/api/companies/comp-a/projects/does-not-exist', { token: tokens.ownerA })).status, 404, 'project');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/does-not-exist', { token: tokens.ownerA })).status, 404, 'event');
  eq((await callRaw(env, 'GET', '/api/companies/comp-a/documents/does-not-exist/download', { token: tokens.ownerA })).status, 404, 'document');
  eq((await call(env, 'GET', '/api/companies/comp-a', { token: tokens.employeeB })).status, 404, 'company by non-member');
  eq((await call(env, 'GET', '/api/companies/does-not-exist', { token: tokens.ownerA })).status, 404, 'company missing');
});

await test('employee restricted to own tasks and projects', async () => {
  const { env, tokens } = await makeEnv();
  const t = tokens.employeeA;
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks/task-a2', { token: t })).status, 403, 'other task read');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks/task-a2/update', { token: t, body: { taskId: 'task-a2', status: 'done' } })).status, 403, 'other task update');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks/task-a2/comments', { token: t, body: { body: 'hi' } })).status, 403, 'other task comment');
  eq((await call(env, 'GET', '/api/companies/comp-a/projects/proj-a2', { token: t })).status, 403, 'unassigned project read');
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks/task-a1', { token: t })).status, 200, 'own task read');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: t, body: { taskId: 'task-a1', status: 'in_progress' } })).status, 200, 'own task status update');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: t, body: { taskId: 'task-a1', title: 'Hijack' } })).status, 403, 'own task title edit denied');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks', { token: t, body: { title: 'New' } })).status, 403, 'employee task create denied');
  eq((await call(env, 'POST', '/api/companies/comp-a/projects', { token: t, body: { name: 'New' } })).status, 403, 'employee project create denied');
});

await test('manager restricted to own department', async () => {
  const { env, tokens } = await makeEnv();
  const t = tokens.managerA;
  eq((await call(env, 'GET', '/api/companies/comp-a/projects/proj-a2', { token: t })).status, 403, 'other department project');
  eq((await call(env, 'GET', '/api/companies/comp-a/projects/proj-a1', { token: t })).status, 200, 'own department project');
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks/task-a2', { token: t })).status, 403, 'other department task');
  eq((await call(env, 'POST', '/api/companies/comp-a/projects', { token: t, body: { name: 'Out', departmentId: 'dept-a2' } })).status, 403, 'other department project create');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks', { token: t, body: { title: 'Out', projectId: 'proj-a2', assigneeUserId: 'dash-employee2-a' } })).status, 403, 'other department task create');
});

await test('event visibility rules enforced', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-dept', { token: tokens.employeeA })).status, 200, 'same department event');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-dept', { token: tokens.employee2A })).status, 403, 'other department event');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-personal', { token: tokens.employee2A })).status, 403, 'other personal event');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-personal', { token: tokens.employeeA })).status, 200, 'own personal event');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-personal', { token: tokens.ownerA })).status, 403, 'owner cannot read personal event');
  eq((await call(env, 'GET', '/api/companies/comp-a/events/event-company', { token: tokens.employee2A })).status, 200, 'company event');
  eq((await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.employeeA, body: { title: 'X', startAt: '2026-01-01T09:00:00', endAt: '2026-01-01T10:00:00', visibility: 'company' } })).status, 403, 'employee company event denied');
});

await test('unauthorized role changes denied', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.employeeA, body: { userId: 'dash-employee-a', role: 'admin' } })).status, 403, 'self promotion');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.managerA, body: { userId: 'dash-employee-a', role: 'admin' } })).status, 403, 'manager role change');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.adminA, body: { userId: 'dash-manager-a', role: 'admin' } })).status, 403, 'admin grants admin');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.adminA, body: { userId: 'kluzar-user-owner-a', role: 'admin' } })).status, 403, 'admin demotes owner');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.ownerA, body: { userId: 'kluzar-user-owner-a', role: 'admin' } })).status, 403, 'sole owner self demotion');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.adminA, body: { userId: 'dash-employee-a', role: 'manager' } })).status, 200, 'admin grants manager allowed');
  eq((await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: tokens.ownerA, body: { userId: 'kluzar-user-owner-a' } })).status, 403, 'sole owner self removal');
  eq((await call(env, 'POST', '/api/companies/comp-a/transfer', { token: tokens.ownerA, body: { newOwnerUserId: 'dash-employee-a' } })).status, 400, 'transfer to non-admin');
  eq((await call(env, 'POST', '/api/companies/comp-a/transfer', { token: tokens.adminA, body: { newOwnerUserId: 'kluzar-user-admin-a' } })).status, 403, 'transfer by non-owner');
});

await test('revoked membership loses access and sessions are deleted', async () => {
  const { env, tokens, db } = await makeEnv();
  eq((await call(env, 'POST', '/api/companies/comp-a/members/remove', { token: tokens.ownerA, body: { userId: 'dash-employee2-a' } })).status, 200, 'remove');
  eq(db.table('dashboard_sessions').filter((s) => s.user_id === 'dash-employee2-a').length, 0, 'sessions deleted');
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.employee2A })).status, 401, 'old token rejected');
  const fresh = await sha256Hex('p9-removed-fresh-token-test');
  db.insert('dashboard_sessions', { id: 'sess-fresh', user_id: 'dash-removed-a', user_type: 'member', token_hash: fresh, purpose: 'session', company_id: null, expires_at: FUTURE, created_at: new Date().toISOString() });
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks', { token: 'p9-removed-fresh-token-test' })).status, 404, 'removed member fresh session denied');
  eq((await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.removedA })).status, 404, 'removed member session denied');
});

await test('file downloads scoped correctly', async () => {
  const { env, tokens } = await makeEnv();
  const own = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-a1/download', { token: tokens.employeeA });
  eq(own.status, 200, 'own task attachment download');
  eq(own.text, 'hello', 'download bytes match');
  const ownerDoc = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-a2/download', { token: tokens.employeeA });
  eq(ownerDoc.status, 200, 'same company document download allowed by matrix');
  const linkDoc = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-link/download', { token: tokens.ownerA });
  eq(linkDoc.status, 400, 'link-only document has no stored bytes');
  const cross = await callRaw(env, 'GET', '/api/companies/comp-a/documents/doc-b/download', { token: tokens.ownerA });
  eq(cross.status, 404, 'other company document id in own company path');
  eq((await call(env, 'GET', '/api/companies/comp-a/documents', { token: tokens.employeeB })).status, 404, 'non-member document list');
});

await test('document upload rules enforced', async () => {
  const { env, tokens } = await makeEnv();
  const small = new FormData();
  small.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
  small.append('taskId', 'task-a1');
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, form: small })).status, 200, 'employee own task upload');
  const noTask = new FormData();
  noTask.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, form: noTask })).status, 403, 'employee upload without task');
  const otherTask = new FormData();
  otherTask.append('file', new File(['hello'], 'note.txt', { type: 'text/plain' }));
  otherTask.append('taskId', 'task-a2');
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.employeeA, form: otherTask })).status, 403, 'employee upload to other task');
  const big = new FormData();
  big.append('file', new File([new Uint8Array(1048577)], 'big.txt', { type: 'text/plain' }));
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, form: big })).status, 400, 'over 1 MB rejected');
  const badType = new FormData();
  badType.append('file', new File(['x'], 'evil.exe', { type: 'application/x-msdownload' }));
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, form: badType })).status, 400, 'disallowed type rejected');
  const traversal = new FormData();
  traversal.append('file', new File(['x'], '../../etc/passwd', { type: 'text/plain' }));
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, form: traversal })).status, 400, 'traversal filename rejected');
  const linkOnly = new FormData();
  linkOnly.append('filename', 'big.pdf');
  linkOnly.append('externalLink', 'https://example.test/big.pdf');
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, form: linkOnly })).status, 200, 'link-only document allowed');
  const badLink = new FormData();
  badLink.append('filename', 'big.pdf');
  badLink.append('externalLink', 'javascript:alert(1)');
  eq((await callForm(env, '/api/companies/comp-a/documents', { token: tokens.ownerA, form: badLink })).status, 400, 'non-https link rejected');
});

await test('document delete role rules', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'POST', '/api/companies/comp-a/documents/doc-a2/delete', { token: tokens.employeeA, body: { documentId: 'doc-a2' } })).status, 403, 'employee deletes owner document');
  eq((await call(env, 'POST', '/api/companies/comp-a/documents/doc-a1/delete', { token: tokens.employeeA, body: { documentId: 'doc-a1' } })).status, 200, 'uploader deletes own document');
  eq((await call(env, 'POST', '/api/companies/comp-a/documents/doc-a2/delete', { token: tokens.managerA, body: { documentId: 'doc-a2' } })).status, 200, 'manager deletes document');
});

await test('notifications are own-only', async () => {
  const { env, tokens } = await makeEnv();
  const list = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.employeeA });
  eq(list.status, 200, 'list');
  ok(list.data.notifications.every((n) => n.id === 'notif-a'), 'only own notifications');
  eq((await call(env, 'POST', '/api/notifications/read', { token: tokens.employeeA, body: { companyId: 'comp-a', notificationId: 'notif-a2' } })).status, 404, 'mark other member notification');
  eq((await call(env, 'POST', '/api/notifications/read', { token: tokens.employeeA, body: { companyId: 'comp-a', notificationId: 'notif-a' } })).status, 200, 'mark own notification');
  eq((await call(env, 'GET', '/api/notifications/unread-count?company_id=comp-a', { token: tokens.employeeA })).data.unreadCount, 0, 'unread count after read');
});

await test('announcements and attendance scoping', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'POST', '/api/companies/comp-a/announcements', { token: tokens.employeeA, body: { title: 'X', body: 'X' } })).status, 403, 'employee announcement create');
  eq((await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/update', { token: tokens.employee2A, body: { announcementId: 'ann-a1', title: 'X' } })).status, 403, 'employee announcement update');
  eq((await call(env, 'POST', '/api/companies/comp-a/announcements/ann-a1/delete', { token: tokens.managerA, body: { announcementId: 'ann-a1' } })).status, 200, 'author manager deletes own announcement');
  const att = await call(env, 'GET', '/api/companies/comp-a/attendance?user_id=dash-employee2-a', { token: tokens.employeeA });
  eq(att.status, 200, 'attendance list');
  eq(att.data.total, 0, 'employee sees no other member attendance even with filter');
  const attMgr = await call(env, 'GET', '/api/companies/comp-a/attendance', { token: tokens.managerA });
  ok(attMgr.data.attendance.every((r) => r.userId === 'dash-employee-a'), 'manager sees own department only');
  eq((await call(env, 'POST', '/api/companies/comp-a/attendance/check-in', { token: tokens.employeeA, body: { date: '2030-01-01' } })).status, 200, 'own check-in');
  eq((await call(env, 'POST', '/api/companies/comp-a/attendance/check-in', { token: tokens.employeeA, body: { date: '2030-01-01' } })).status, 400, 'duplicate check-in rejected');
});

await test('layouts scoped and default restricted', async () => {
  const { env, tokens } = await makeEnv();
  const save = await call(env, 'POST', '/api/layouts', { token: tokens.employeeA, body: { companyId: 'comp-a', widgets: [{ id: 'overview' }], isCompanyDefault: true } });
  eq(save.status, 200, 'personal save');
  const mine = await call(env, 'GET', '/api/layouts?company_id=comp-a', { token: tokens.employeeA });
  eq(mine.data.layout.source, 'personal', 'injected default flag did not promote layout');
  const def = await call(env, 'GET', '/api/layouts/company-default?company_id=comp-a', { token: tokens.employeeA });
  eq(def.data.layout.source, 'built-in', 'no company default set by injection');
  eq((await call(env, 'POST', '/api/layouts/company-default', { token: tokens.managerA, body: { companyId: 'comp-a', widgets: [] } })).status, 403, 'manager cannot set default');
  eq((await call(env, 'POST', '/api/layouts/company-default', { token: tokens.adminA, body: { companyId: 'comp-a', widgets: [{ id: 'team' }] } })).status, 200, 'admin sets default');
  eq((await call(env, 'POST', '/api/layouts', { token: tokens.employeeA, body: { companyId: 'comp-a', widgets: [{ id: 'nope' }] } })).status, 400, 'invalid widget rejected');
});

await test('employee report is own-scope only, no bulk export surface', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  eq(res.data.report.membersTotal, 1, 'members scoped to self');
  eq(res.data.report.tasksTotal, 1, 'tasks scoped to self');
  ok(res.data.report.tasksByAssignee.every((r) => r.assigneeUserId === 'dash-employee-a'), 'no other assignee rows');
  eq(res.data.report.attendanceTotal, 1, 'attendance scoped to self');
  const mgr = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.managerA });
  eq(mgr.data.report.tasksTotal, 1, 'manager tasks scoped to department plus self');
});

await test('manipulated bodies stripped or rejected', async () => {
  const { env, tokens, db } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Injected', companyId: 'comp-b', ownerUserId: 'attacker', company_id: 'comp-b' } });
  eq(created.status, 200, 'create succeeds with stripped fields');
  const row = db.table('tasks').find((t) => t.id === created.data.task.id);
  eq(row.company_id, 'comp-a', 'path company wins over injected company');
  eq(row.created_by, 'kluzar-user-owner-a', 'creator is server session user');
  const proj = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'P', owner_user_id: 'attacker', ownerUserId: 'attacker' } });
  eq(proj.status, 200, 'project create');
  const prow = db.table('projects').find((p) => p.id === proj.data.project.id);
  eq(prow.owner_user_id, 'kluzar-user-owner-a', 'project owner is server session user');
  const upd = await call(env, 'POST', '/api/companies/comp-a/members/update', { token: tokens.ownerA, body: { userId: 'dash-employee-a', role: 'manager', companyId: 'comp-b' } });
  eq(upd.status, 200, 'member update');
  const mrow = db.table('company_members').find((m) => m.company_id === 'comp-a' && m.user_id === 'dash-employee-a');
  eq(mrow.role, 'manager', 'role applied in path company');
  eq(db.table('company_members').find((m) => m.company_id === 'comp-b' && m.user_id === 'dash-employee-a'), undefined, 'no cross-company membership created');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: '' } })).status, 400, 'empty title rejected');
  eq((await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'X', status: 'bogus' } })).status, 400, 'invalid enum rejected');
  eq((await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'x'.repeat(201) } })).status, 400, 'overlong name rejected');
  eq((await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'X', startAt: '2026-01-02T10:00:00', endAt: '2026-01-02T09:00:00' } })).status, 400, 'end before start rejected');
  const xss = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: '<script>alert(1)</script>' } });
  eq(xss.status, 200, 'script payload stored as data');
  const back = await call(env, 'GET', '/api/companies/comp-a/projects/' + xss.data.project.id, { token: tokens.ownerA });
  eq(back.data.project.name, '<script>alert(1)</script>', 'payload returned verbatim as data, never executed server-side');
});

await test('origin failures and missing auth', async () => {
  const { env, tokens } = await makeEnv();
  const opt = await handler.fetch(new Request('https://dashboard-api.kluzar.com/api/companies/comp-a/reports', { method: 'OPTIONS', headers: { Origin: WRONG_ORIGIN } }), env);
  eq(opt.headers.get('Access-Control-Allow-Origin'), null, 'wrong origin options no ACAO');
  eq((await call(env, 'POST', '/api/auth/session', { token: 'garbage-token', origin: WRONG_ORIGIN })).status, 403, 'assertion endpoint wrong origin');
  eq((await call(env, 'POST', '/api/auth/session', { token: 'garbage-token' })).status, 401, 'assertion endpoint bad token');
  const wrong = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.ownerA, origin: WRONG_ORIGIN });
  eq(wrong.status, 200, 'handler still answers');
  eq(wrong.headers.get('Access-Control-Allow-Origin'), null, 'wrong origin response has no ACAO so browser blocks it');
  const good = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.ownerA });
  eq(good.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash origin ACAO present');
});

await test('rate limiting on sensitive endpoints', async () => {
  const { env, tokens, db } = await makeEnv();
  const windowStart = Math.floor(Date.now() / 1000 / 3600);
  db.insert('dash_rate_limits', { user_id: 'kluzar-user-rate', endpoint: 'write', window_start: windowStart, count: 600 });
  eq((await call(env, 'POST', '/api/companies/comp-rate/tasks', { token: tokens.rate, body: { title: 'X' } })).status, 429, 'write bucket exhausted');
  db.insert('dash_rate_limits', { user_id: 'login-step:employee-a@example.test', endpoint: 'member-login-step1', window_start: windowStart, count: 20 });
  eq((await call(env, 'POST', '/api/auth/member-login/step1', { body: { email: 'employee-a@example.test', password: 'correct-password' } })).status, 429, 'login step1 bucket exhausted');
  const fresh = await makeEnv();
  eq((await call(fresh.env, 'POST', '/api/auth/member-login/step1', { body: { email: 'employee-a@example.test', password: 'wrong-password' } })).status, 401, 'wrong password generic 401');
  const unknown = await call(fresh.env, 'POST', '/api/auth/member-login/step1', { body: { email: 'nobody@example.test', password: 'wrong-password' } });
  eq(unknown.status, 401, 'unknown email generic 401');
  const wrong = await call(fresh.env, 'POST', '/api/auth/member-login/step1', { body: { email: 'employee-a@example.test', password: 'wrong-password' } });
  eq(wrong.data.error, unknown.data.error, 'no enumeration between unknown email and wrong password');
});

await test('session expiry logout and revoked invitation claim', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/auth/me', { token: tokens.expiredSession })).status, 401, 'expired session rejected');
  eq((await call(env, 'POST', '/api/auth/logout', { token: tokens.employeeA })).status, 200, 'logout');
  eq((await call(env, 'GET', '/api/auth/me', { token: tokens.employeeA })).status, 401, 'logged out token rejected');
  const claimBefore = await call(env, 'POST', '/api/auth/invite/claim', { body: { token: 'invite-token-1' } });
  eq(claimBefore.status, 200, 'claim works before revoke');
  eq(claimBefore.data.password, 'invited-password', 'claim returns invitee password');
  eq((await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: tokens.ownerA, body: { invitationId: 'inv-a' } })).status, 200, 'revoke');
  eq((await call(env, 'POST', '/api/auth/invite/claim', { body: { token: 'invite-token-1' } })).status, 404, 'revoked invitation cannot be claimed');
  eq((await call(env, 'POST', '/api/companies/comp-a/invitations/revoke', { token: tokens.managerA, body: { invitationId: 'inv-a' } })).status, 403, 'manager cannot revoke');
});

await test('filter injection returns no cross-tenant rows', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/tasks?category=%27%20OR%20%271%27%3D%271', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  ok(res.data.tasks.every((t) => t.projectId !== 'proj-b'), 'no beta tasks via injection');
  eq(res.data.tasks.length, 0, 'injection string matches nothing exactly');
  const list = await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.ownerA });
  eq(list.data.tasks.length, 2, 'company a task count unchanged');
});

await test('analytics injection stripped and never stored', async () => {
  const { env, tokens, db } = await makeEnv();
  const res = await call(env, 'POST', '/api/analytics/events', { token: tokens.employeeA, body: { companyId: 'comp-a', event: 'page_view', tool: 'tasks', outcome: 'ok', userId: 'victim', email: 'victim@example.test', ip: '1.2.3.4' } });
  eq(res.status, 200, 'status');
  const row = db.table('dashboard_analytics_events')[0];
  ok(row, 'row stored');
  eq(row.userId, undefined, 'no user id stored');
  eq(row.email, undefined, 'no email stored');
  eq(row.ip, undefined, 'no ip stored');
  eq(row.event, 'page_view', 'event stored');
  eq(row.company_id, 'comp-a', 'company from path context');
});

await test('activity and invitations scoped', async () => {
  const { env, tokens } = await makeEnv();
  const act = await call(env, 'GET', '/api/companies/comp-a/activity', { token: tokens.employeeA });
  eq(act.status, 200, 'activity');
  ok(act.data.activity.every((a) => a.targetId !== 'task-b'), 'no beta activity rows');
  eq((await call(env, 'GET', '/api/companies/comp-a/invitations', { token: tokens.employeeA })).status, 403, 'employee cannot list invitations');
  eq((await call(env, 'GET', '/api/companies/comp-a/invitations', { token: tokens.adminA })).status, 200, 'admin lists invitations');
  eq((await call(env, 'GET', '/api/companies/comp-a/members', { token: tokens.employeeA })).data.members.length, 1, 'employee sees self only in members');
});

console.log('RESULT passed=' + passed + ' failed=' + failed);
if (failed > 0) process.exitCode = 1;
