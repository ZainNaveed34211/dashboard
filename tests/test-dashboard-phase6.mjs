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
  db.insert('projects', { id: 'proj-a1', company_id: 'comp-a', department_id: 'dept-a1', name: 'Project A1', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: now });
  db.insert('projects', { id: 'proj-a2', company_id: 'comp-a', department_id: 'dept-a2', name: 'Project A2', description: '', status: 'planned', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: '2026-01-02T00:00:00.000Z', updated_at: now });
  db.insert('projects', { id: 'proj-empty', company_id: 'comp-a', department_id: 'dept-a1', name: 'Empty Project', description: '', status: 'planned', owner_user_id: 'kluzar-user-owner-a', start_date: null, end_date: null, created_at: '2026-01-03T00:00:00.000Z', updated_at: now });
  db.insert('projects', { id: 'proj-b', company_id: 'comp-b', department_id: 'dept-b1', name: 'Project B', description: '', status: 'active', owner_user_id: 'kluzar-user-owner-b', start_date: null, end_date: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: now });
  const tasks = [
    ['task-a1', 'comp-a', 'proj-a1', 'dash-employee-a', 'Task A1', 'todo', 'medium', '', null, 'kluzar-user-owner-a'],
    ['task-a2', 'comp-a', 'proj-a2', 'dash-employee2-a', 'Task A2', 'in_progress', 'high', '', null, 'kluzar-user-owner-a'],
    ['task-a3', 'comp-a', 'proj-a1', 'dash-manager-a', 'Task A3', 'done', 'low', '', null, 'kluzar-user-owner-a'],
    ['task-a4', 'comp-a', null, 'dash-employee-a', 'Task A4', 'todo', 'medium', '', null, 'kluzar-user-owner-a'],
    ['task-b', 'comp-b', 'proj-b', 'dash-employee-b', 'Task B', 'todo', 'medium', '', null, 'kluzar-user-owner-b'],
  ];
  for (const [id, companyId, projectId, assignee, title, status, priority, category, dueAt, createdBy] of tasks) {
    db.insert('tasks', { id, company_id: companyId, project_id: projectId, assignee_user_id: assignee, title, description: '', status, priority, category, due_at: dueAt, created_by: createdBy, created_at: now, updated_at: now });
  }
  db.insert('task_comments', { id: 'comment-a1', company_id: 'comp-a', task_id: 'task-a1', author_user_id: 'dash-employee-a', body: 'First comment', created_at: now });
  db.insert('calendar_events', { id: 'event-company', company_id: 'comp-a', title: 'Company Event', description: '', start_at: '2026-11-02T09:00:00.000Z', end_at: '2026-11-02T10:00:00.000Z', kind: 'event', visibility: 'company', department_id: null, created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('calendar_events', { id: 'event-dept-a1', company_id: 'comp-a', title: 'Dept A1 Event', description: '', start_at: '2026-11-03T09:00:00.000Z', end_at: '2026-11-03T10:00:00.000Z', kind: 'meeting', visibility: 'department', department_id: 'dept-a1', created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('calendar_events', { id: 'event-personal-emp', company_id: 'comp-a', title: 'Personal Event', description: '', start_at: '2026-11-04T09:00:00.000Z', end_at: '2026-11-04T10:00:00.000Z', kind: 'event', visibility: 'personal', department_id: null, created_by: 'dash-employee-a', created_at: now });
  db.insert('calendar_events', { id: 'event-nov', company_id: 'comp-a', title: 'November Event', description: '', start_at: '2026-11-05T09:00:00.000Z', end_at: '2026-11-05T10:00:00.000Z', kind: 'event', visibility: 'company', department_id: null, created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('calendar_events', { id: 'event-dec', company_id: 'comp-a', title: 'December Event', description: '', start_at: '2026-12-05T09:00:00.000Z', end_at: '2026-12-05T10:00:00.000Z', kind: 'event', visibility: 'company', department_id: null, created_by: 'kluzar-user-owner-a', created_at: now });
  db.insert('calendar_events', { id: 'event-b', company_id: 'comp-b', title: 'Company B Event', description: '', start_at: '2026-11-02T09:00:00.000Z', end_at: '2026-11-02T10:00:00.000Z', kind: 'event', visibility: 'company', department_id: null, created_by: 'kluzar-user-owner-b', created_at: now });
  const tokens = {
    ownerA: 'p6-owner-a-token-test',
    adminA: 'p6-admin-a-token-test',
    managerA: 'p6-manager-a-token-test',
    employeeA: 'p6-employee-a-token-test',
    employee2A: 'p6-employee2-a-token-test',
    removedA: 'p6-removed-a-token-test',
    ownerB: 'p6-owner-b-token-test',
    employeeB: 'p6-employee-b-token-test',
    freeOwner: 'p6-free-token-test',
    growthOwner: 'p6-growth-token-test',
    expired: 'p6-expired-token-test',
    rate: 'p6-rate-token-test',
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

await test('projects guest denied', async () => {
  const { env } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/projects');
  eq(res.status, 401, 'status');
});

await test('projects free growth expired denial', async () => {
  const { env, tokens } = await makeEnv();
  const free = await call(env, 'GET', '/api/companies/comp-free/projects', { token: tokens.freeOwner });
  eq(free.status, 403, 'free status');
  const growth = await call(env, 'GET', '/api/companies/comp-growth/projects', { token: tokens.growthOwner });
  eq(growth.status, 403, 'growth status');
  const expired = await call(env, 'GET', '/api/companies/comp-expired/projects', { token: tokens.expired });
  eq(expired.status, 403, 'expired status');
});

await test('projects owner list with progress', async () => {
  const { env, tokens } = await makeEnv();
  const res = await call(env, 'GET', '/api/companies/comp-a/projects', { token: tokens.ownerA });
  eq(res.status, 200, 'status');
  eq(res.data.total, 3, 'total');
  const a1 = res.data.projects.find((p) => p.id === 'proj-a1');
  ok(a1, 'proj-a1 present');
  eq(a1.progress.total, 2, 'progress total');
  eq(a1.progress.done, 1, 'progress done');
  eq(a1.progress.percent, 50, 'progress percent');
});

await test('projects manager and employee scoped lists', async () => {
  const { env, tokens } = await makeEnv();
  const manager = await call(env, 'GET', '/api/companies/comp-a/projects', { token: tokens.managerA });
  eq(manager.status, 200, 'manager status');
  eq(manager.data.total, 2, 'manager total');
  ok(manager.data.projects.every((p) => p.departmentId === 'dept-a1'), 'manager only own dept');
  const employee = await call(env, 'GET', '/api/companies/comp-a/projects', { token: tokens.employeeA });
  eq(employee.status, 200, 'employee status');
  eq(employee.data.total, 1, 'employee total');
  eq(employee.data.projects[0].id, 'proj-a1', 'employee project');
  const filtered = await call(env, 'GET', '/api/companies/comp-a/projects?status=planned', { token: tokens.ownerA });
  eq(filtered.data.total, 2, 'status filter total');
});

await test('projects cross-company and guessed id 404', async () => {
  const { env, tokens } = await makeEnv();
  const cross = await call(env, 'GET', '/api/companies/comp-a/projects/proj-b', { token: tokens.ownerA });
  eq(cross.status, 404, 'cross status');
  const guessed = await call(env, 'GET', '/api/companies/comp-a/projects/does-not-exist', { token: tokens.ownerA });
  eq(guessed.status, 404, 'guessed status');
});

await test('projects create rules', async () => {
  const { env, db, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'New Project', departmentId: 'dept-a1', status: 'active' } });
  eq(created.status, 200, 'owner create status');
  ok(created.data.project.id, 'project id');
  eq(created.data.project.progress.percent, 0, 'new progress');
  const logs = await db.prepare("SELECT * FROM activity_logs WHERE company_id = ? AND action = ?").bind('comp-a', 'project_created').all();
  ok(logs.results.length >= 1, 'project created log');
  const managerOwn = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.managerA, body: { name: 'Manager Project', departmentId: 'dept-a1' } });
  eq(managerOwn.status, 200, 'manager own dept status');
  const managerOther = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.managerA, body: { name: 'Other Project', departmentId: 'dept-a2' } });
  eq(managerOther.status, 403, 'manager other dept status');
  const managerNone = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.managerA, body: { name: 'No Dept Project' } });
  eq(managerNone.status, 403, 'manager no dept status');
  const employee = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.employeeA, body: { name: 'Employee Project', departmentId: 'dept-a1' } });
  eq(employee.status, 403, 'employee create status');
});

await test('projects create validation and injected fields stripped', async () => {
  const { env, tokens } = await makeEnv();
  const empty = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: '   ', departmentId: 'dept-a1' } });
  eq(empty.status, 400, 'empty name status');
  const badStatus = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'Bad', status: 'flying' } });
  eq(badStatus.status, 400, 'bad status');
  const badDept = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'Bad', departmentId: 'dept-b1' } });
  eq(badDept.status, 400, 'other company dept status');
  const injected = await call(env, 'POST', '/api/companies/comp-a/projects', { token: tokens.ownerA, body: { name: 'Injected', owner_user_id: 'evil-user', company_id: 'comp-b', role: 'owner' } });
  eq(injected.status, 200, 'injected create status');
  eq(injected.data.project.ownerUserId, 'kluzar-user-owner-a', 'owner not injected');
});

await test('projects update rules', async () => {
  const { env, tokens } = await makeEnv();
  const owner = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a2/update', { token: tokens.ownerA, body: { projectId: 'proj-a2', name: 'Renamed A2', status: 'active' } });
  eq(owner.status, 200, 'owner update status');
  eq(owner.data.project.name, 'Renamed A2', 'renamed');
  const managerOwn = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a1/update', { token: tokens.managerA, body: { projectId: 'proj-a1', description: 'Manager edit' } });
  eq(managerOwn.status, 200, 'manager own update status');
  const managerOther = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a2/update', { token: tokens.managerA, body: { projectId: 'proj-a2', description: 'Nope' } });
  eq(managerOther.status, 403, 'manager other update status');
  const managerMove = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a1/update', { token: tokens.managerA, body: { projectId: 'proj-a1', departmentId: 'dept-a2' } });
  eq(managerMove.status, 403, 'manager move status');
  const employee = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a1/update', { token: tokens.employeeA, body: { projectId: 'proj-a1', name: 'Nope' } });
  eq(employee.status, 403, 'employee update status');
  const empty = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a1/update', { token: tokens.ownerA, body: { projectId: 'proj-a1' } });
  eq(empty.status, 400, 'empty update status');
});

await test('projects delete rules', async () => {
  const { env, tokens } = await makeEnv();
  const blocked = await call(env, 'POST', '/api/companies/comp-a/projects/proj-a1/delete', { token: tokens.ownerA, body: { projectId: 'proj-a1' } });
  eq(blocked.status, 400, 'blocked delete status');
  const manager = await call(env, 'POST', '/api/companies/comp-a/projects/proj-empty/delete', { token: tokens.managerA, body: { projectId: 'proj-empty' } });
  eq(manager.status, 403, 'manager delete status');
  const deleted = await call(env, 'POST', '/api/companies/comp-a/projects/proj-empty/delete', { token: tokens.ownerA, body: { projectId: 'proj-empty' } });
  eq(deleted.status, 200, 'owner delete status');
  const gone = await call(env, 'GET', '/api/companies/comp-a/projects/proj-empty', { token: tokens.ownerA });
  eq(gone.status, 404, 'deleted gone status');
});

await test('tasks scoped lists and filters', async () => {
  const { env, tokens } = await makeEnv();
  const owner = await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.ownerA });
  eq(owner.data.total, 4, 'owner total');
  const manager = await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.managerA });
  eq(manager.data.total, 2, 'manager total');
  const employee = await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.employeeA });
  eq(employee.data.total, 2, 'employee total');
  const employee2 = await call(env, 'GET', '/api/companies/comp-a/tasks', { token: tokens.employee2A });
  eq(employee2.data.total, 1, 'employee2 total');
  const byStatus = await call(env, 'GET', '/api/companies/comp-a/tasks?status=done', { token: tokens.ownerA });
  eq(byStatus.data.total, 1, 'status filter total');
  const byDept = await call(env, 'GET', '/api/companies/comp-a/tasks?department=dept-a1', { token: tokens.ownerA });
  eq(byDept.data.total, 2, 'department filter total');
  const byProject = await call(env, 'GET', '/api/companies/comp-a/tasks?project=proj-a2', { token: tokens.ownerA });
  eq(byProject.data.total, 1, 'project filter total');
  const byAssignee = await call(env, 'GET', '/api/companies/comp-a/tasks?assignee=dash-employee-a', { token: tokens.ownerA });
  eq(byAssignee.data.total, 2, 'assignee filter total');
});

await test('tasks cross-company and guessed id 404', async () => {
  const { env, tokens } = await makeEnv();
  const cross = await call(env, 'GET', '/api/companies/comp-a/tasks/task-b', { token: tokens.ownerA });
  eq(cross.status, 404, 'cross status');
  const guessed = await call(env, 'GET', '/api/companies/comp-a/tasks/does-not-exist', { token: tokens.ownerA });
  eq(guessed.status, 404, 'guessed status');
});

await test('tasks create rules', async () => {
  const { env, db, tokens } = await makeEnv();
  const created = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'New Task', projectId: 'proj-a1', assigneeUserId: 'dash-employee-a', priority: 'urgent' } });
  eq(created.status, 200, 'owner create status');
  const createdLogs = await db.prepare("SELECT * FROM activity_logs WHERE company_id = ? AND target_id = ? AND action = ?").bind('comp-a', created.data.task.id, 'task_created').all();
  eq(createdLogs.results.length, 1, 'task created log');
  const assignedLogs = await db.prepare("SELECT * FROM activity_logs WHERE company_id = ? AND target_id = ? AND action = ?").bind('comp-a', created.data.task.id, 'task_assigned').all();
  eq(assignedLogs.results.length, 1, 'task assigned log');
  const managerOwn = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.managerA, body: { title: 'Manager Task', projectId: 'proj-a1', assigneeUserId: 'dash-employee-a' } });
  eq(managerOwn.status, 200, 'manager own dept status');
  const managerOtherProject = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.managerA, body: { title: 'Other Project Task', projectId: 'proj-a2', assigneeUserId: 'dash-employee2-a' } });
  eq(managerOtherProject.status, 403, 'manager other project status');
  const managerOutsideAssign = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.managerA, body: { title: 'Outside Assign', projectId: 'proj-a1', assigneeUserId: 'dash-employee2-a' } });
  eq(managerOutsideAssign.status, 403, 'manager outside assign status');
  const managerSelf = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.managerA, body: { title: 'Self Task', projectId: 'proj-a2', assigneeUserId: 'dash-manager-a' } });
  eq(managerSelf.status, 200, 'manager self assign status');
  const managerNoAnchor = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.managerA, body: { title: 'No Anchor Task' } });
  eq(managerNoAnchor.status, 403, 'manager no anchor status');
  const employee = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.employeeA, body: { title: 'Employee Task' } });
  eq(employee.status, 403, 'employee create status');
  const badAssignee = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Bad Assignee', assigneeUserId: 'dash-employee-b' } });
  eq(badAssignee.status, 400, 'non-member assignee status');
  const otherProject = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Other Company Project', projectId: 'proj-b' } });
  eq(otherProject.status, 400, 'other company project status');
  const removedAssignee = await call(env, 'POST', '/api/companies/comp-a/tasks', { token: tokens.ownerA, body: { title: 'Removed Assignee', assigneeUserId: 'dash-removed-a' } });
  eq(removedAssignee.status, 400, 'removed assignee status');
});

await test('tasks update rules and history', async () => {
  const { env, db, tokens } = await makeEnv();
  const employeeStatus = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: tokens.employeeA, body: { taskId: 'task-a1', status: 'in_progress' } });
  eq(employeeStatus.status, 200, 'employee status status');
  const statusLogs = await db.prepare("SELECT * FROM activity_logs WHERE company_id = ? AND target_id = ? AND action = ?").bind('comp-a', 'task-a1', 'task_status_changed').all();
  eq(statusLogs.results.length, 1, 'status changed log');
  const employeePriority = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: tokens.employeeA, body: { taskId: 'task-a1', priority: 'urgent' } });
  eq(employeePriority.status, 403, 'employee priority status');
  const employeeOther = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a2/update', { token: tokens.employeeA, body: { taskId: 'task-a2', status: 'done' } });
  eq(employeeOther.status, 403, 'employee other task status');
  const managerReassignOutside = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: tokens.managerA, body: { taskId: 'task-a1', assigneeUserId: 'dash-employee2-a' } });
  eq(managerReassignOutside.status, 403, 'manager reassign outside status');
  const ownerReassign = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: tokens.ownerA, body: { taskId: 'task-a1', assigneeUserId: 'dash-employee2-a' } });
  eq(ownerReassign.status, 200, 'owner reassign status');
  eq(ownerReassign.data.task.assigneeUserId, 'dash-employee2-a', 'reassigned');
  const reassignLogs = await db.prepare("SELECT * FROM activity_logs WHERE company_id = ? AND target_id = ? AND action = ?").bind('comp-a', 'task-a1', 'task_assigned').all();
  eq(reassignLogs.results.length, 1, 'reassign log');
  const injected = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/update', { token: tokens.ownerA, body: { taskId: 'task-a1', status: 'review', company_id: 'comp-b', owner_user_id: 'evil-user' } });
  eq(injected.status, 200, 'injected update status');
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind('task-a1').first();
  eq(row.company_id, 'comp-a', 'company not injected');
});

await test('tasks delete rules and comment cascade', async () => {
  const { env, db, tokens } = await makeEnv();
  const manager = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/delete', { token: tokens.managerA, body: { taskId: 'task-a1' } });
  eq(manager.status, 403, 'manager delete status');
  const deleted = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/delete', { token: tokens.ownerA, body: { taskId: 'task-a1' } });
  eq(deleted.status, 200, 'owner delete status');
  const comments = await db.prepare('SELECT * FROM task_comments WHERE task_id = ?').bind('task-a1').all();
  eq(comments.results.length, 0, 'comments cascaded');
  const gone = await call(env, 'GET', '/api/companies/comp-a/tasks/task-a1', { token: tokens.ownerA });
  eq(gone.status, 404, 'deleted gone status');
});

await test('comments rules', async () => {
  const { env, tokens } = await makeEnv();
  const ownList = await call(env, 'GET', '/api/companies/comp-a/tasks/task-a1/comments', { token: tokens.employeeA });
  eq(ownList.status, 200, 'own list status');
  eq(ownList.data.total, 1, 'own list total');
  const otherList = await call(env, 'GET', '/api/companies/comp-a/tasks/task-a2/comments', { token: tokens.employeeA });
  eq(otherList.status, 403, 'other list status');
  const created = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments', { token: tokens.employeeA, body: { body: 'Another comment' } });
  eq(created.status, 200, 'create comment status');
  const otherCreate = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a2/comments', { token: tokens.employeeA, body: { body: 'Nope' } });
  eq(otherCreate.status, 403, 'other create status');
  const crossCreate = await call(env, 'POST', '/api/companies/comp-a/tasks/task-b/comments', { token: tokens.ownerA, body: { body: 'Nope' } });
  eq(crossCreate.status, 404, 'cross create status');
  const authorEdit = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments/comment-a1/update', { token: tokens.employeeA, body: { commentId: 'comment-a1', body: 'Edited by author' } });
  eq(authorEdit.status, 200, 'author edit status');
  const otherEdit = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments/comment-a1/update', { token: tokens.employee2A, body: { commentId: 'comment-a1', body: 'Hacked' } });
  eq(otherEdit.status, 403, 'other edit status');
  const adminEdit = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments/comment-a1/update', { token: tokens.adminA, body: { commentId: 'comment-a1', body: 'Edited by admin' } });
  eq(adminEdit.status, 200, 'admin edit status');
  const otherDelete = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments/comment-a1/delete', { token: tokens.employee2A, body: { commentId: 'comment-a1' } });
  eq(otherDelete.status, 403, 'other delete status');
  const authorDelete = await call(env, 'POST', '/api/companies/comp-a/tasks/task-a1/comments/comment-a1/delete', { token: tokens.employeeA, body: { commentId: 'comment-a1' } });
  eq(authorDelete.status, 200, 'author delete status');
});

await test('events visibility rules', async () => {
  const { env, tokens } = await makeEnv();
  const owner = await call(env, 'GET', '/api/companies/comp-a/events', { token: tokens.ownerA });
  eq(owner.data.total, 4, 'owner total');
  ok(owner.data.events.every((e) => e.id !== 'event-personal-emp'), 'owner misses personal event');
  const manager = await call(env, 'GET', '/api/companies/comp-a/events', { token: tokens.managerA });
  eq(manager.data.total, 4, 'manager total');
  const employee = await call(env, 'GET', '/api/companies/comp-a/events', { token: tokens.employeeA });
  eq(employee.data.total, 5, 'employee total');
  const employee2 = await call(env, 'GET', '/api/companies/comp-a/events', { token: tokens.employee2A });
  eq(employee2.data.total, 3, 'employee2 total');
  ok(employee2.data.events.every((e) => e.id !== 'event-dept-a1' && e.id !== 'event-personal-emp'), 'employee2 misses others');
  const personalGet = await call(env, 'GET', '/api/companies/comp-a/events/event-personal-emp', { token: tokens.employee2A });
  eq(personalGet.status, 403, 'personal get by other status');
  const crossGet = await call(env, 'GET', '/api/companies/comp-a/events/event-b', { token: tokens.ownerA });
  eq(crossGet.status, 404, 'cross get status');
  const guessed = await call(env, 'GET', '/api/companies/comp-a/events/does-not-exist', { token: tokens.ownerA });
  eq(guessed.status, 404, 'guessed status');
});

await test('events create rules', async () => {
  const { env, tokens } = await makeEnv();
  const personal = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.employeeA, body: { title: 'My Personal', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'personal' } });
  eq(personal.status, 200, 'employee personal status');
  const company = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.employeeA, body: { title: 'Company Try', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'company' } });
  eq(company.status, 403, 'employee company status');
  const managerOwn = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.managerA, body: { title: 'Dept Own', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'department', departmentId: 'dept-a1' } });
  eq(managerOwn.status, 200, 'manager own dept status');
  const managerOther = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.managerA, body: { title: 'Dept Other', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'department', departmentId: 'dept-a2' } });
  eq(managerOther.status, 403, 'manager other dept status');
  const noDept = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'No Dept', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'department' } });
  eq(noDept.status, 400, 'no dept status');
  const otherDept = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'Other Dept', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'department', departmentId: 'dept-b1' } });
  eq(otherDept.status, 400, 'other company dept status');
  const badRange = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'Bad Range', startAt: '2026-11-10T10:00:00.000Z', endAt: '2026-11-10T09:00:00.000Z' } });
  eq(badRange.status, 400, 'bad range status');
  const deptWithCompany = await call(env, 'POST', '/api/companies/comp-a/events', { token: tokens.ownerA, body: { title: 'Stray Dept', startAt: '2026-11-10T09:00:00.000Z', endAt: '2026-11-10T10:00:00.000Z', visibility: 'company', departmentId: 'dept-a1' } });
  eq(deptWithCompany.status, 400, 'stray dept status');
});

await test('events update delete and range filter', async () => {
  const { env, tokens } = await makeEnv();
  const creatorUpdate = await call(env, 'POST', '/api/companies/comp-a/events/event-personal-emp/update', { token: tokens.employeeA, body: { eventId: 'event-personal-emp', title: 'Personal Renamed' } });
  eq(creatorUpdate.status, 200, 'creator update status');
  const otherUpdate = await call(env, 'POST', '/api/companies/comp-a/events/event-company/update', { token: tokens.managerA, body: { eventId: 'event-company', title: 'Nope' } });
  eq(otherUpdate.status, 403, 'other update status');
  const adminUpdate = await call(env, 'POST', '/api/companies/comp-a/events/event-company/update', { token: tokens.adminA, body: { eventId: 'event-company', title: 'Admin Renamed' } });
  eq(adminUpdate.status, 200, 'admin update status');
  const otherDelete = await call(env, 'POST', '/api/companies/comp-a/events/event-company/delete', { token: tokens.managerA, body: { eventId: 'event-company' } });
  eq(otherDelete.status, 403, 'other delete status');
  const creatorDelete = await call(env, 'POST', '/api/companies/comp-a/events/event-personal-emp/delete', { token: tokens.employeeA, body: { eventId: 'event-personal-emp' } });
  eq(creatorDelete.status, 200, 'creator delete status');
  const ranged = await call(env, 'GET', '/api/companies/comp-a/events?start=2026-11-01T00:00:00&end=2026-11-30T23:59:59', { token: tokens.ownerA });
  eq(ranged.data.total, 3, 'range total');
  ok(ranged.data.events.some((e) => e.id === 'event-nov'), 'range includes november');
  ok(ranged.data.events.every((e) => e.id !== 'event-dec'), 'range excludes december');
});

await test('work CORS dash origin present wrong origin absent', async () => {
  const { env } = await makeEnv();
  const dash = await call(env, 'OPTIONS', '/api/companies/comp-a/projects', { origin: DASH_ORIGIN });
  eq(dash.headers.get('Access-Control-Allow-Origin'), DASH_ORIGIN, 'dash ACAO');
  const wrong = await call(env, 'OPTIONS', '/api/companies/comp-a/projects', { origin: WRONG_ORIGIN });
  eq(wrong.headers.get('Access-Control-Allow-Origin'), null, 'wrong ACAO absent');
});

await test('work write rate limit enforced once', async () => {
  const { env, tokens } = await makeEnv();
  let last = null;
  for (let i = 0; i < 601; i++) {
    last = await call(env, 'POST', '/api/companies/comp-rate/tasks', { token: tokens.rate, body: { title: 'Rate Task ' + i } });
  }
  eq(last.status, 429, '601st write status');
});

console.log('Phase 6: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
