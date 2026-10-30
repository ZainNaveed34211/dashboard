import { corsHeaders, fail } from './verify.js';
import { companyContext } from './companies.js';

const MAX_FILE_SIZE = 1 * 1024 * 1024;
const MAX_LINK_LENGTH = 2000;

const ALLOWED_TYPES = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  txt: ['text/plain'],
  csv: ['text/csv', 'application/csv', 'text/comma-separated-values'],
};

function nowIso() {
  return new Date().toISOString();
}

function logStmt(db, companyId, actorUserId, action, targetType, targetId) {
  return db.prepare('INSERT INTO activity_logs (id, company_id, actor_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), companyId, actorUserId, action, targetType, targetId, '', nowIso());
}

function safeFilename(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 200) return null;
  if (trimmed.includes('/') || trimmed.includes('\\')) return null;
  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('.')) return null;
  if (trimmed.includes('..')) return null;
  return trimmed;
}

function validExternalLink(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_LINK_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function documentView(row) {
  return { id: row.id, filename: row.filename, mime: row.mime, size: row.size, uploadedBy: row.uploaded_by, projectId: row.project_id || null, taskId: row.task_id || null, externalLink: row.external_link || null, createdAt: row.created_at };
}

export async function uploadDocument(env, session, companyId, request) {
  const ctx = await companyContext(env, session, companyId);
  let form;
  try {
    form = await request.formData();
  } catch {
    fail(400, 'Invalid request.');
  }
  const rawFile = form.get('file');
  const hasFile = rawFile && typeof rawFile.name === 'string' && typeof rawFile.size === 'number';
  const rawProjectId = form.get('projectId');
  const rawTaskId = form.get('taskId');
  const rawLink = form.get('externalLink');
  const rawName = form.get('filename');
  const projectId = typeof rawProjectId === 'string' && rawProjectId ? rawProjectId : null;
  const taskId = typeof rawTaskId === 'string' && rawTaskId ? rawTaskId : null;
  const externalLink = typeof rawLink === 'string' && rawLink ? rawLink : null;
  if (ctx.role === 'employee') {
    if (!taskId) fail(403, 'Employees can upload only as attachments to their own tasks.');
    const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').bind(taskId, companyId).first();
    if (!task || task.assignee_user_id !== ctx.membership.user_id) fail(403, 'Employees can upload only as attachments to their own tasks.');
  } else if (taskId) {
    const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ? AND company_id = ?').bind(taskId, companyId).first();
    if (!task) fail(400, 'Invalid request.');
  }
  if (projectId) {
    const project = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND company_id = ?').bind(projectId, companyId).first();
    if (!project) fail(400, 'Invalid request.');
  }
  if (externalLink && !validExternalLink(externalLink)) fail(400, 'Invalid request.');
  let filename = null;
  let mime = '';
  let size = 0;
  let content = null;
  if (hasFile) {
    filename = safeFilename(rawFile.name);
    if (!filename) fail(400, 'Invalid request.');
    const ext = filename.split('.').pop().toLowerCase();
    const allowed = ALLOWED_TYPES[ext];
    if (!allowed || !allowed.includes(rawFile.type)) fail(400, 'This file type is not allowed.');
    if (rawFile.size <= 0) fail(400, 'Invalid request.');
    if (rawFile.size > MAX_FILE_SIZE) fail(400, 'Files larger than 1 MB must be linked externally.');
    mime = rawFile.type;
    size = rawFile.size;
    content = new Uint8Array(await rawFile.arrayBuffer());
  } else {
    if (!externalLink) fail(400, 'Invalid request.');
    filename = safeFilename(rawName);
    if (!filename) fail(400, 'Invalid request.');
  }
  const id = crypto.randomUUID();
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO documents (id, company_id, project_id, task_id, r2_key, filename, mime, size, uploaded_by, created_at, content, external_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, companyId, projectId, taskId, 'd1:' + id, filename, mime, size, ctx.membership.user_id, now, content, externalLink || ''),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'document_uploaded', 'document', id),
  ]);
  return { ok: true, document: { id, filename, mime, size, uploadedBy: ctx.membership.user_id, projectId, taskId, externalLink, createdAt: now } };
}

export async function listDocuments(env, session, companyId) {
  await companyContext(env, session, companyId);
  const res = await env.DB.prepare('SELECT * FROM documents WHERE company_id = ? ORDER BY created_at DESC').bind(companyId).all();
  const rows = (res && res.results) || [];
  let totalSize = 0;
  const documents = rows.map((row) => {
    totalSize += row.size || 0;
    return documentView(row);
  });
  return { ok: true, documents, usage: { totalSize, count: documents.length } };
}

export async function downloadDocument(env, session, companyId, docId, origin) {
  await companyContext(env, session, companyId);
  const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?').bind(docId, companyId).first();
  if (!doc) fail(404, 'Not found.');
  if (!doc.content) fail(400, 'This document is linked externally, not stored here.');
  const bytes = doc.content instanceof ArrayBuffer ? new Uint8Array(doc.content) : doc.content;
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': doc.mime,
      'Content-Disposition': 'attachment; filename="' + doc.filename + '"',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders(origin),
    },
  });
}

export async function deleteDocument(env, session, companyId, docId) {
  const ctx = await companyContext(env, session, companyId);
  const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND company_id = ?').bind(docId, companyId).first();
  if (!doc) fail(404, 'Not found.');
  if (ctx.role === 'employee' && doc.uploaded_by !== ctx.membership.user_id) fail(403, 'Only the uploader, managers, admins and owners can delete documents.');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM documents WHERE id = ? AND company_id = ?').bind(docId, companyId),
    logStmt(env.DB, companyId, ctx.membership.user_id, 'document_deleted', 'document', docId),
  ]);
  return { ok: true, deleted: true };
}
