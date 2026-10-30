import { authenticateAssertion, checkRateLimit, corsHeaders, jsonResponse, readJson } from './verify.js';
import { claimInvite, createInvite, me, memberLogin, mfaSetup, mfaVerify, sessionFromAssertion } from './auth.js';
import { deleteSession, getSession } from './sessions.js';
import { parseClaim, parseInvite, parseLogin, parseSetup, parseVerify } from './validate.js';

function bearerToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice(7);
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
      if (url.pathname === '/api/auth/mfa/setup' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseSetup(body);
        return jsonResponse(await mfaSetup(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/mfa/verify' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseVerify(body);
        return jsonResponse(await mfaVerify(env, data), 200, origin);
      }
      if (url.pathname === '/api/auth/member-login' && request.method === 'POST') {
        const body = await readJson(request);
        if (!body) return jsonResponse({ ok: false, error: 'Invalid request.' }, 400, origin);
        const data = parseLogin(body);
        return jsonResponse(await memberLogin(env, data), 200, origin);
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
