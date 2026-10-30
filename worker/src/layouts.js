import { z } from 'zod';
import { checkRateLimit, fail } from './verify.js';
import { companyContext } from './companies.js';

export const WIDGET_IDS = ['overview', 'members-chart', 'team', 'departments', 'activity'];

export const BUILTIN_WIDGETS = [
  { id: 'overview', x: 0, y: 0, w: 12, h: 4 },
  { id: 'members-chart', x: 0, y: 4, w: 6, h: 4 },
  { id: 'team', x: 6, y: 4, w: 6, h: 4 },
  { id: 'departments', x: 0, y: 8, w: 6, h: 4 },
  { id: 'activity', x: 6, y: 8, w: 6, h: 4 },
];

const widgetSchema = z.object({
  id: z.enum(WIDGET_IDS),
  x: z.number().int().min(0).max(11).optional(),
  y: z.number().int().min(0).max(100).optional(),
  w: z.number().int().min(1).max(12).optional(),
  h: z.number().int().min(1).max(12).optional(),
  config: z.object({
    title: z.string().max(100).optional(),
    period: z.enum(['7d', '30d', '90d']).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }).optional(),
});

const layoutBodySchema = z.object({
  companyId: z.string().min(1).max(200),
  widgets: z.array(widgetSchema).max(20),
});

function nowIso() {
  return new Date().toISOString();
}

function logStmt(db, companyId, actorUserId, action, targetType, targetId) {
  return db.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), companyId, actorUserId, action, targetType, targetId, '', nowIso());
}

function parseLayoutBody(body) {
  const parsed = layoutBodySchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

async function writeLimit(db, userId) {
  const allowed = await checkRateLimit(db, userId, 'write', 600, 3600);
  if (!allowed) fail(429, 'Too many requests. Try again later.');
}

async function personalRow(db, companyId, userId) {
  return db.prepare('SELECT * FROM dashboard_layouts WHERE company_id = ? AND user_id = ? AND is_company_default = 0').bind(companyId, userId).first();
}

async function defaultRow(db, companyId) {
  return db.prepare('SELECT * FROM dashboard_layouts WHERE company_id = ? AND is_company_default = 1').bind(companyId).first();
}

function storedWidgets(row) {
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.widgets);
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function getLayout(env, session, companyId) {
  await companyContext(env, session, companyId);
  const personal = await personalRow(env.DB, companyId, session.user_id);
  const personalWidgets = storedWidgets(personal);
  if (personalWidgets !== null) return { ok: true, layout: { widgets: personalWidgets, source: 'personal' } };
  const def = await defaultRow(env.DB, companyId);
  const defaultWidgets = storedWidgets(def);
  if (defaultWidgets !== null) return { ok: true, layout: { widgets: defaultWidgets, source: 'company-default' } };
  return { ok: true, layout: { widgets: BUILTIN_WIDGETS, source: 'built-in' } };
}

export async function saveLayout(env, session, body) {
  const data = parseLayoutBody(body);
  await companyContext(env, session, data.companyId);
  await writeLimit(env.DB, session.user_id);
  const now = nowIso();
  const widgetsJson = JSON.stringify(data.widgets);
  const existing = await personalRow(env.DB, data.companyId, session.user_id);
  if (existing) {
    await env.DB.prepare('UPDATE dashboard_layouts SET widgets = ?, updated_at = ? WHERE id = ? AND company_id = ?').bind(widgetsJson, now, existing.id, data.companyId).run();
  } else {
    await env.DB.prepare('INSERT INTO dashboard_layouts (id, company_id, user_id, is_company_default, widgets, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), data.companyId, session.user_id, 0, widgetsJson, now).run();
  }
  return { ok: true, layout: { widgets: data.widgets, source: 'personal' } };
}

export async function getCompanyDefaultLayout(env, session, companyId) {
  await companyContext(env, session, companyId);
  const def = await defaultRow(env.DB, companyId);
  const widgets = storedWidgets(def);
  if (widgets !== null) return { ok: true, layout: { widgets, source: 'company-default' } };
  return { ok: true, layout: { widgets: BUILTIN_WIDGETS, source: 'built-in' } };
}

export async function setCompanyDefaultLayout(env, session, body) {
  const data = parseLayoutBody(body);
  const ctx = await companyContext(env, session, data.companyId);
  if (ctx.role !== 'owner' && ctx.role !== 'admin') fail(403, 'Only owners and admins can set the company default layout.');
  await writeLimit(env.DB, session.user_id);
  const now = nowIso();
  const widgetsJson = JSON.stringify(data.widgets);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM dashboard_layouts WHERE company_id = ? AND is_company_default = 1').bind(data.companyId),
    env.DB.prepare('INSERT INTO dashboard_layouts (id, company_id, user_id, is_company_default, widgets, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), data.companyId, session.user_id, 1, widgetsJson, now),
    logStmt(env.DB, data.companyId, session.user_id, 'layout_default_updated', 'company', data.companyId),
  ]);
  return { ok: true, layout: { widgets: data.widgets, source: 'company-default' } };
}
