import { z } from 'zod';
import { checkRateLimit, fail } from './verify.js';
import { ownerEntitlement } from './auth.js';

function nowIso() {
  return new Date().toISOString();
}

function inviteState(invite) {
  if (invite.used_at) return 'used';
  if (invite.revoked_at) return 'revoked';
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now()) return 'expired';
  return 'pending';
}

function logStmt(db, companyId, actorUserId, action, targetType, targetId) {
  return db.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), companyId, actorUserId, action, targetType, targetId, '', nowIso());
}

export async function companyContext(env, session, companyId) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(companyId).first();
  const membership = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, session.user_id).first();
  if (!company || !membership) fail(404, 'Not found.');
  const entitlement = await ownerEntitlement(env.DB, company.owner_user_id);
  if (entitlement.plan !== 'max' || entitlement.status !== 'active') fail(403, 'A Max subscription is required.');
  return { company, membership, role: membership.role };
}

export async function listMyCompanies(env, session) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const res = await env.DB.prepare("SELECT * FROM company_members WHERE user_id = ? AND status = 'active' ORDER BY joined_at ASC").bind(session.user_id).all();
  const memberships = (res && res.results) || [];
  const companies = [];
  for (const membership of memberships) {
    const company = await env.DB.prepare('SELECT * FROM companies WHERE id = ?').bind(membership.company_id).first();
    if (!company) continue;
    const entitlement = await ownerEntitlement(env.DB, company.owner_user_id);
    if (entitlement.plan !== 'max' || entitlement.status !== 'active') continue;
    companies.push({ id: company.id, name: company.name, role: membership.role, departmentId: membership.department_id || null });
  }
  return { ok: true, companies };
}

export async function getCompanyDetail(env, session, companyId) {
  const ctx = await companyContext(env, session, companyId);
  return { ok: true, company: { id: ctx.company.id, name: ctx.company.name, ownerUserId: ctx.company.owner_user_id, role: ctx.role, createdAt: ctx.company.created_at } };
}

export async function listMembers(env, session, companyId, page) {
  const ctx = await companyContext(env, session, companyId);
  const res = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND status = 'active' ORDER BY joined_at ASC").bind(companyId).all();
  const all = (res && res.results) || [];
  let visible = all;
  if (ctx.role === 'manager') {
    visible = all.filter((m) => m.user_id === ctx.membership.user_id || (ctx.membership.department_id && m.department_id === ctx.membership.department_id));
  } else if (ctx.role === 'employee') {
    visible = all.filter((m) => m.user_id === ctx.membership.user_id);
  }
  const deptRes = await env.DB.prepare('SELECT * FROM departments WHERE company_id = ? ORDER BY name ASC').bind(companyId).all();
  const deptNames = new Map(((deptRes && deptRes.results) || []).map((d) => [d.id, d.name]));
  const members = [];
  for (const row of visible.slice(page.offset, page.offset + page.limit)) {
    const user = await env.DB.prepare('SELECT * FROM dashboard_users WHERE id = ?').bind(row.user_id).first();
    members.push({ userId: row.user_id, email: user ? user.email : null, role: row.role, departmentId: row.department_id || null, departmentName: row.department_id ? (deptNames.get(row.department_id) || null) : null, status: row.status, joinedAt: row.joined_at });
  }
  return { ok: true, members, total: visible.length };
}

export async function updateMember(env, session, companyId, targetUserId, data) {
  const ctx = await companyContext(env, session, companyId);
  const target = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, targetUserId).first();
  if (!target) fail(404, 'Not found.');
  if (data.role === undefined && data.departmentId === undefined) fail(400, 'Invalid request.');
  if (target.user_id === ctx.membership.user_id) fail(403, 'Members cannot change their own role or department.');
  const newRole = data.role !== undefined ? data.role : target.role;
  const newDept = data.departmentId !== undefined ? data.departmentId : target.department_id;
  if (newDept) {
    const dept = await env.DB.prepare('SELECT * FROM departments WHERE id = ? AND company_id = ?').bind(newDept, companyId).first();
    if (!dept) fail(400, 'Invalid request.');
  }
  if (ctx.role === 'owner') {
    if (target.user_id === ctx.company.owner_user_id && newRole !== 'owner') fail(403, 'Transfer ownership before changing the company owner role.');
    if (target.role === 'owner' && newRole !== 'owner') {
      const owners = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND role = 'owner' AND status = 'active'").bind(companyId).all();
      if (((owners && owners.results) || []).length <= 1) fail(403, 'The sole owner cannot be demoted. Transfer ownership first.');
    }
  } else if (ctx.role === 'admin') {
    if (target.role === 'owner' || target.role === 'admin') fail(403, 'Admins cannot change owners or other admins.');
    if (newRole === 'owner' || newRole === 'admin') fail(403, 'Admins cannot grant owner or admin roles.');
  } else {
    fail(403, 'Only owners and admins can change member roles.');
  }
  const update = env.DB.prepare('UPDATE company_members SET role = ?, department_id = ? WHERE company_id = ? AND user_id = ?').bind(newRole, newDept || null, companyId, targetUserId);
  await env.DB.batch([update, logStmt(env.DB, companyId, ctx.membership.user_id, 'role_changed', 'member', targetUserId)]);
  return { ok: true, member: { userId: targetUserId, role: newRole, departmentId: newDept || null } };
}

export async function removeMember(env, session, companyId, targetUserId) {
  const ctx = await companyContext(env, session, companyId);
  const target = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, targetUserId).first();
  if (!target) fail(404, 'Not found.');
  if (ctx.role === 'owner') {
    if (target.user_id === ctx.membership.user_id) {
      const owners = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND role = 'owner' AND status = 'active'").bind(companyId).all();
      if (((owners && owners.results) || []).length <= 1) fail(403, 'The sole owner cannot remove themselves. Transfer ownership first.');
    }
  } else if (ctx.role === 'admin') {
    if (target.role === 'owner' || target.role === 'admin') fail(403, 'Admins cannot remove owners or other admins.');
  } else {
    fail(403, 'Only owners and admins can remove members.');
  }
  const update = env.DB.prepare('UPDATE company_members SET status = ? WHERE company_id = ? AND user_id = ?').bind('removed', companyId, targetUserId);
  const sessions = env.DB.prepare('DELETE FROM dashboard_sessions WHERE user_id = ?').bind(targetUserId);
  await env.DB.batch([update, sessions, logStmt(env.DB, companyId, ctx.membership.user_id, 'member_removed', 'member', targetUserId)]);
  return { ok: true, removed: true };
}

export async function listInvitations(env, session, companyId, page) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can view invitations.');
  const res = await env.DB.prepare('SELECT * FROM invitations WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  const all = (res && res.results) || [];
  const invitations = all.slice(page.offset, page.offset + page.limit).map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, departmentId: invite.department_id || null, state: inviteState(invite), expiresAt: invite.expires_at, createdAt: invite.created_at }));
  return { ok: true, invitations, total: all.length };
}

export async function revokeInvitation(env, session, companyId, invitationId) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can revoke invitations.');
  const invite = await env.DB.prepare('SELECT * FROM invitations WHERE id = ? AND company_id = ?').bind(invitationId, companyId).first();
  if (!invite) fail(404, 'Not found.');
  if (invite.used_at || invite.revoked_at || (invite.expires_at && new Date(invite.expires_at).getTime() <= Date.now())) fail(400, 'This invitation cannot be revoked.');
  const update = env.DB.prepare('UPDATE invitations SET revoked_at = ? WHERE id = ? AND company_id = ?').bind(nowIso(), invitationId, companyId);
  await env.DB.batch([update, logStmt(env.DB, companyId, ctx.membership.user_id, 'invite_revoked', 'invitation', invitationId)]);
  return { ok: true, revoked: true };
}

export async function transferOwnership(env, session, companyId, newOwnerUserId) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.membership.user_id !== ctx.company.owner_user_id) fail(403, 'Only the company owner can transfer ownership.');
  if (newOwnerUserId === ctx.company.owner_user_id) fail(400, 'Invalid request.');
  const target = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, newOwnerUserId).first();
  if (!target) fail(404, 'Not found.');
  if (target.role !== 'admin') fail(400, 'The new owner must be an Admin of the same company.');
  const promote = env.DB.prepare('UPDATE company_members SET role = ? WHERE company_id = ? AND user_id = ?').bind('owner', companyId, newOwnerUserId);
  const demote = env.DB.prepare('UPDATE company_members SET role = ? WHERE company_id = ? AND user_id = ?').bind('admin', companyId, ctx.membership.user_id);
  const ownerUpdate = env.DB.prepare('UPDATE companies SET owner_user_id = ?, updated_at = ? WHERE id = ?').bind(newOwnerUserId, nowIso(), companyId);
  await env.DB.batch([promote, demote, ownerUpdate, logStmt(env.DB, companyId, ctx.membership.user_id, 'ownership_transferred', 'company', companyId)]);
  return { ok: true, newOwnerUserId };
}

export async function listDepartments(env, session, companyId, page) {
  const ctx = await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM departments WHERE company_id = ? ORDER BY name ASC').bind(companyId).all();
  let all = (res && res.results) || [];
  if (ctx.role === 'manager' || ctx.role === 'employee') {
    all = all.filter((d) => ctx.membership.department_id && d.id === ctx.membership.department_id);
  }
  const departments = all.slice(page.offset, page.offset + page.limit).map((d) => ({ id: d.id, name: d.name, managerUserId: d.manager_user_id || null }));
  return { ok: true, departments, total: all.length };
}

async function validManager(env, companyId, managerUserId) {
  if (!managerUserId) return;
  const member = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND user_id = ? AND status = 'active'").bind(companyId, managerUserId).first();
  if (!member) fail(400, 'Invalid request.');
}

export async function createDepartment(env, session, companyId, data) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can manage departments.');
  const name = data.name.trim();
  if (!name) fail(400, 'Invalid request.');
  await validManager(env, companyId, data.managerUserId || null);
  const clash = await env.DB.prepare('SELECT * FROM departments WHERE company_id = ? AND name = ?').bind(companyId, name).first();
  if (clash) fail(400, 'A department with this name already exists.');
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO departments (id, company_id, name, manager_user_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, companyId, name, data.managerUserId || null, nowIso()),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'department_created', 'department', id),
  ]);
  return { ok: true, department: { id, name, managerUserId: data.managerUserId || null } };
}

export async function updateDepartment(env, session, companyId, deptId, data) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can manage departments.');
  const dept = await env.DB.prepare('SELECT * FROM departments WHERE id = ? AND company_id = ?').bind(deptId, companyId).first();
  if (!dept) fail(404, 'Not found.');
  if (data.name === undefined && data.managerUserId === undefined) fail(400, 'Invalid request.');
  const name = data.name !== undefined ? data.name.trim() : dept.name;
  if (!name) fail(400, 'Invalid request.');
  if (data.name !== undefined) {
    const clash = await env.DB.prepare('SELECT * FROM departments WHERE company_id = ? AND name = ?').bind(companyId, name).first();
    if (clash && clash.id !== deptId) fail(400, 'A department with this name already exists.');
  }
  const managerUserId = data.managerUserId !== undefined ? data.managerUserId : dept.manager_user_id;
  await validManager(env, companyId, managerUserId || null);
  const update = env.DB.prepare('UPDATE departments SET name = ?, manager_user_id = ? WHERE id = ? AND company_id = ?').bind(name, managerUserId || null, deptId, companyId);
  await env.DB.batch([update, logStmt(env.DB, companyId, ctx.membership.user_id, 'department_updated', 'department', deptId)]);
  return { ok: true, department: { id: deptId, name, managerUserId: managerUserId || null } };
}

export async function deleteDepartment(env, session, companyId, deptId) {
  const ctx = await companyContext(env, session, companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can manage departments.');
  const dept = await env.DB.prepare('SELECT * FROM departments WHERE id = ? AND company_id = ?').bind(deptId, companyId).first();
  if (!dept) fail(404, 'Not found.');
  const members = await env.DB.prepare("SELECT * FROM company_members WHERE company_id = ? AND department_id = ? AND status = 'active'").bind(companyId, deptId).all();
  const projects = await env.DB.prepare('SELECT * FROM projects WHERE company_id = ? AND department_id = ?').bind(companyId, deptId).all();
  const memberCount = ((members && members.results) || []).length;
  const projectCount = ((projects && projects.results) || []).length;
  if (memberCount > 0 || projectCount > 0) {
    const parts = [];
    if (memberCount > 0) parts.push('members');
    if (projectCount > 0) parts.push('projects');
    fail(400, 'This department cannot be deleted because it is still used by ' + parts.join(' and ') + '. Move or remove those first.');
  }
  const del = env.DB.prepare('DELETE FROM departments WHERE id = ? AND company_id = ?').bind(deptId, companyId);
  await env.DB.batch([del, logStmt(env.DB, companyId, ctx.membership.user_id, 'department_deleted', 'department', deptId)]);
  return { ok: true, deleted: true };
}

export async function listActivity(env, session, companyId, page) {
  await companyContext(env, session, companyId);
  const limit = page && Number.isFinite(page.limit) ? Math.min(50, Math.max(1, page.limit)) : 20;
  const offset = page && Number.isFinite(page.offset) ? Math.max(0, page.offset) : 0;
  const res = await env.DB.prepare('SELECT * FROM activity_logs WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  const all = (res && res.results) || [];
  const rows = all.slice(offset, offset + limit).map((row) => ({ action: row.action, targetType: row.target_type, targetId: row.target_id, actorUserId: row.actor_user_id, createdAt: row.created_at }));
  return { ok: true, activity: rows, total: all.length };
}

const companyCreateSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function createCompany(env, session, data) {
  if (!session || session.purpose !== 'session') fail(401, 'Sign-in required.');
  const parsed = companyCreateSchema.safeParse(data);
  if (!parsed.success) fail(400, 'Invalid request.');
  const name = parsed.data.name.trim();
  if (!name) fail(400, 'Invalid request.');
  const entitlement = await ownerEntitlement(env.DB, session.user_id);
  if (entitlement.plan !== 'max' || entitlement.status !== 'active') fail(403, 'A Max subscription is required.');
  const allowed = await checkRateLimit(env.DB, session.user_id, 'write', 600, 3600);
  if (!allowed) fail(429, 'Too many requests. Try again later.');
  const now = nowIso();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO companies (id, owner_user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(id, session.user_id, name, now, now),
    env.DB.prepare("INSERT INTO company_members (company_id, user_id, role, department_id, status, invited_by, joined_at) VALUES (?, ?, 'owner', NULL, 'active', NULL, ?)").bind(id, session.user_id, now),
    logStmt(env.DB, id, session.user_id, 'company_created', 'company', id),
  ]);
  return { ok: true, company: { id, name, ownerUserId: session.user_id, createdAt: now } };
}
