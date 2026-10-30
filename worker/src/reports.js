import { fail } from './verify.js';
import { companyContext } from './companies.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nowIso() {
  return new Date().toISOString();
}

function inRange(dateStr, start, end) {
  const d = (dateStr || '').slice(0, 10);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function countBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count }));
}

async function loadTable(db, table, companyId) {
  const res = await db.prepare('SELECT * FROM ' + table + ' WHERE company_id = ?').bind(companyId).all();
  return (res && res.results) || [];
}

export async function getReport(env, session, companyId, query) {
  const ctx = await companyContext(env, session, companyId);
  const start = query.start || '';
  const end = query.end || '';
  if ((start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end))) fail(400, 'Invalid request.');
  const members = (await loadTable(env.DB, 'company_members', companyId)).filter((m) => m.status === 'active');
  const projects = await loadTable(env.DB, 'projects', companyId);
  const tasks = await loadTable(env.DB, 'tasks', companyId);
  const attendance = await loadTable(env.DB, 'attendance_records', companyId);
  const documents = await loadTable(env.DB, 'documents', companyId);
  const activity = await loadTable(env.DB, 'activity_logs', companyId);
  const departments = await loadTable(env.DB, 'departments', companyId);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const myDept = ctx.membership.department_id || null;
  const myId = ctx.membership.user_id;
  const deptMemberIds = new Set(members.filter((m) => myDept && m.department_id === myDept).map((m) => m.user_id));
  let visibleMembers = members;
  let visibleProjects = projects;
  let visibleTasks = tasks;
  let visibleAttendance = attendance;
  let visibleActivity = activity;
  if (ctx.role === 'manager') {
    visibleMembers = members.filter((m) => m.user_id === myId || deptMemberIds.has(m.user_id));
    visibleProjects = projects.filter((p) => p.department_id === myDept);
    const deptProjectIds = new Set(visibleProjects.map((p) => p.id));
    visibleTasks = tasks.filter((t) => t.assignee_user_id === myId || (t.project_id && deptProjectIds.has(t.project_id)));
    visibleAttendance = attendance.filter((r) => r.user_id === myId || deptMemberIds.has(r.user_id));
    visibleActivity = activity.filter((r) => r.actor_user_id === myId || deptMemberIds.has(r.actor_user_id));
  } else if (ctx.role === 'employee') {
    const myProjectIds = new Set(tasks.filter((t) => t.assignee_user_id === myId && t.project_id).map((t) => t.project_id));
    visibleMembers = members.filter((m) => m.user_id === myId);
    visibleProjects = projects.filter((p) => myProjectIds.has(p.id));
    visibleTasks = tasks.filter((t) => t.assignee_user_id === myId);
    visibleAttendance = attendance.filter((r) => r.user_id === myId);
    visibleActivity = activity.filter((r) => r.actor_user_id === myId);
  }
  const rangedProjects = visibleProjects.filter((p) => inRange(p.created_at, start, end));
  const rangedTasks = visibleTasks.filter((t) => inRange(t.created_at, start, end));
  const rangedAttendance = visibleAttendance.filter((r) => inRange(r.date, start, end));
  const rangedDocuments = documents.filter((d) => inRange(d.created_at, start, end));
  const rangedActivity = visibleActivity.filter((r) => inRange(r.created_at, start, end));
  const recentActivity = [...rangedActivity].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, 20).map((r) => ({ action: r.action, targetType: r.target_type, targetId: r.target_id, actorUserId: r.actor_user_id, createdAt: r.created_at }));
  return {
    ok: true,
    report: {
      range: { start: start || null, end: end || null },
      role: ctx.role,
      membersTotal: visibleMembers.length,
      membersByDepartment: countBy(visibleMembers, (m) => m.department_id || '').map((e) => ({ departmentId: e.key || null, departmentName: e.key ? (deptName.get(e.key) || null) : null, count: e.count })),
      membersByRole: countBy(visibleMembers, (m) => m.role).map((e) => ({ role: e.key, count: e.count })),
      projectsTotal: rangedProjects.length,
      projectsByStatus: countBy(rangedProjects, (p) => p.status).map((e) => ({ status: e.key, count: e.count })),
      tasksTotal: rangedTasks.length,
      tasksByStatus: countBy(rangedTasks, (t) => t.status).map((e) => ({ status: e.key, count: e.count })),
      tasksByPriority: countBy(rangedTasks, (t) => t.priority).map((e) => ({ priority: e.key, count: e.count })),
      tasksByAssignee: countBy(rangedTasks, (t) => t.assignee_user_id || '').map((e) => ({ assigneeUserId: e.key || null, count: e.count })),
      attendanceTotal: rangedAttendance.length,
      attendanceByStatus: countBy(rangedAttendance, (r) => r.status).map((e) => ({ status: e.key, count: e.count })),
      documentsCount: rangedDocuments.length,
      documentsTotalBytes: rangedDocuments.reduce((sum, d) => sum + (d.size || 0), 0),
      recentActivity,
    },
  };
}

export async function trackAnalyticsEvent(env, session, data) {
  const ctx = await companyContext(env, session, data.companyId);
  const event = String(data.event || '').trim().slice(0, 64);
  if (!event) fail(400, 'Invalid request.');
  const tool = String(data.tool || '').trim().slice(0, 64);
  const outcome = String(data.outcome || '').trim().slice(0, 32);
  await env.DB.prepare('INSERT INTO dashboard_analytics_events (id, company_id, event, tool, outcome, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), ctx.company.id, event, tool, outcome, nowIso()).run();
  return { ok: true, recorded: true };
}
