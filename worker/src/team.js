import { fail } from './verify.js';
import { companyContext } from './companies.js';
import { notificationStmt } from './notifications.js';

function nowIso() {
  return new Date().toISOString();
}

function logStmt(db, companyId, actorUserId, action, targetType, targetId) {
  return db.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), companyId, actorUserId, action, targetType, targetId, '', nowIso());
}

function announcementView(row) {
  return { id: row.id, title: row.title, body: row.body, authorUserId: row.author_user_id, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listAnnouncements(env, session, companyId, page) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM announcements WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  const all = (res && res.results) || [];
  const sliced = all.slice(page.offset, page.offset + page.limit);
  return { ok: true, announcements: sliced.map(announcementView), total: all.length };
}

export async function createAnnouncement(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role === 'employee') fail(403, 'Only owners, admins and managers can post announcements.');
  const title = data.title.trim();
  if (!title) fail(400, 'Invalid request.');
  const id = crypto.randomUUID();
  const now = nowIso();
  const membersRes = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND status = 'active'").bind(companyId).all();
  const memberRows = (membersRes && membersRes.results) || [];
  const notifyStmts = memberRows.filter((m) => m.user_id !== ctx.membership.user_id).map((m) => notificationStmt(env.DB, companyId, m.user_id, 'announcement', title, data.body, id));
  await env.DB.batch([
    env.DB.prepare('INSERT INTO announcements (id, company_id, author_user_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, companyId, ctx.membership.user_id, title, data.body, now, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'announcement_created', 'announcement', id),
    ...notifyStmts,
  ]);
  return { ok: true, announcement: { id, title, body: data.body, authorUserId: ctx.membership.user_id, createdAt: now, updatedAt: now } };
}

export async function updateAnnouncement(env, session, companyId, annId, data) {
  const ctx = await companyContext(env, session, companyId);
  const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ? AND company_id = ?').bind(annId, companyId).first();
  if (!row) fail(404, 'Not found.');
  if (ctx.role === 'employee') fail(403, 'Only owners, admins and managers can edit announcements.');
  if (ctx.role === 'manager' && row.author_user_id !== ctx.membership.user_id) fail(403, 'Managers can edit only their own announcements.');
  if (data.title === undefined && data.body === undefined) fail(400, 'Invalid request.');
  const title = data.title !== undefined ? data.title.trim() : row.title;
  if (!title) fail(400, 'Invalid request.');
  const body = data.body !== undefined ? data.body : row.body;
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE announcements SET title = ?, body = ?, updated_at = ? WHERE id = ? AND company_id = ?').bind(title, body, now, annId, companyId),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'announcement_updated', 'announcement', annId),
  ]);
  return { ok: true, announcement: { id: annId, title, body, authorUserId: row.author_user_id, createdAt: row.created_at, updatedAt: now } };
}

export async function deleteAnnouncement(env, session, companyId, annId) {
  const ctx = await companyContext(env, session, companyId);
  const row = await env.DB.prepare('SELECT * FROM announcements WHERE id = ? AND company_id = ?').bind(annId, companyId).first();
  if (!row) fail(404, 'Not found.');
  if (ctx.role === 'employee') fail(403, 'Only owners, admins and the author can delete announcements.');
  if (ctx.role === 'manager' && row.author_user_id !== ctx.membership.user_id) fail(403, 'Managers can delete only their own announcements.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM announcements WHERE id = ? AND company_id = ?').bind(annId, companyId),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'announcement_deleted', 'announcement', annId),
  ]);
  return { ok: true, deleted: true };
}

export async function getProfile(env, session) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const member = await env.DB.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(session.user_id).first();
  if (member) {
    return { ok: true, profile: { userId: member.id, email: member.email, firstName: member.first_name || '', lastName: member.last_name || '', jobTitle: member.job_title || '', phone: member.phone || '', userType: 'member' } };
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (!user) fail(404, 'Not found.');
  return { ok: true, profile: { userId: user.id, email: user.email || '', firstName: user.firstName || '', lastName: user.lastName || '', jobTitle: '', phone: user.phone || '', userType: 'owner' } };
}

export async function updateProfile(env, session, data) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const member = await env.DB.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(session.user_id).first();
  if (!member) fail(403, 'Company owners manage their profile in Kluzar accounts.');
  if (data.firstName === undefined && data.lastName === undefined && data.jobTitle === undefined && data.phone === undefined) fail(400, 'Invalid request.');
  const firstName = data.firstName !== undefined ? data.firstName.trim() : (member.first_name || '');
  const lastName = data.lastName !== undefined ? data.lastName.trim() : (member.last_name || '');
  const jobTitle = data.jobTitle !== undefined ? data.jobTitle.trim() : (member.job_title || '');
  const phone = data.phone !== undefined ? data.phone.trim() : (member.phone || '');
  await env.DB.prepare('UPDATE dashboard_users SET first_name = ?, last_name = ?, job_title = ?, phone = ?, updated_at = ? WHERE id = ?').bind(firstName, lastName, jobTitle, phone, nowIso(), session.user_id).run();
  return { ok: true, profile: { userId: member.id, email: member.email, firstName, lastName, jobTitle, phone, userType: 'member' } };
}

function attendanceView(row) {
  return { id: row.id, userId: row.user_id, date: row.date, status: row.status, checkInAt: row.check_in_at || null, checkOutAt: row.check_out_at || null, note: row.note, createdAt: row.created_at };
}

export async function listAttendance(env, session, companyId, filters) {
  const ctx = await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM attendance_records WHERE company_id = ? ORDER BY date DESC').bind(companyId).all();
  const all = (res && res.results) || [];
  let visible = all;
  if (ctx.role === 'employee') {
    visible = all.filter((r) => r.user_id === ctx.membership.user_id);
  } else if (ctx.role === 'manager') {
    const membersRes = await env.DB.prepare('SELECT * FROM company_members WHERE company_id = ?').bind(companyId).all();
    const deptOf = new Map(((membersRes && membersRes.results) || []).map((m) => [m.user_id, m.department_id]));
    visible = all.filter((r) => r.user_id === ctx.membership.user_id || (ctx.membership.department_id && deptOf.get(r.user_id) === ctx.membership.department_id));
  }
  if (filters.userId) visible = visible.filter((r) => r.user_id === filters.userId);
  if (filters.date) visible = visible.filter((r) => r.date === filters.date);
  const sliced = visible.slice(filters.offset, filters.offset + filters.limit);
  return { ok: true, attendance: sliced.map(attendanceView), total: visible.length };
}

export async function checkIn(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const date = data.date || new Date().toISOString().slice(0, 10);
  const existing = await env.DB.prepare('SELECT * FROM attendance_records WHERE company_id = ? AND user_id = ? AND date = ?').bind(companyId, ctx.membership.user_id, date).first();
  if (existing) fail(400, 'Attendance for this date is already recorded.');
  const id = crypto.randomUUID();
  const now = nowIso();
  const status = data.status || 'present';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO attendance_records (id, company_id, user_id, date, status, check_in_at, check_out_at, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').bind(id, companyId, ctx.membership.user_id, date, status, now, data.note || '', now, now),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'attendance_checked_in', 'attendance', id),
  ]);
  return { ok: true, attendance: { id, userId: ctx.membership.user_id, date, status, checkInAt: now, checkOutAt: null, note: data.note || '', createdAt: now } };
}

export async function checkOut(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  const date = data.date || new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare('SELECT * FROM attendance_records WHERE company_id = ? AND user_id = ? AND date = ?').bind(companyId, ctx.membership.user_id, date).first();
  if (!row) fail(400, 'No check-in found for this date.');
  if (row.check_out_at) fail(400, 'Already checked out for this date.');
  const now = nowIso();
  const note = data.note !== undefined ? data.note : row.note;
  await env.DB.batch([
    env.DB.prepare('UPDATE attendance_records SET check_out_at = ?, note = ?, updated_at = ? WHERE id = ? AND company_id = ?').bind(now, note, now, row.id, companyId),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'attendance_checked_out', 'attendance', row.id),
  ]);
  return { ok: true, attendance: { id: row.id, userId: ctx.membership.user_id, date, status: row.status, checkInAt: row.check_in_at, checkOutAt: now, note, createdAt: row.created_at } };
}
