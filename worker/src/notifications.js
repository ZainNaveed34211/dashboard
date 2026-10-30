import { fail } from './verify.js';
import { companyContext } from './companies.js';
import { ownerEntitlement } from './auth.js';

function nowIso() {
  return new Date().toISOString();
}

function dayStr(date) {
  return date.toISOString().slice(0, 10);
}

export function notificationStmt(db, companyId, userId, kind, title, body, targetId) {
  return db.prepare('INSERT INTO notifications (id, company_id, user_id, kind, title, body, target_id, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)').bind(crypto.randomUUID(), companyId, userId, kind, String(title).slice(0, 200), String(body).slice(0, 500), targetId || '', nowIso());
}

export async function createNotification(db, companyId, userId, kind, title, body, targetId) {
  await notificationStmt(db, companyId, userId, kind, title, body, targetId).run();
}

function notificationView(row) {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, targetId: row.target_id || null, readAt: row.read_at || null, createdAt: row.created_at };
}

export async function listNotifications(env, session, companyId, page) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM notifications WHERE company_id = ? AND user_id = ? ORDER BY created_at DESC').bind(companyId, session.user_id).all();
  const all = (res && res.results) || [];
  const unreadCount = all.filter((n) => !n.read_at).length;
  const sorted = [...all].sort((a, b) => {
    const aUnread = a.read_at ? 1 : 0;
    const bUnread = b.read_at ? 1 : 0;
    if (aUnread !== bUnread) return aUnread - bUnread;
    if (a.created_at < b.created_at) return 1;
    if (a.created_at > b.created_at) return -1;
    return 0;
  });
  const sliced = sorted.slice(page.offset, page.offset + page.limit);
  return { ok: true, notifications: sliced.map(notificationView), unreadCount, total: all.length };
}

export async function unreadNotificationsCount(env, session, companyId) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM notifications WHERE company_id = ? AND user_id = ?').bind(companyId, session.user_id).all();
  const all = (res && res.results) || [];
  return { ok: true, unreadCount: all.filter((n) => !n.read_at).length };
}

export async function markNotificationRead(env, session, companyId, notificationId) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND company_id = ? AND user_id = ?').bind(nowIso(), notificationId, companyId, session.user_id).run();
  if (!res.meta || res.meta.changes === 0) fail(404, 'Not found.');
  return { ok: true, read: true };
}

export async function markAllNotificationsRead(env, session, companyId) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('UPDATE notifications SET read_at = ? WHERE company_id = ? AND user_id = ? AND read_at IS NULL').bind(nowIso(), companyId, session.user_id).run();
  return { ok: true, updated: res.meta ? res.meta.changes : 0 };
}

export async function runDeadlineReminders(env, now) {
  const today = dayStr(now);
  const tomorrow = dayStr(new Date(now.getTime() + 86400000));
  const companiesRes = await env.DB.prepare('SELECT * FROM companies').all();
  const companies = (companiesRes && companiesRes.results) || [];
  let created = 0;
  for (const company of companies) {
    const entitlement = await ownerEntitlement(env.DB, company.owner_user_id);
    if (entitlement.plan !== 'max' || entitlement.status !== 'active') continue;
    const tasksRes = await env.DB.prepare('SELECT * FROM tasks WHERE company_id = ?').bind(company.id).all();
    const tasks = (tasksRes && tasksRes.results) || [];
    for (const task of tasks) {
      if (!task.assignee_user_id || !task.due_at || task.status === 'done') continue;
      const due = task.due_at.slice(0, 10);
      let title = '';
      let body = '';
      if (due === tomorrow) {
        title = 'Task due tomorrow: ' + task.title;
        body = 'Due ' + due + '.';
      } else if (due < today) {
        title = 'Task overdue: ' + task.title;
        body = 'Was due ' + due + '.';
      } else {
        continue;
      }
      const member = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(company.id, task.assignee_user_id).first();
      if (!member) continue;
      const existingRes = await env.DB.prepare('SELECT * FROM notifications WHERE company_id = ? AND user_id = ? AND kind = ? AND target_id = ?').bind(company.id, task.assignee_user_id, 'deadline', task.id).all();
      const existing = (existingRes && existingRes.results) || [];
      if (existing.some((n) => (n.created_at || '').slice(0, 10) === today)) continue;
      await notificationStmt(env.DB, company.id, task.assignee_user_id, 'deadline', title, body, task.id).run();
      created++;
    }
  }
  return { ok: true, created };
}
