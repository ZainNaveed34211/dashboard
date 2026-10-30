import { validateNext } from './next';

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

export async function memberLoginStep1(email: string, password: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/member-login/step1', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function memberLoginSetup(loginToken: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/member-login/setup', { method: 'POST', body: JSON.stringify({ loginToken }) });
}

export async function memberLoginSetupVerify(loginToken: string, totpCode: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/member-login/setup-verify', { method: 'POST', body: JSON.stringify({ loginToken, totpCode }) });
}

export async function memberLoginVerify(loginToken: string, code: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/member-login/verify', { method: 'POST', body: JSON.stringify({ loginToken, code }) });
}

export async function claimInvite(token: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/auth/invite/claim', { method: 'POST', body: JSON.stringify({ token }) });
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

export function ownerLoginUrl(nextPath = '/'): string {
  const base = DASH_URL.replace(/\/$/, '');
  return LOGIN_URL + '/login/?next=' + encodeURIComponent(base + validateNext(nextPath));
}

export function companiesFrom(data: Record<string, unknown>): CompanyInfo[] {
  const list = data.companies;
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is CompanyInfo => !!c && typeof (c as CompanyInfo).id === 'string' && typeof (c as CompanyInfo).name === 'string');
}

export function friendlyError(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === 'string' && data.error ? data.error : fallback;
}

export interface MemberInfo {
  userId: string;
  email: string | null;
  role: string;
  departmentId: string | null;
  departmentName: string | null;
  status: string;
  joinedAt: string;
}

export interface DepartmentInfo {
  id: string;
  name: string;
  managerUserId: string | null;
}

export interface InvitationInfo {
  id: string;
  email: string;
  role: string;
  departmentId: string | null;
  state: string;
  expiresAt: string;
  createdAt: string;
}

export async function fetchCompanies(): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies', { method: 'GET' });
}

export async function fetchCompany(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId), { method: 'GET' });
}

export async function fetchMembers(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/members', { method: 'GET' });
}

export async function updateMemberRole(companyId: string, userId: string, role: string, departmentId: string | null): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/members/update', { method: 'POST', body: JSON.stringify({ userId, role, departmentId }) });
}

export async function removeMember(companyId: string, userId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/members/remove', { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function fetchInvitations(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/invitations', { method: 'GET' });
}

export async function createInvite(companyId: string, email: string, role: string, departmentId: string | null): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/invitations', { method: 'POST', body: JSON.stringify({ companyId, email, role, departmentId }) });
}

export async function revokeInvite(companyId: string, invitationId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/invitations/revoke', { method: 'POST', body: JSON.stringify({ invitationId }) });
}

export async function transferOwnership(companyId: string, newOwnerUserId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/transfer', { method: 'POST', body: JSON.stringify({ newOwnerUserId }) });
}

export async function fetchDepartments(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/departments', { method: 'GET' });
}

export async function createDepartment(companyId: string, name: string, managerUserId: string | null): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/departments', { method: 'POST', body: JSON.stringify({ name, managerUserId }) });
}

export async function updateDepartment(companyId: string, deptId: string, name: string, managerUserId: string | null): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/departments/update', { method: 'POST', body: JSON.stringify({ deptId, name, managerUserId }) });
}

export async function deleteDepartment(companyId: string, deptId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/departments/delete', { method: 'POST', body: JSON.stringify({ deptId }) });
}

export interface WidgetItem {
  id: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  config?: Record<string, unknown>;
}

export interface ActivityEntry {
  action: string;
  targetType: string;
  targetId: string;
  actorUserId: string;
  createdAt: string;
}

export async function fetchLayout(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/layouts?company_id=' + encodeURIComponent(companyId), { method: 'GET' });
}

export async function saveLayout(companyId: string, widgets: WidgetItem[]): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/layouts', { method: 'POST', body: JSON.stringify({ companyId, widgets }) });
}

export async function fetchCompanyDefaultLayout(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/layouts/company-default?company_id=' + encodeURIComponent(companyId), { method: 'GET' });
}

export async function setCompanyDefaultLayout(companyId: string, widgets: WidgetItem[]): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/layouts/company-default', { method: 'POST', body: JSON.stringify({ companyId, widgets }) });
}

export async function fetchActivity(companyId: string, limit = 20): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/activity?limit=' + limit, { method: 'GET' });
}

export async function createCompany(name: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies', { method: 'POST', body: JSON.stringify({ name }) });
}
