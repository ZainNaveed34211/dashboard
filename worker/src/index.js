import { authenticateAssertion, checkRateLimit, corsHeaders, jsonResponse, readJson } from './verify.js';
import { claimInvite, createInvite, me, memberLoginSetup, memberLoginSetupVerify, memberLoginStep1, memberLoginVerify, sessionFromAssertion } from './auth.js';
import { deleteSession, getSession } from './sessions.js';
import { parseAnnouncement, parseAnnouncementDelete, parseAnnouncementUpdate, parseAnalyticsEvent, parseAttendanceCheckIn, parseAttendanceCheckOut, parseClaim, parseComment, parseCommentDelete, parseCommentUpdate, parseDepartment, parseDepartmentDelete, parseDepartmentUpdate, parseDocumentDelete, parseEvent, parseEventDelete, parseEventUpdate, parseInvite, parseLoginStep, parseMemberRole, parseNotificationMarkAll, parseNotificationRead, parseProfileUpdate, parseProject, parseProjectDelete, parseProjectUpdate, parseRemove, parseRevoke, parseSetupVerify, parseStep1, parseTask, parseTaskDelete, parseTaskUpdate, parseTransfer, parseVerifyStep } from './validate.js';
import { createDepartment, createCompany, deleteDepartment, getCompanyDetail, listActivity, listDepartments, listInvitations, listMembers, listMyCompanies, removeMember, revokeInvitation, transferOwnership, updateDepartment, updateMember } from './companies.js';
import { getCompanyDefaultLayout, getLayout, saveLayout, setCompanyDefaultLayout } from './layouts.js';
import { createComment, createEvent, createProject, createTask, deleteComment, deleteEvent, deleteProject, deleteTask, getEvent, getProject, getTask, listComments, listEvents, listProjects, listTasks, updateComment, updateEvent, updateProject, updateTask } from './work.js';
import { deleteDocument, downloadDocument, listDocuments, uploadDocument } from './files.js';
import { checkIn, checkOut, createAnnouncement, deleteAnnouncement, getProfile, listAnnouncements, listAttendance, updateAnnouncement, updateProfile } from './team.js';
import { listNotifications, markAllNotificationsRead, markNotificationRead, runDeadlineReminders, unreadNotificationsCount } from './notifications.js';
import { getReport, trackAnalyticsEvent } from './reports.js';

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7);
}

function cookieToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const parts = cookie.split(';').map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith('kluzar_dashboard_session=')) return decodeURIComponent(part.slice('kluzar_dashboard_session='.length));
  }
  return '';
}

function sessionCookie(token) {
  return 'kluzar_dashboard_session=' + encodeURIComponent(token) + '; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=172800';
}

function clearSessionCookie() {
  return 'kluzar_dashboard_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0';
}

function pathParts(url) {
  return url.pathname.split('/').filter((part) => part.length > 0);
}

function pageParams(url) {
  const limitRaw = parseInt(url.searchParams.get('limit') || '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
  return { limit, offset };
}

async function dashboardSession(request, env) {
  const token = bearerToken(request) || cookieToken(request);
  const session = await getSession(env.DB, token);
  if (!session) {
    const err = new Error('Sign-in required.');
    err.status = 401;
    throw err;
  }
  return session;
}

async function companySession(request, env) {
  const session = await dashboardSession(request, env);
  if (session.purpose !== 'session') {
    const err = new Error('Sign-in required.');
    err.status = 401;
    throw err;
  }
  return session;
}

async function writeLimit(env, session) {
  const allowed = await checkRateLimit(env.DB, session.user_id, 'write', 600, 3600);
  if (!allowed) {
    const err = new Error('Too many requests. Try again later.');
    err.status = 429;
    throw err;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, origin);
      return jsonResponse({ ok: true, service: 'kluzar-dashboard-api', version: '1' }, 200, origin);
    }
    if (request.method === 'POST' && origin !== 'https://dash.kluzar.com') {
      return jsonResponse({ ok: false, error: 'Request not allowed.' }, 403, origin);
    }
    try {
      if (url.pathname === '/api/auth/session' && request.method === 'POST') {
        const auth = await authenticateAssertion(request, env);
        const data = await sessionFromAssertion(env, auth);
        return jsonResponse(data, 200, origin, { 'Set-Cookie': sessionCookie(data.sessionToken) });
      }
      if (url.pathname === '/api/invitations' && request.method === 'POST') {
        const session = await dashboardSession(request, env);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseInvite(body);
        const allowedWrite = await checkRateLimit(env.DB, session.user_id, 'write', 600, 3600);
        if (!allowedWrite) return jsonResponse({ ok: false, error: 'Too many requests. Try again later.' }, 429, origin);
        return jsonResponse(await createInvite(env, session, data), 200, origin);
      }
      if (url.pathname === '/api/auth/invite/claim' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseClaim(body);
        return jsonResponse(await claimInvite(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/member-login/step1' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseStep1(body);
        return jsonResponse(await memberLoginStep1(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/member-login/setup' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseLoginStep(body);
        return jsonResponse(await memberLoginSetup(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/member-login/setup-verify' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseSetupVerify(body);
        const result = await memberLoginSetupVerify(env, data);
        return jsonResponse(result, 200, origin, { 'Set-Cookie': sessionCookie(result.sessionToken) });
      }
      if (url.pathname === '/api/auth/member-login/verify' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseVerifyStep(body);
        const result = await memberLoginVerify(env, data);
        return jsonResponse(result, 200, origin, { 'Set-Cookie': sessionCookie(result.sessionToken) });
      }
      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const session = await dashboardSession(request, env);
        return jsonResponse(await me(env, session), 200, origin);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = bearerToken(request) || cookieToken(request);
        await deleteSession(env.DB, token);
        return jsonResponse({ ok: true }, 200, origin, { 'Set-Cookie': clearSessionCookie() });
      }
      if (url.pathname === '/api/layouts' && request.method === 'GET') {
        const session = await companySession(request, env);
        return jsonResponse(await getLayout(env, session, url.searchParams.get('company_id') || ''), 200, origin);
      }
      if (url.pathname === '/api/layouts' && request.method === 'POST') {
        const session = await companySession(request, env);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        return jsonResponse(await saveLayout(env, session, body), 200, origin);
      }
      if (url.pathname === '/api/layouts/company-default' && request.method === 'GET') {
        const session = await companySession(request, env);
        return jsonResponse(await getCompanyDefaultLayout(env, session, url.searchParams.get('company_id') || ''), 200, origin);
      }
      if (url.pathname === '/api/layouts/company-default' && request.method === 'POST') {
        const session = await companySession(request, env);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        return jsonResponse(await setCompanyDefaultLayout(env, session, body), 200, origin);
      }
      if (url.pathname === '/api/profile' && request.method === 'GET') {
        const session = await dashboardSession(request, env);
        return jsonResponse(await getProfile(env, session), 200, origin);
      }
      if (url.pathname === '/api/notifications' && request.method === 'GET') {
        const session = await companySession(request, env);
        return jsonResponse(await listNotifications(env, session, url.searchParams.get('company_id') || '', pageParams(url)), 200, origin);
      }
      if (url.pathname === '/api/notifications/unread-count' && request.method === 'GET') {
        const session = await companySession(request, env);
        return jsonResponse(await unreadNotificationsCount(env, session, url.searchParams.get('company_id') || ''), 200, origin);
      }
      if (url.pathname === '/api/notifications/read' && request.method === 'POST') {
        const session = await companySession(request, env);
        await writeLimit(env, session);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseNotificationRead(body);
        return jsonResponse(await markNotificationRead(env, session, data.companyId, data.notificationId), 200, origin);
      }
      if (url.pathname === '/api/notifications/mark-all-read' && request.method === 'POST') {
        const session = await companySession(request, env);
        await writeLimit(env, session);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseNotificationMarkAll(body);
        return jsonResponse(await markAllNotificationsRead(env, session, data.companyId), 200, origin);
      }
      if (url.pathname === '/api/analytics/events' && request.method === 'POST') {
        const session = await companySession(request, env);
        await writeLimit(env, session);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseAnalyticsEvent(body);
        return jsonResponse(await trackAnalyticsEvent(env, session, data), 200, origin);
      }
      if (url.pathname === '/api/profile/update' && request.method === 'POST') {
        const session = await dashboardSession(request, env);
        await writeLimit(env, session);
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseProfileUpdate(body);
        return jsonResponse(await updateProfile(env, session, data), 200, origin);
      }
      const parts = pathParts(url);
      if (parts[0] === 'api' && parts[1] === 'companies') {
        const companyId = parts[2] || '';
        if (parts.length === 2 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listMyCompanies(env, session), 200, origin);
        }
        if (parts.length === 2 && request.method === 'POST') {
          const session = await companySession(request, env);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          return jsonResponse(await createCompany(env, session, body), 200, origin);
        }
        if (parts.length === 3 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await getCompanyDetail(env, session, companyId), 200, origin);
        }
        if (parts[3] === 'reports' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await getReport(env, session, companyId, { start: url.searchParams.get('start') || '', end: url.searchParams.get('end') || '' }), 200, origin);
        }
        if (parts[3] === 'activity' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          const limitRaw = parseInt(url.searchParams.get('limit') || '20', 10);
          const offsetRaw = parseInt(url.searchParams.get('offset') || '0', 10);
          const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;
          const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
          return jsonResponse(await listActivity(env, session, companyId, { limit, offset }), 200, origin);
        }
        if (parts[3] === 'members' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listMembers(env, session, companyId, pageParams(url)), 200, origin);
        }
        if (parts[3] === 'members' && parts.length === 5 && parts[4] === 'remove' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseRemove(body);
          return jsonResponse(await removeMember(env, session, companyId, data.userId), 200, origin);
        }
        if (parts[3] === 'members' && parts.length === 5 && parts[4] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseMemberRole(body);
          return jsonResponse(await updateMember(env, session, companyId, data.userId, data), 200, origin);
        }
        if (parts[3] === 'invitations' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listInvitations(env, session, companyId, pageParams(url)), 200, origin);
        }
        if (parts[3] === 'invitations' && parts.length === 5 && parts[4] === 'revoke' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseRevoke(body);
          return jsonResponse(await revokeInvitation(env, session, companyId, data.invitationId), 200, origin);
        }
        if (parts[3] === 'transfer' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseTransfer(body);
          return jsonResponse(await transferOwnership(env, session, companyId, data.newOwnerUserId), 200, origin);
        }
        if (parts[3] === 'departments' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listDepartments(env, session, companyId, pageParams(url)), 200, origin);
        }
        if (parts[3] === 'departments' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseDepartment(body);
          return jsonResponse(await createDepartment(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'departments' && parts.length === 5 && parts[4] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseDepartmentUpdate(body);
          return jsonResponse(await updateDepartment(env, session, companyId, data.deptId, data), 200, origin);
        }
        if (parts[3] === 'departments' && parts.length === 5 && parts[4] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseDepartmentDelete(body);
          return jsonResponse(await deleteDepartment(env, session, companyId, data.deptId), 200, origin);
        }
        if (parts[3] === 'projects' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listProjects(env, session, companyId, { status: url.searchParams.get('status') || '', departmentId: url.searchParams.get('department_id') || '', ...pageParams(url) }), 200, origin);
        }
        if (parts[3] === 'projects' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseProject(body);
          return jsonResponse(await createProject(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'projects' && parts.length === 5 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await getProject(env, session, companyId, parts[4]), 200, origin);
        }
        if (parts[3] === 'projects' && parts.length === 6 && parts[5] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseProjectUpdate(body);
          return jsonResponse(await updateProject(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'projects' && parts.length === 6 && parts[5] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseProjectDelete(body);
          return jsonResponse(await deleteProject(env, session, companyId, data.projectId), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listTasks(env, session, companyId, { status: url.searchParams.get('status') || '', priority: url.searchParams.get('priority') || '', assigneeUserId: url.searchParams.get('assignee') || '', projectId: url.searchParams.get('project') || '', departmentId: url.searchParams.get('department') || '', category: url.searchParams.get('category') || '', ...pageParams(url) }), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseTask(body);
          return jsonResponse(await createTask(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 5 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await getTask(env, session, companyId, parts[4]), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 6 && parts[5] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseTaskUpdate(body);
          return jsonResponse(await updateTask(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 6 && parts[5] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseTaskDelete(body);
          return jsonResponse(await deleteTask(env, session, companyId, data.taskId), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 6 && parts[5] === 'comments' && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listComments(env, session, companyId, parts[4]), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 6 && parts[5] === 'comments' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseComment(body);
          return jsonResponse(await createComment(env, session, companyId, parts[4], data), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 8 && parts[5] === 'comments' && parts[7] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseCommentUpdate(body);
          return jsonResponse(await updateComment(env, session, companyId, parts[4], data), 200, origin);
        }
        if (parts[3] === 'tasks' && parts.length === 8 && parts[5] === 'comments' && parts[7] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseCommentDelete(body);
          return jsonResponse(await deleteComment(env, session, companyId, parts[4], data.commentId), 200, origin);
        }
        if (parts[3] === 'events' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listEvents(env, session, companyId, { visibility: url.searchParams.get('visibility') || '', start: url.searchParams.get('start') || '', end: url.searchParams.get('end') || '', ...pageParams(url) }), 200, origin);
        }
        if (parts[3] === 'events' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseEvent(body);
          return jsonResponse(await createEvent(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'events' && parts.length === 5 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await getEvent(env, session, companyId, parts[4]), 200, origin);
        }
        if (parts[3] === 'events' && parts.length === 6 && parts[5] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseEventUpdate(body);
          return jsonResponse(await updateEvent(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'events' && parts.length === 6 && parts[5] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseEventDelete(body);
          return jsonResponse(await deleteEvent(env, session, companyId, data.eventId), 200, origin);
        }
        if (parts[3] === 'documents' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listDocuments(env, session, companyId), 200, origin);
        }
        if (parts[3] === 'documents' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          return jsonResponse(await uploadDocument(env, session, companyId, request), 200, origin);
        }
        if (parts[3] === 'documents' && parts.length === 6 && parts[5] === 'download' && request.method === 'GET') {
          const session = await companySession(request, env);
          return await downloadDocument(env, session, companyId, parts[4], origin);
        }
        if (parts[3] === 'documents' && parts.length === 6 && parts[5] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseDocumentDelete(body);
          return jsonResponse(await deleteDocument(env, session, companyId, data.documentId), 200, origin);
        }
        if (parts[3] === 'announcements' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listAnnouncements(env, session, companyId, pageParams(url)), 200, origin);
        }
        if (parts[3] === 'announcements' && parts.length === 4 && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseAnnouncement(body);
          return jsonResponse(await createAnnouncement(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'announcements' && parts.length === 6 && parts[5] === 'update' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseAnnouncementUpdate(body);
          return jsonResponse(await updateAnnouncement(env, session, companyId, data.announcementId, data), 200, origin);
        }
        if (parts[3] === 'announcements' && parts.length === 6 && parts[5] === 'delete' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseAnnouncementDelete(body);
          return jsonResponse(await deleteAnnouncement(env, session, companyId, data.announcementId), 200, origin);
        }
        if (parts[3] === 'attendance' && parts.length === 4 && request.method === 'GET') {
          const session = await companySession(request, env);
          return jsonResponse(await listAttendance(env, session, companyId, { userId: url.searchParams.get('user_id') || '', date: url.searchParams.get('date') || '', ...pageParams(url) }), 200, origin);
        }
        if (parts[3] === 'attendance' && parts.length === 5 && parts[4] === 'check-in' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseAttendanceCheckIn(body);
          return jsonResponse(await checkIn(env, session, companyId, data), 200, origin);
        }
        if (parts[3] === 'attendance' && parts.length === 5 && parts[4] === 'check-out' && request.method === 'POST') {
          const session = await companySession(request, env);
          await writeLimit(env, session);
          const body = await readJson(request);
          if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
          const data = parseAttendanceCheckOut(body);
          return jsonResponse(await checkOut(env, session, companyId, data), 200, origin);
        }
        return jsonResponse({ ok: false, error: 'Not found.' }, 404, origin);
      }
      return jsonResponse({ ok: false, error: 'Not found.' }, 404, origin);
    } catch (e) {
      if (e.status) {
        const body = { ok: false, error: e.message };
        if (e.data) Object.assign(body, e.data);
        return jsonResponse(body, e.status, origin);
      }
      return jsonResponse({ ok: false, error: 'Request failed.' }, 500, origin);
    }
  },
  async scheduled(event, env) {
    await runDeadlineReminders(env, new Date());
  },
};
