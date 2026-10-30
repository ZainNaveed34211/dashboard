export const DASH_API = 'https://dashboard-api.kluzar.com';
export const ACCOUNT_API = 'https://account-api.kluzar.com';
export const LOGIN_URL = 'https://accounts.kluzar.com';
export const PAYMENTS_URL = 'https://payments.kluzar.com';
export const SUPPORT_URL = 'https://support.kluzar.com/';
export const DASH_URL = 'https://dash.kluzar.com/';

export interface CompanyInfo {
  id: string;
  name: string;
  role: string;
}

export interface SessionData {
  sessionToken: string;
  userType: string;
  companies: CompanyInfo[];
}

export interface MeData {
  userType: string;
  companies: CompanyInfo[];
}

let dashboardToken: string | null = null;

export function setDashboardToken(token: string | null): void {
  dashboardToken = token;
}

export function getDashboardToken(): string | null {
  return dashboardToken;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json();
    if (data && typeof data === 'object') return data as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export async function apiFetch(path: string, init: RequestInit): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (dashboardToken) headers.Authorization = 'Bearer ' + dashboardToken;
  const res = await fetch(DASH_API + path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  return { status: res.status, data: await readBody(res) };
}

export async function fetchAccountSession(): Promise<{ authenticated: boolean; csrfToken: string; plan: string; status: string }> {
  try {
    const res = await fetch(ACCOUNT_API + '/auth/session', { credentials: 'include' });
    const data = await readBody(res);
    const entitlement = (data.entitlement || {}) as Record<string, unknown>;
    return {
      authenticated: data.authenticated === true,
      csrfToken: typeof data.csrfToken === 'string' ? data.csrfToken : '',
      plan: typeof entitlement.plan === 'string' ? entitlement.plan : 'free',
      status: typeof entitlement.status === 'string' ? entitlement.status : '',
    };
  } catch {
    return { authenticated: false, csrfToken: '', plan: 'free', status: '' };
  }
}

export async function requestAssertion(csrfToken: string): Promise<string | null> {
  try {
    const res = await fetch(ACCOUNT_API + '/auth/dash-assertion', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: '{}',
    });
    const data = await readBody(res);
    if (!res.ok || typeof data.assertion !== 'string') return null;
    return data.assertion as string;
  } catch {
    return null;
  }
}

export async function ownerSession(): Promise<{ status: number; data: Record<string, unknown> }> {
  const session = await fetchAccountSession();
  if (!session.authenticated) return { status: 401, data: {} };
  const assertion = await requestAssertion(session.csrfToken);
  if (!assertion) return { status: 401, data: {} };
  const res = await fetch(DASH_API + '/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + assertion },
  });
  return { status: res.status, data: await readBody(res) };
}

export async function fetchMe(): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/me', { method: 'GET' });
}

export async function memberLogin(email: string, password: string, totp: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/member-login', { method: 'POST', body: JSON.stringify({ email, password, totp: totp || null }) });
}

export async function claimInvite(token: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/invite/claim', { method: 'POST', body: JSON.stringify({ token }) });
}

export async function mfaSetup(setupToken: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/mfa/setup', { method: 'POST', body: JSON.stringify({ setupToken }) });
}

export async function mfaVerify(setupToken: string, code: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ setupToken, code }) });
}

export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
  }
  setDashboardToken(null);
}

export function premiumUrl(): string {
  return PAYMENTS_URL + '/?return=' + encodeURIComponent(DASH_URL);
}

export function ownerLoginUrl(): string {
  return LOGIN_URL + '/login/?next=' + encodeURIComponent(DASH_URL);
}

export function companiesFrom(data: Record<string, unknown>): CompanyInfo[] {
  const list = data.companies;
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is CompanyInfo => !!c && typeof (c as CompanyInfo).id === 'string' && typeof (c as CompanyInfo).name === 'string');
}
