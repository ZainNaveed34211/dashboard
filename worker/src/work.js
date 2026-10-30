import { fail } from './verify.js';
import { companyContext } from './companies.js';

export const PROJECT_STATUSES = ['planned', 'active', 'completed', 'archived'];
export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const EVENT_VISIBILITIES = ['company', 'department', 'personal'];
export const EVENT_KINDS = ['event', 'meeting', 'deadline'];

function nowIso() {
  return new Date().toISOString();
}

function logStmt(db, companyId, actorUserId, action, targetType, targetId) {
  return db.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), companyId, actorUserId, action, targetType, targetId, '', nowIso());
}

async function loadProjects(db, companyId) {
  const res = await db.prepare('SELECT * FROM projects WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  return (res && res.results) || [];
}

async function loadTasks(db, companyId) {
  const res = await db.prepare('SELECT * FROM tasks WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  return (res && res.results) || [];
}

async function loadEvents(db, companyId) {
  const res = await db.prepare('SELECT * FROM calendar_events WHERE company_id = ? ORDER BY start_at ASC').bind(companyId).all();
  return (res && res.results) || [];
}

function projectView(row, taskRows) {
  const mine = taskRows.filter((t) => t.project_id === row.id);
  const done = mine.filter((t) => t.status === 'done').length;
  const total = mine.length;
  return { id: row.id, name: row.name, description: row.description, departmentId: row.department_id || null, status: row.status, ownerUserId: row.owner_user_id, startDate: row.start_date || null, endDate: row.end_date || null, createdAt: row.created_at, updatedAt: row.updated_at, progress: { total, done, percent: total === 0 ? 0 : Math.round((done * 100) / total) } };
}

function taskView(row) {
  return { id: row.id, projectId: row.project_id || null, assigneeUserId: row.assignee_user_id || null, title: row.title, description: row.description, status: row.status, priority: row.priority, category: row.category, dueAt: row.due_at || null, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function commentView(row) {
  return { id: row.id, taskId: row.task_id, authorUserId: row.author_user_id, body: row.body, createdAt: row.created_at };
}

function eventView(row) {
  return { id: row.id, title: row.title, description: row.description, startAt: row.start_at, endAt: row.end_at, kind: row.kind, visibility: row.visibility, departmentId: row.department_id || null, createdBy: row.created_by, createdAt: row.created_at };
}

function projectVisible(ctx, project, taskRows) {
  if (ctx.role === 'owner' || ctx.role === 'admin') return true;
  if (ctx.role === 'manager') return !!ctx.membership.department_id && project.department_id === ctx.membership.department_id;
  return taskRows.some((t) => t.project_id === project.id && t.assignee_user_id === ctx.membership.user_id);
}

function taskVisible(ctx, task, project) {
  if (ctx.role === 'owner' || ctx.role === 'admin') return true;
  if (ctx.role === 'manager') return task.assignee_user_id === ctx.membership.user_id || (!!project && !!ctx.membership.department_id && project.department_id === ctx.membership.department_id);
  return task.assignee_user_id === ctx.membership.user_id;
}

function eventVisible(ctx, event) {
  if (event.visibility === 'company') return true;
  if (event.visibility === 'department') {
    if (ctx.role === 'owner' || ctx.role === 'admin') return true;
    return !!ctx.membership.department_id && event.department_id === ctx.membership.department_id;
  }
  return event.created_by === ctx.membership.user_id;
}

async function loadProject(db, companyId, projectId) {
  if (!projectId) return null;
  return db.prepare('SELECT * FROM projects WHERE id = ? AND company_id = ?').bind(projectId, companyId).first();
}

async function loadTask(db, companyId, taskId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').bind(taskId, companyId).first();
}

async function loadDepartment(db, companyId, departmentId) {
  if (!departmentId) return null;
  return db.prepare('SELECT * FROM departments WHERE id = ? AND company_id = ?').bind(departmentId, companyId).first();
}

async function loadActiveMember(db, companyId, userId) {
  if (!userId) return null;
  return db.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, userId).first();
}

export async function listProjects(env, session, companyId, filters) {
  const ctx = await companyContext(env, session, companyId);
  const projects = await loadProjects(env.DB, companyId);
  const tasks = await loadTasks(env.DB, companyId);
  let visible = projects.filter((p) => projectVisible(ctx, p, tasks));
  if (filters.status) visible = visible.filter((p) => p.status === filters.status);
  if (filters.departmentId) visible = visible.filter((p) => p.department_id === filters.departmentId);
  const sliced = visible.slice(filters.offset, filters.offset + filters.limit);
  return { ok: true, projects: sliced.map((p) => projectView(p, tasks)), total: visible.length };
}

export async function createProject(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role === 'employee') fail(403, 'Employees cannot create projects.');
  const name = data.name.trim();
  if (!name) fail(400, 'Invalid request.');
  const departmentId = data.departmentId || null;
  if (departmentId && !(await loadDepartment(env.DB, companyId, departmentId))) fail(400, 'Invalid request.');
  if (ctx.role === 'manager' && (!ctx.membership.department_id || departmentId !== ctx.membership.department_id)) fail(403, 'Managers can create projects only inside their own department.');
  const status = data.status || 'planned';
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO projects (id, company_id, department_id, name, description, status, owner_user_id, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, companyId, departmentId, name, data.description || '', status, ctx.membership.user_id, data.startDate || null, data.endDate || null, now, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'project_created', 'project', id),
  ]);
  return { ok: true, project: { id, name, description: data.description || '', departmentId, status, ownerUserId: ctx.membership.user_id, startDate: data.startDate || null, endDate: data.endDate || null, createdAt: now, updatedAt: now, progress: { total: 0, done: 0, percent: 0 } } };
}

export async function getProject(env, session, companyId, projectId) {
  const ctx = await companyContext(env, session, companyId);
  const project = await loadProject(env.DB, companyId, projectId);
  if (!project) fail(404, 'Not found.');
  const tasks = await loadTasks(env.DB, companyId);
  if (!projectVisible(ctx, project, tasks)) fail(403, 'You do not have access to this item.');
  return { ok: true, project: projectView(project, tasks) };
}

export async function updateProject(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const project = await loadProject(env.DB, companyId, data.projectId);
  if (!project) fail(404, 'Not found.');
  if (ctx.role === 'employee') fail(403, 'Employees cannot edit projects.');
  if (ctx.role === 'manager' && (!ctx.membership.department_id || project.department_id !== ctx.membership.department_id)) fail(403, 'Managers can edit projects only inside their own department.');
  if (data.name === undefined && data.description === undefined && data.departmentId === undefined && data.status === undefined && data.startDate === undefined && data.endDate === undefined) fail(400, 'Invalid request.');
  const name = data.name !== undefined ? data.name.trim() : project.name;
  if (!name) fail(400, 'Invalid request.');
  const departmentId = data.departmentId !== undefined ? data.departmentId : project.department_id;
  if (departmentId && !(await loadDepartment(env.DB, companyId, departmentId))) fail(400, 'Invalid request.');
  if (ctx.role === 'manager' && departmentId !== ctx.membership.department_id) fail(403, 'Managers can move projects only inside their own department.');
  const update = env.DB.prepare('UPDATE projects SET name = ?, description = ?, department_id = ?, status = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ? AND company_id = ?').bind(name, data.description !== undefined ? data.description : project.description, departmentId || null, data.status !== undefined ? data.status : project.status, data.startDate !== undefined ? data.startDate : project.start_date, data.endDate !== undefined ? data.endDate : project.end_date, nowIso(), data.projectId, companyId);
  await env.DB.batch([update, logStmt(env.DB, companyId, ctx.membership.user_id, 'project_updated', 'project', data.projectId)]);
  const updated = await loadProject(env.DB, companyId, data.projectId);
  const tasks = await loadTasks(env.DB, companyId);
  return { ok: true, project: projectView(updated, tasks) };
}

export async function deleteProject(env, session, companyId, projectId) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can delete projects.');
  const project = await loadProject(env.DB, companyId, projectId);
  if (!project) fail(404, 'Not found.');
  const tasks = await env.DB.prepare('SELECT * FROM tasks WHERE company_id = ? AND project_id = ?').bind(companyId, projectId).all();
  const count = ((tasks && tasks.results) || []).length;
  if (count > 0) fail(400, 'This project cannot be deleted because it still has ' + count + ' task' + (count === 1 ? '' : 's') + '. Move or delete those first.');
  const del = env.DB.prepare('DELETE FROM projects WHERE id = ? AND company_id = ?').bind(projectId, companyId);
  await env.DB.batch([del, logStmt(env.DB, companyId, ctx.membership.user_id, 'project_deleted', 'project', projectId)]);
  return { ok: true, deleted: true };
}

export async function listTasks(env, session, companyId, filters) {
  const ctx = await companyContext(env, session, companyId);
  const tasks = await loadTasks(env.DB, companyId);
  const projects = await loadProjects(env.DB, companyId);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  let visible = tasks.filter((t) => taskVisible(ctx, t, t.project_id ? projectById.get(t.project_id) || null : null));
  if (filters.status) visible = visible.filter((t) => t.status === filters.status);
  if (filters.priority) visible = visible.filter((t) => t.priority === filters.priority);
  if (filters.assigneeUserId) visible = visible.filter((t) => t.assignee_user_id === filters.assigneeUserId);
  if (filters.projectId) visible = visible.filter((t) => t.project_id === filters.projectId);
  if (filters.departmentId) visible = visible.filter((t) => t.project_id && projectById.get(t.project_id) && projectById.get(t.project_id).department_id === filters.departmentId);
  if (filters.category) visible = visible.filter((t) => t.category === filters.category);
  const sliced = visible.slice(filters.offset, filters.offset + filters.limit);
  return { ok: true, tasks: sliced.map(taskView), total: visible.length };
}

export async function createTask(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role === 'employee') fail(403, 'Employees cannot create tasks.');
  const title = data.title.trim();
  if (!title) fail(400, 'Invalid request.');
  const project = await loadProject(env.DB, companyId, data.projectId || null);
  if (data.projectId && !project) fail(400, 'Invalid request.');
  const assignee = await loadActiveMember(env.DB, companyId, data.assigneeUserId || null);
  if (data.assigneeUserId && !assignee) fail(400, 'Invalid request.');
  if (ctx.role === 'manager') {
    const selfAssign = data.assigneeUserId === ctx.membership.user_id;
    const effectiveDept = project ? project.department_id : (assignee ? assignee.department_id : null);
    if (!selfAssign && (!ctx.membership.department_id || effectiveDept !== ctx.membership.department_id)) fail(403, 'Managers can create tasks only inside their own department.');
    if (data.assigneeUserId && !selfAssign && assignee.department_id !== ctx.membership.department_id) fail(403, 'Managers can assign tasks only inside their own department.');
  }
  const now = nowIso();
  const id = crypto.randomUUID();
  const stmts = [
    env.DB.prepare('INSERT INTO tasks (id, company_id, project_id, assignee_user_id, title, description, status, priority, category, due_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, companyId, data.projectId || null, data.assigneeUserId || null, title, data.description || '', data.status || 'todo', data.priority || 'medium', data.category || '', data.dueAt || null, ctx.membership.user_id, now, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'task_created', 'task', id),
  ];
  if (data.assigneeUserId) stmts.push(logStmt(env.DB, companyId, ctx.membership.user_id, 'task_assigned', 'task', id));
  await env.DB.batch(stmts);
  return { ok: true, task: { id, projectId: data.projectId || null, assigneeUserId: data.assigneeUserId || null, title, description: data.description || '', status: data.status || 'todo', priority: data.priority || 'medium', category: data.category || '', dueAt: data.dueAt || null, createdBy: ctx.membership.user_id, createdAt: now, updatedAt: now } };
}

export async function getTask(env, session, companyId, taskId) {
  const ctx = await companyContext(env, session, companyId);
  const task = await loadTask(env.DB, companyId, taskId);
  if (!task) fail(404, 'Not found.');
  const project = await loadProject(env.DB, companyId, task.project_id);
  if (!taskVisible(ctx, task, project)) fail(403, 'You do not have access to this item.');
  return { ok: true, task: taskView(task) };
}

export async function updateTask(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const task = await loadTask(env.DB, companyId, data.taskId);
  if (!task) fail(404, 'Not found.');
  const project = await loadProject(env.DB, companyId, task.project_id);
  if (!taskVisible(ctx, task, project)) fail(403, 'You do not have access to this item.');
  if (ctx.role === 'employee') {
    const extra = data.title !== undefined || data.description !== undefined || data.projectId !== undefined || data.assigneeUserId !== undefined || data.priority !== undefined || data.category !== undefined || data.dueAt !== undefined;
    if (extra) fail(403, 'Employees can change only the status of their own tasks.');
    if (data.status === undefined) fail(400, 'Invalid request.');
  } else if (data.title === undefined && data.description === undefined && data.projectId === undefined && data.assigneeUserId === undefined && data.status === undefined && data.priority === undefined && data.category === undefined && data.dueAt === undefined) {
    fail(400, 'Invalid request.');
  }
  const title = data.title !== undefined ? data.title.trim() : task.title;
  if (!title) fail(400, 'Invalid request.');
  let newProject = project;
  if (data.projectId !== undefined && data.projectId) {
    newProject = await loadProject(env.DB, companyId, data.projectId);
    if (!newProject) fail(400, 'Invalid request.');
  }
  const newProjectId = data.projectId !== undefined ? data.projectId : task.project_id;
  let newAssigneeId = data.assigneeUserId !== undefined ? data.assigneeUserId : task.assignee_user_id;
  if (data.assigneeUserId !== undefined && data.assigneeUserId) {
    const assignee = await loadActiveMember(env.DB, companyId, data.assigneeUserId);
    if (!assignee) fail(400, 'Invalid request.');
    if (ctx.role === 'manager' && data.assigneeUserId !== ctx.membership.user_id && assignee.department_id !== ctx.membership.department_id) fail(403, 'Managers can assign tasks only inside their own department.');
  }
  if (ctx.role === 'manager' && data.projectId !== undefined && newProject && newProject.department_id !== ctx.membership.department_id && task.assignee_user_id !== ctx.membership.user_id) fail(403, 'Managers can move tasks only inside their own department.');
  const stmts = [];
  const update = env.DB.prepare('UPDATE tasks SET title = ?, description = ?, project_id = ?, assignee_user_id = ?, status = ?, priority = ?, category = ?, due_at = ?, updated_at = ? WHERE id = ? AND company_id = ?').bind(title, data.description !== undefined ? data.description : task.description, newProjectId || null, newAssigneeId || null, data.status !== undefined ? data.status : task.status, data.priority !== undefined ? data.priority : task.priority, data.category !== undefined ? data.category : task.category, data.dueAt !== undefined ? data.dueAt : task.due_at, nowIso(), data.taskId, companyId);
  stmts.push(update);
  if (data.status !== undefined && data.status !== task.status) stmts.push(logStmt(env.DB, companyId, ctx.membership.user_id, 'task_status_changed', 'task', data.taskId));
  if (data.assigneeUserId !== undefined && data.assigneeUserId !== task.assignee_user_id) stmts.push(logStmt(env.DB, companyId, ctx.membership.user_id, 'task_assigned', 'task', data.taskId));
  if (stmts.length === 1) stmts.push(logStmt(env.DB, companyId, ctx.membership.user_id, 'task_updated', 'task', data.taskId));
  await env.DB.batch(stmts);
  const updated = await loadTask(env.DB, companyId, data.taskId);
  return { ok: true, task: taskView(updated) };
}

export async function deleteTask(env, session, companyId, taskId) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can delete tasks.');
  const task = await loadTask(env.DB, companyId, taskId);
  if (!task) fail(404, 'Not found.');
  const delComments = env.DB.prepare('DELETE FROM task_comments WHERE company_id = ? AND task_id = ?').bind(companyId, taskId);
  const del = env.DB.prepare('DELETE FROM tasks WHERE id = ? AND company_id = ?').bind(taskId, companyId);
  await env.DB.batch([delComments, del, logStmt(env.DB, companyId, ctx.membership.user_id, 'task_deleted', 'task', taskId)]);
  return { ok: true, deleted: true };
}

export async function listComments(env, session, companyId, taskId) {
  const ctx = await companyContext(env, session, companyId);
  const task = await loadTask(env.DB, companyId, taskId);
  if (!task) fail(404, 'Not found.');
  const project = await loadProject(env.DB, companyId, task.project_id);
  if (!taskVisible(ctx, task, project)) fail(403, 'You do not have access to this item.');
  const res = await env.DB.prepare('SELECT * FROM task_comments WHERE company_id = ? AND task_id = ? ORDER BY created_at ASC').bind(companyId, taskId).all();
  const rows = (res && res.results) || [];
  return { ok: true, comments: rows.map(commentView), total: rows.length };
}

export async function createComment(env, session, companyId, taskId, data) {
  const ctx = await companyContext(env, session, companyId);
  const task = await loadTask(env.DB, companyId, taskId);
  if (!task) fail(404, 'Not found.');
  const project = await loadProject(env.DB, companyId, task.project_id);
  if (!taskVisible(ctx, task, project)) fail(403, 'You do not have access to this item.');
  const body = data.body.trim();
  if (!body) fail(400, 'Invalid request.');
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO task_comments (id, company_id, task_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, companyId, taskId, ctx.membership.user_id, body, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'comment_created', 'task', taskId),
  ]);
  return { ok: true, comment: { id, taskId, authorUserId: ctx.membership.user_id, body, createdAt: now } };
}

export async function updateComment(env, session, companyId, taskId, data) {
  const ctx = await companyContext(env, session, companyId);
  const comment = await env.DB.prepare('SELECT * FROM task_comments WHERE id = ? AND company_id = ? AND task_id = ?').bind(data.commentId, companyId, taskId).first();
  if (!comment) fail(404, 'Not found.');
  if (comment.author_user_id !== ctx.membership.user_id && ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only the author, owners and admins can edit comments.');
  const body = data.body.trim();
  if (!body) fail(400, 'Invalid request.');
  await env.DB.prepare('UPDATE task_comments SET body = ? WHERE id = ? AND company_id = ? AND task_id = ?').bind(body, data.commentId, companyId, taskId).run();
  return { ok: true, comment: { id: comment.id, taskId, authorUserId: comment.author_user_id, body, createdAt: comment.created_at } };
}

export async function deleteComment(env, session, companyId, taskId, commentId) {
  const ctx = await companyContext(env, session, companyId);
  const comment = await env.DB.prepare('SELECT * FROM task_comments WHERE id = ? AND company_id = ? AND task_id = ?').bind(commentId, companyId, taskId).first();
  if (!comment) fail(404, 'Not found.');
  if (comment.author_user_id !== ctx.membership.user_id && ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only the author, owners and admins can delete comments.');
  const del = env.DB.prepare('DELETE FROM task_comments WHERE id = ? AND company_id = ? AND task_id = ?').bind(commentId, companyId, taskId);
  await env.DB.batch([del, logStmt(env.DB, companyId, ctx.membership.user_id, 'comment_deleted', 'task', taskId)]);
  return { ok: true, deleted: true };
}

export async function listEvents(env, session, companyId, filters) {
  const ctx = await companyContext(env, session, companyId);
  const events = await loadEvents(env.DB, companyId);
  let visible = events.filter((e) => eventVisible(ctx, e));
  if (filters.visibility) visible = visible.filter((e) => e.visibility === filters.visibility);
  if (filters.start && filters.end) visible = visible.filter((e) => e.start_at < filters.end && e.end_at > filters.start);
  const sliced = visible.slice(filters.offset, filters.offset + filters.limit);
  return { ok: true, events: sliced.map(eventView), total: visible.length };
}

export async function createEvent(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const title = data.title.trim();
  if (!title) fail(400, 'Invalid request.');
  if (data.startAt >= data.endAt) fail(400, 'Invalid request.');
  const visibility = data.visibility || 'company';
  const departmentId = data.departmentId || null;
  if (visibility === 'department') {
    if (!departmentId) fail(400, 'Invalid request.');
    if (!(await loadDepartment(env.DB, companyId, departmentId))) fail(400, 'Invalid request.');
    if (ctx.role === 'manager' && departmentId !== ctx.membership.department_id) fail(403, 'Managers can create department events only for their own department.');
  } else if (departmentId) {
    fail(400, 'Invalid request.');
  }
  if (ctx.role === 'employee' && visibility !== 'personal') fail(403, 'Employees can create personal events only.');
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO calendar_events (id, company_id, title, description, start_at, end_at, kind, visibility, department_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, companyId, title, data.description || '', data.startAt, data.endAt, data.kind || 'event', visibility, departmentId, ctx.membership.user_id, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'event_created', 'event', id),
  ]);
  return { ok: true, event: { id, title, description: data.description || '', startAt: data.startAt, endAt: data.endAt, kind: data.kind || 'event', visibility, departmentId, createdBy: ctx.membership.user_id, createdAt: now } };
}

export async function getEvent(env, session, companyId, eventId) {
  const ctx = await companyContext(env, session, companyId);
  const event = await env.DB.prepare('SELECT * FROM calendar_events WHERE id = ? AND company_id = ?').bind(eventId, companyId).first();
  if (!event) fail(404, 'Not found.');
  if (!eventVisible(ctx, event)) fail(403, 'You do not have access to this item.');
  return { ok: true, event: eventView(event) };
}

export async function updateEvent(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const event = await env.DB.prepare('SELECT * FROM calendar_events WHERE id = ? AND company_id = ?').bind(data.eventId, companyId).first();
  if (!event) fail(404, 'Not found.');
  if (event.created_by !== ctx.membership.user_id && ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only the creator, owners and admins can edit events.');
  if (data.title === undefined && data.description === undefined && data.startAt === undefined && data.endAt === undefined && data.kind === undefined && data.visibility === undefined && data.departmentId === undefined) fail(400, 'Invalid request.');
  const title = data.title !== undefined ? data.title.trim() : event.title;
  if (!title) fail(400, 'Invalid request.');
  const startAt = data.startAt !== undefined ? data.startAt : event.start_at;
  const endAt = data.endAt !== undefined ? data.endAt : event.end_at;
  if (startAt >= endAt) fail(400, 'Invalid request.');
  const visibility = data.visibility !== undefined ? data.visibility : event.visibility;
  const departmentId = data.departmentId !== undefined ? data.departmentId : event.department_id;
  if (visibility === 'department') {
    if (!departmentId) fail(400, 'Invalid request.');
    if (!(await loadDepartment(env.DB, companyId, departmentId))) fail(400, 'Invalid request.');
  } else if (departmentId) {
    fail(400, 'Invalid request.');
  }
  if (ctx.role === 'employee' && visibility !== 'personal') fail(403, 'Employees can manage personal events only.');
  const update = env.DB.prepare('UPDATE calendar_events SET title = ?, description = ?, start_at = ?, end_at = ?, kind = ?, visibility = ?, department_id = ? WHERE id = ? AND company_id = ?').bind(title, data.description !== undefined ? data.description : event.description, startAt, endAt, data.kind !== undefined ? data.kind : event.kind, visibility, departmentId || null, data.eventId, companyId);
  await env.DB.batch([update, logStmt(env.DB, companyId, ctx.membership.user_id, 'event_updated', 'event', data.eventId)]);
  const updated = await env.DB.prepare('SELECT * FROM calendar_events WHERE id = ? AND company_id = ?').bind(data.eventId, companyId).first();
  return { ok: true, event: eventView(updated) };
}

export async function deleteEvent(env, session, companyId, eventId) {
  const ctx = await companyContext(env, session, companyId);
  const event = await env.DB.prepare('SELECT * FROM calendar_events WHERE id = ? AND company_id = ?').bind(eventId, companyId).first();
  if (!event) fail(404, 'Not found.');
  if (event.created_by !== ctx.membership.user_id && ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only the creator, owners and admins can delete events.');
  const del = env.DB.prepare('DELETE FROM calendar_events WHERE id = ? AND company_id = ?').bind(eventId, companyId);
  await env.DB.batch([del, logStmt(env.DB, companyId, ctx.membership.user_id, 'event_deleted', 'event', eventId)]);
  return { ok: true, deleted: true };
}
