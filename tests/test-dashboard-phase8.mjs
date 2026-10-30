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

function dayOffset(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function makeEnv() {
  const db = new ShimDB();
  const env = { DB: db };
  const now = new Date().toISOString();
  const today = dayOffset(0);
  const tomorrow = dayOffset(1);
  const yesterday = dayOffset(-1);
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
    ['task-old', 'comp-a', 'proj-a1', 'dash-employee-a', 'Old Task', 'review', 'low', null, '2020-06-15T09:00:00.000Z'],
    ['task-tomorrow', 'comp-a', 'proj-a1', 'dash-employee-a', 'Due Tomorrow', 'todo', 'urgent', tomorrow + 'T09:00:00', now],
    ['task-overdue', 'comp-a', 'proj-a1', 'dash-employee-a', 'Overdue Task', 'in_progress', 'medium', yesterday + 'T09:00:00', now],
    ['task-done-tomorrow', 'comp-a', 'proj-a1', 'dash-employee-a', 'Done Tomorrow', 'done', 'medium', tomorrow + 'T09:00:00', now],
    ['task-unassigned-tomorrow', 'comp-a', 'proj-a1', null, 'Unassigned Tomorrow', 'todo', 'medium', tomorrow + 'T09:00:00', now],
    ['task-b', 'comp-b', 'proj-b', 'dash-employee-b', 'Task B', 'todo', 'medium', null, now],
    ['task-expired', 'comp-expired', null, 'kluzar-user-expired', 'Expired Due', 'todo', 'medium', tomorrow + 'T09:00:00', now],
  ];
  for (const [id, companyId, projectId, assignee, title, status, priority, dueAt, created] of tasks) {
    db.insert('tasks', { id, company_id: companyId, project_id: projectId, assignee_user_id: assignee, title, description: '', status, priority, category: '', due_at: dueAt, created_by: 'kluzar-user-owner-a', created_at: created, updated_at: created });
  }
  db.insert('documents', { id: 'doc-a1', company_id: 'comp-a', project_id: null, task_id: 'task-a1', r2_key: 'd1:doc-a1', filename: 'report.pdf', mime: 'application/pdf', size: 100, uploaded_by: 'dash-employee-a', created_at: now, content: new TextEncoder().encode('hello'), external_link: '' });
  db.insert('documents', { id: 'doc-a2', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-a2', filename: 'notes.txt', mime: 'text/plain', size: 250, uploaded_by: 'kluzar-user-owner-a', created_at: now, content: new TextEncoder().encode('hello'), external_link: '' });
  db.insert('documents', { id: 'doc-old', company_id: 'comp-a', project_id: null, task_id: null, r2_key: 'd1:doc-old', filename: 'old.txt', mime: 'text/plain', size: 500, uploaded_by: 'kluzar-user-owner-a', created_at: '2020-06-15T09:00:00.000Z', content: new TextEncoder().encode('hello'), external_link: '' });
  db.insert('documents', { id: 'doc-b', company_id: 'comp-b', project_id: null, task_id: null, r2_key: 'd1:doc-b', filename: 'secret.pdf', mime: 'application/pdf', size: 50, uploaded_by: 'kluzar-user-owner-b', created_at: now, content: new TextEncoder().encode('hello'), external_link: '' });
  db.insert('attendance_records', { id: 'att-a1', company_id: 'comp-a', user_id: 'dash-employee-a', date: today, status: 'present', check_in_at: now, check_out_at: null, note: '', created_at: now, updated_at: now });
  db.insert('attendance_records', { id: 'att-a2', company_id: 'comp-a', user_id: 'dash-employee2-a', date: today, status: 'remote', check_in_at: now, check_out_at: now, note: '', created_at: now, updated_at: now });
  db.insert('activity_logs', { id: 'act-1', company_id: 'comp-a', actor_user_id: 'kluzar-user-owner-a', action: 'task_created', target_type: 'task', target_id: 'task-a1', detail: '', created_at: now });
  db.insert('activity_logs', { id: 'act-2', company_id: 'comp-a', actor_user_id: 'dash-manager-a', action: 'task_created', target_type: 'task', target_id: 'task-a2', detail: '', created_at: now });
  db.insert('activity_logs', { id: 'act-b', company_id: 'comp-b', actor_user_id: 'kluzar-user-owner-b', action: 'task_created', target_type: 'task', target_id: 'task-b', detail: '', created_at: now });
  db.insert('notifications', { id: 'notif-unread-1', company_id: 'comp-a', user_id: 'dash-employee-a', kind: 'task_assigned', title: 'New task assigned', body: 'Task A1', target_id: 'task-a1', read_at: null, created_at: now });
  db.insert('notifications', { id: 'notif-read-1', company_id: 'comp-a', user_id: 'dash-employee-a', kind: 'announcement', title: 'Old news', body: 'Hi', target_id: '', read_at: now, created_at: now });
  db.insert('notifications', { id: 'notif-emp2', company_id: 'comp-a', user_id: 'dash-employee2-a', kind: 'announcement', title: 'News', body: 'Hi', target_id: '', read_at: null, created_at: now });
  db.insert('notifications', { id: 'notif-b', company_id: 'comp-b', user_id: 'dash-employee-b', kind: 'task_assigned', title: 'New task assigned', body: 'Task B', target_id: 'task-b', read_at: null, created_at: now });
  db.insert('dashboard_users', { id: 'dash-manager-a', email: 'manager-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee-a', email: 'employee-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: 'Ayesha', last_name: 'Khan', job_title: 'Designer', phone: '100', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee2-a', email: 'employee2-a@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('dashboard_users', { id: 'dash-employee-b', email: 'employee-b@example.test', password_hash: 'x', mfa_secret_enc: '', mfa_enabled: 0, status: 'active', first_name: '', last_name: '', job_title: '', phone: '', created_at: now, updated_at: now });
  db.insert('users', { id: 'kluzar-user-owner-a', email: 'owner-a@example.test', firstName: 'Owner', lastName: 'Alpha', phone: '111', status: 'active' });
  const tokens = {
    ownerA: 'p8-owner-a-token-test',
    adminA: 'p8-admin-a-token-test',
    managerA: 'p8-manager-a-token-test',
    employeeA: 'p8-employee-a-token-test',
    employee2A: 'p8-employee2-a-token-test',
    removedA: 'p8-removed-a-token-test',
    ownerB: 'p8-owner-b-token-test',
    employeeB: 'p8-employee-b-token-test',
    freeOwner: 'p8-free-token-test',
    growthOwner: 'p8-growth-token-test',
    expired: 'p8-expired-token-test',
    rate: 'p8-rate-token-test',
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
  return { env, db, tokens, today };
}

function countFor(rows, key, value) {
  const row = rows.find((r) => r[key] === value);
  return row ? row.count : 0;
}

await test('reports guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports');
  eq(res.status, 401, 'status');
});

await test('reports free growth expired denial', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/companies/comp-free/reports', { token: tokens.freeOwner })).status, 403, 'free');
  eq((await call(env, 'GET', '/api/companies/comp-growth/reports', { token: tokens.growthOwner })).status, 403, 'growth');
  eq((await call(env, 'GET', '/api/companies/comp-expired/reports', { token: tokens.expired })).status, 403, 'expired');
});

await test('reports cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-b/reports', { token: tokens.employeeA });
  eq(res.status, 404, 'status');
});

await test('reports owner aggregates exact', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  const r = res.data.report;
  eq(r.membersTotal, 5, 'members total');
  eq(countFor(r.membersByDepartment, 'departmentId', 'dept-a1'), 2, 'dept-a1 members');
  eq(countFor(r.membersByDepartment, 'departmentId', 'dept-a2'), 1, 'dept-a2 members');
  eq(countFor(r.membersByDepartment, 'departmentId', null), 2, 'no-department members');
  eq(countFor(r.membersByRole, 'role', 'owner'), 1, 'owners');
  eq(countFor(r.membersByRole, 'role', 'employee'), 2, 'employees');
  eq(r.projectsTotal, 2, 'projects total');
  eq(countFor(r.projectsByStatus, 'status', 'active'), 1, 'active projects');
  eq(countFor(r.projectsByStatus, 'status', 'planned'), 1, 'planned projects');
  eq(r.tasksTotal, 7, 'tasks total');
  eq(countFor(r.tasksByStatus, 'status', 'todo'), 3, 'todo tasks');
  eq(countFor(r.tasksByStatus, 'status', 'in_progress'), 2, 'in_progress tasks');
  eq(countFor(r.tasksByStatus, 'status', 'review'), 1, 'review tasks');
  eq(countFor(r.tasksByStatus, 'status', 'done'), 1, 'done tasks');
  eq(countFor(r.tasksByPriority, 'priority', 'medium'), 4, 'medium tasks');
  eq(countFor(r.tasksByPriority, 'priority', 'urgent'), 1, 'urgent tasks');
  eq(countFor(r.tasksByAssignee, 'assigneeUserId', 'dash-employee-a'), 5, 'employee-a tasks');
  eq(countFor(r.tasksByAssignee, 'assigneeUserId', null), 1, 'unassigned tasks');
  eq(r.attendanceTotal, 2, 'attendance total');
  eq(countFor(r.attendanceByStatus, 'status', 'present'), 1, 'present');
  eq(countFor(r.attendanceByStatus, 'status', 'remote'), 1, 'remote');
  eq(r.documentsCount, 3, 'documents count');
  eq(r.documentsTotalBytes, 850, 'documents bytes');
  eq(r.recentActivity.length, 2, 'recent activity');
});

await test('reports date range filters tasks and documents', async () => {
  const { env, tokens, today } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports?start=' + today + '&end=' + today, { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  eq(res.data.report.tasksTotal, 6, 'ranged tasks');
  eq(res.data.report.documentsCount, 2, 'ranged documents');
  eq(res.data.report.documentsTotalBytes, 350, 'ranged bytes');
});

await test('reports invalid date rejected', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports?start=not-a-date', { token: tokens.ownerA });
  eq(res.status, 400, 'status');
});

await test('reports manager scope department only', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.managerA });
  eq(res.status, 200, 'status');
  const r = res.data.report;
  eq(r.membersTotal, 2, 'manager members');
  eq(r.projectsTotal, 1, 'manager projects');
  eq(r.tasksTotal, 6, 'manager tasks');
  eq(r.attendanceTotal, 1, 'manager attendance');
  eq(r.recentActivity.length, 1, 'manager activity');
});

await test('reports employee scope own tasks only', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  const r = res.data.report;
  eq(r.membersTotal, 1, 'employee members');
  eq(r.projectsTotal, 1, 'employee projects');
  eq(r.tasksTotal, 5, 'employee tasks');
  eq(countFor(r.tasksByAssignee, 'assigneeUserId', 'dash-employee2-a'), 0, 'no other assignee');
  eq(r.attendanceTotal, 1, 'employee attendance');
  eq(r.recentActivity.length, 0, 'employee activity');
});

await test('reports wrong origin no ACAO', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/reports', { token: tokens.ownerA, origin: WRONG_ORIGIN });
  eq(res.headers.get('Access-Control-Allow-Origin'), null, 'no ACAO');
});

await test('notifications list unread first and count', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.employeeA });
  eq(res.status, 200, 'status');
  eq(res.data.total, 2, 'total');
  eq(res.data.unreadCount, 1, 'unread count');
  eq(res.data.notifications[0].readAt, null, 'first is unread');
  eq(res.data.notifications[0].id, 'notif-unread-1', 'first id');
});

await test('notifications guest denied and cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  eq((await call(env, 'GET', '/api/notifications?company_id=comp-a')).status, 401, 'guest');
  eq((await call(env, 'GET', '/api/notifications?company_id=comp-b', { token: tokens.employeeA })).status, 404, 'cross-company');
});

await test('notifications unread count endpoint', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/notifications/unread-count?company_id=comp-a', { token: tokens.employee2A });
  eq(res.status, 200, 'status');
  eq(res.data.unreadCount, 1, 'count');
});

await test('notifications task assigned trigger and no self notify', async () => {
  const { env, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Fresh Task', assigneeUserId: 'dash-employee2-a' } });
  eq(created.status, 200, 'create status');
  const list = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.employee2A });
  const found = list.data.notifications.find((n) => n.kind === 'task_assigned' && n.targetId === created.data.task.id);
  ok(found, 'assignee notified');
  const self = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Self Task', assigneeUserId: 'kluzar-user-owner-a' } });
  eq(self.status, 200, 'self create status');
  const selfList = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.ownerA });
  ok(!selfList.data.notifications.some((n) => n.kind === 'task_assigned' && n.targetId === self.data.task.id), 'no self notify');
});

await test('notifications update task assignee trigger', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a2/update', { token: tokens.ownerA, body: { taskId: 'task-a2', assigneeUserId: 'dash-employee-a' } });
  eq(res.status, 200, 'update status');
  const list = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.employeeA });
  ok(list.data.notifications.some((n) => n.kind === 'task_assigned' && n.targetId === 'task-a2'), 'reassigned notified');
});

await test('notifications announcement trigger to all except author', async () => {
  const { env, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/announcements', { token: tokens.managerA, body: { title: 'Team News', body: 'Hello all' } });
  eq(created.status, 200, 'create status');
  const emp = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.employeeA });
  ok(emp.data.notifications.some((n) => n.kind === 'announcement' && n.targetId === created.data.announcement.id), 'employee notified');
  const owner = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.ownerA });
  ok(owner.data.notifications.some((n) => n.kind === 'announcement' && n.targetId === created.data.announcement.id), 'owner notified');
  const author = await call(env, 'GET', '/api/notifications?company_id=comp-a', { token: tokens.managerA });
  ok(!author.data.notifications.some((n) => n.kind === 'announcement' && n.targetId === created.data.announcement.id), 'author not notified');
});

await test('notifications mark read own and other denied', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/notifications/read', { token: tokens.employeeA, body: { companyId: 'comp-a', notificationId: 'notif-unread-1' } });
  eq(res.status, 200, 'own read');
  const after = await call(env, 'GET', '/api/notifications/unread-count?company_id=comp-a', { token: tokens.employeeA });
  eq(after.data.unreadCount, 0, 'unread after read');
  const other = await call(env, 'POST', '/api/notifications/read', { token: tokens.employeeA, body: { companyId: 'comp-a', notificationId: 'notif-emp2' } });
  eq(other.status, 404, 'other denied');
});

await test('notifications mark all read only own', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/notifications/mark-all-read', { token: tokens.employee2A, body: { companyId: 'comp-a' } });
  eq(res.status, 200, 'mark all status');
  eq(res.data.updated, 1, 'updated count');
  const mine = await call(env, 'GET', '/api/notifications/unread-count?company_id=comp-a', { token: tokens.employee2A });
  eq(mine.data.unreadCount, 0, 'mine cleared');
  const other = await call(env, 'GET', '/api/notifications/unread-count?company_id=comp-a', { token: tokens.employeeA });
  eq(other.data.unreadCount, 1, 'other untouched');
});

await test('cron deadline reminders dedupe across two runs', async () => {
  const { env, db } = await makeEnv();
  await handler.scheduled({ cron: '0 9 * * *' }, env);
  const afterFirst = db.table('notifications').filter((n) => n.kind === 'deadline');
  eq(afterFirst.length, 2, 'two deadline notifications');
  ok(afterFirst.some((n) => n.target_id === 'task-tomorrow' && n.user_id === 'dash-employee-a'), 'tomorrow notified');
  ok(afterFirst.some((n) => n.target_id === 'task-overdue' && n.user_id === 'dash-employee-a'), 'overdue notified');
  ok(!afterFirst.some((n) => n.target_id === 'task-done-tomorrow'), 'done excluded');
  ok(!afterFirst.some((n) => n.target_id === 'task-unassigned-tomorrow'), 'unassigned excluded');
  ok(!afterFirst.some((n) => n.target_id === 'task-expired'), 'expired company excluded');
  await handler.scheduled({ cron: '0 9 * * *' }, env);
  const afterSecond = db.table('notifications').filter((n) => n.kind === 'deadline');
  eq(afterSecond.length, 2, 'no duplicates on second run');
});

await test('analytics sanitization strips injected fields', async () => {
  const { env, db, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/analytics/events', { token: tokens.ownerA, body: { companyId: 'comp-a', event: 'page_view', tool: '/reports', outcome: 'ok', userId: 'evil-user', email: 'evil@example.test', ip: '1.2.3.4', userAgent: 'bot', companySecret: 's3cr3t' } });
  eq(res.status, 200, 'status');
  eq(res.data.recorded, true, 'recorded');
  const rows = db.table('dashboard_analytics_events');
  eq(rows.length, 1, 'one row');
  const keys = Object.keys(rows[0]).sort().join(',');
  eq(keys, 'company_id,created_at,event,id,outcome,tool', 'stored keys only');
  eq(rows[0].company_id, 'comp-a', 'company stored');
  eq(rows[0].event, 'page_view', 'event stored');
  ok(!('user_id' in rows[0]), 'no user_id stored');
});

await test('analytics event too long rejected and guest denied and cross-company denied', async () => {
  const { env, tokens } = await makeEnv();
  const long = await call(env, 'POST', '/api/analytics/events', { token: tokens.ownerA, body: { companyId: 'comp-a', event: 'x'.repeat(65) } });
  eq(long.status, 400, 'too long');
  eq((await call(env, 'POST', '/api/analytics/events', { body: { companyId: 'comp-a', event: 'page_view' } })).status, 401, 'guest');
  eq((await call(env, 'POST', '/api/analytics/events', { token: tokens.employeeA, body: { companyId: 'comp-b', event: 'page_view' } })).status, 404, 'cross-company');
});

await test('analytics wrong origin no ACAO', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'POST', '/api/analytics/events', { token: tokens.ownerA, origin: WRONG_ORIGIN, body: { companyId: 'comp-a', event: 'page_view' } });
  eq(res.headers.get('Access-Control-Allow-Origin'), null, 'no ACAO');
});

await test('analytics write rate limit blocks 601st', async () => {
  const { env, tokens } = await makeEnv();
  let last = 0;
  for (let i = 0; i < 601; i++) {
    const res = await call(env, 'POST', '/api/analytics/events', { token: tokens.rate, body: { companyId: 'comp-rate', event: 'page_view' } });
    last = res.status;
  }
  eq(last, 429, '601st blocked');
});

await test('event task link same company accepted cross-company rejected', async () => {
  const { env, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'Linked Event', startAt: '2026-11-01T09:00:00', endAt: '2026-11-01T10:00:00', taskId: 'task-a1' } });
  eq(created.status, 200, 'same company');
  eq(created.data.event.taskId, 'task-a1', 'taskId stored');
  const cross = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'Bad Link', startAt: '2026-11-01T09:00:00', endAt: '2026-11-01T10:00:00', taskId: 'task-b' } });
  eq(cross.status, 400, 'cross-company rejected');
  const updateBad = await call(env, 'POST', '/api/companies/comp-a/events/' + created.data.event.id + '/update', { token: tokens.ownerA, body: { eventId: created.data.event.id, taskId: 'task-b' } });
  eq(updateBad.status, 400, 'update cross-company rejected');
  const cleared = await call(env, 'POST', '/api/companies/comp-a/events/' + created.data.event.id + '/update', { token: tokens.ownerA, body: { eventId: created.data.event.id, taskId: null } });
  eq(cleared.status, 200, 'clear ok');
  eq(cleared.data.event.taskId, null, 'taskId cleared');
  const fetched = await call(env, 'GET', '/api/companies/comp-a/events/' + created.data.event.id, { token: tokens.ownerA });
  eq(fetched.data.event.taskId, null, 'fetched cleared');
});

console.log('Phase 8: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
