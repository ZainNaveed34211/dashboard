import { authenticateAssertion, checkRateLimit, corsHeaders, jsonResponse, readJson } from './verify.js';
import { claimInvite, createInvite, me, memberLoginSetup, memberLoginSetupVerify, memberLoginStep1, memberLoginVerify, sessionFromAssertion } from './auth.js';
import { deleteSession, getSession } from './sessions.js';
import { parseClaim, parseDepartment, parseDepartmentDelete, parseDepartmentUpdate, parseInvite, parseLoginStep, parseMemberRole, parseRemove, parseRevoke, parseSetupVerify, parseStep1, parseTransfer, parseVerifyStep } from './validate.js';
import { createDepartment, createCompany, deleteDepartment, getCompanyDetail, listActivity, listDepartments, listInvitations, listMembers, listMyCompanies, removeMember, revokeInvitation, transferOwnership, updateDepartment, updateMember } from './companies.js';
import { getCompanyDefaultLayout, getLayout, saveLayout, setCompanyDefaultLayout } from './layouts.js';

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7);
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
  const token = bearerToken(request);
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
    try {
      if (url.pathname === '/api/auth/session' && request.method === 'POST') {
        const auth = await authenticateAssertion(request, env);
        return jsonResponse(await sessionFromAssertion(env, auth), 200, origin);
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
        return jsonResponse(await memberLoginSetupVerify(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/member-login/verify' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseVerifyStep(body);
        return jsonResponse(await memberLoginVerify(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        const session = await dashboardSession(request, env);
        return jsonResponse(await me(env, session), 200, origin);
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        const token = bearerToken(request);
        await deleteSession(env.DB, token);
        return jsonResponse({ ok: true }, 200, origin);
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
};
