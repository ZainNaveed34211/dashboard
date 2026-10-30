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
  const res = await fetch(DASH_API + path, { ...init, credentials: 'include', headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
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

export async function ownerSession(): Promise<{ status: number; data: Record<string, unknown>; stage: string }> {
  const session = await fetchAccountSession();
  if (!session.authenticated) return { status: 401, data: {}, stage: 'account' };
  const assertion = await requestAssertion(session.csrfToken);
  if (!assertion) return { status: 401, data: {}, stage: 'assertion' };
  const res = await fetch(DASH_API + '/api/auth/session', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + assertion },
  });
  return { status: res.status, data: await readBody(res), stage: 'dashboard' };
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
  firstName?: string | null;
  lastName?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
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

export interface ProjectInfo {
  id: string;
  name: string;
  description: string;
  departmentId: string | null;
  status: string;
  ownerUserId: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  progress: { total: number; done: number; percent: number };
}

export interface TaskInfo {
  id: string;
  projectId: string | null;
  assigneeUserId: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskCommentInfo {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface CalendarEventInfo {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  kind: string;
  visibility: string;
  departmentId: string | null;
  taskId: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ProjectInput {
  name: string;
  description: string;
  departmentId: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

export interface TaskInput {
  title: string;
  description: string;
  projectId: string | null;
  assigneeUserId: string | null;
  status: string;
  priority: string;
  category: string;
  dueAt: string | null;
}

export interface EventInput {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  kind: string;
  visibility: string;
  departmentId: string | null;
  taskId: string | null;
}

export async function fetchProjects(companyId: string, filters: Record<string, string> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const query = new URLSearchParams(filters).toString();
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/projects' + (query ? '?' + query : ''), { method: 'GET' });
}

export async function fetchProject(companyId: string, projectId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/projects/' + encodeURIComponent(projectId), { method: 'GET' });
}

export async function createProject(companyId: string, input: ProjectInput): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/projects', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateProject(companyId: string, projectId: string, input: Partial<ProjectInput>): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/projects/' + encodeURIComponent(projectId) + '/update', { method: 'POST', body: JSON.stringify({ projectId, ...input }) });
}

export async function deleteProject(companyId: string, projectId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/projects/' + encodeURIComponent(projectId) + '/delete', { method: 'POST', body: JSON.stringify({ projectId }) });
}

export async function fetchTasks(companyId: string, filters: Record<string, string> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const query = new URLSearchParams(filters).toString();
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks' + (query ? '?' + query : ''), { method: 'GET' });
}

export async function fetchTask(companyId: string, taskId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId), { method: 'GET' });
}

export async function createTask(companyId: string, input: TaskInput): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateTask(companyId: string, taskId: string, input: Partial<TaskInput>): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/update', { method: 'POST', body: JSON.stringify({ taskId, ...input }) });
}

export async function deleteTask(companyId: string, taskId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/delete', { method: 'POST', body: JSON.stringify({ taskId }) });
}

export async function fetchComments(companyId: string, taskId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/comments', { method: 'GET' });
}

export async function createComment(companyId: string, taskId: string, body: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/comments', { method: 'POST', body: JSON.stringify({ body }) });
}

export async function updateComment(companyId: string, taskId: string, commentId: string, body: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/comments/' + encodeURIComponent(commentId) + '/update', { method: 'POST', body: JSON.stringify({ commentId, body }) });
}

export async function deleteComment(companyId: string, taskId: string, commentId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/tasks/' + encodeURIComponent(taskId) + '/comments/' + encodeURIComponent(commentId) + '/delete', { method: 'POST', body: JSON.stringify({ commentId }) });
}

export async function fetchEvents(companyId: string, filters: Record<string, string> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const query = new URLSearchParams(filters).toString();
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/events' + (query ? '?' + query : ''), { method: 'GET' });
}

export async function createEvent(companyId: string, input: EventInput): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/events', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateEvent(companyId: string, eventId: string, input: Partial<EventInput>): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/events/' + encodeURIComponent(eventId) + '/update', { method: 'POST', body: JSON.stringify({ eventId, ...input }) });
}

export async function deleteEvent(companyId: string, eventId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/events/' + encodeURIComponent(eventId) + '/delete', { method: 'POST', body: JSON.stringify({ eventId }) });
}

export interface DocumentInfo {
  id: string;
  filename: string;
  mime: string;
  size: number;
  uploadedBy: string;
  projectId: string | null;
  taskId: string | null;
  externalLink: string | null;
  createdAt: string;
}

export interface AnnouncementInfo {
  id: string;
  title: string;
  body: string;
  authorUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceInfo {
  id: string;
  userId: string;
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  note: string;
  createdAt: string;
}

export interface ProfileInfo {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  userType: string;
}

export async function fetchDocuments(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/documents', { method: 'GET' });
}

export async function uploadDocument(companyId: string, file: File | null, fields: { filename?: string; projectId?: string | null; taskId?: string | null; externalLink?: string | null }): Promise<{ status: number; data: Record<string, unknown> }> {
  const form = new FormData();
  if (file) form.append('file', file);
  if (fields.filename) form.append('filename', fields.filename);
  if (fields.projectId) form.append('projectId', fields.projectId);
  if (fields.taskId) form.append('taskId', fields.taskId);
  if (fields.externalLink) form.append('externalLink', fields.externalLink);
  const headers: Record<string, string> = {};
  if (dashboardToken) headers.Authorization = 'Bearer ' + dashboardToken;
  const res = await fetch(DASH_API + '/api/companies/' + encodeURIComponent(companyId) + '/documents', { method: 'POST', headers, body: form });
  return { status: res.status, data: await readBody(res) };
}

export async function downloadDocument(companyId: string, documentId: string, filename: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (dashboardToken) headers.Authorization = 'Bearer ' + dashboardToken;
  const res = await fetch(DASH_API + '/api/companies/' + encodeURIComponent(companyId) + '/documents/' + encodeURIComponent(documentId) + '/download', { method: 'GET', headers });
  if (!res.ok) return { status: res.status, data: await readBody(res) };
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return { status: res.status, data: {} };
}

export async function deleteDocument(companyId: string, documentId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/documents/' + encodeURIComponent(documentId) + '/delete', { method: 'POST', body: JSON.stringify({ documentId }) });
}

export async function fetchAnnouncements(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/announcements', { method: 'GET' });
}

export async function createAnnouncement(companyId: string, title: string, body: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/announcements', { method: 'POST', body: JSON.stringify({ title, body }) });
}

export async function updateAnnouncement(companyId: string, announcementId: string, title: string, body: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/announcements/' + encodeURIComponent(announcementId) + '/update', { method: 'POST', body: JSON.stringify({ announcementId, title, body }) });
}

export async function deleteAnnouncement(companyId: string, announcementId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/announcements/' + encodeURIComponent(announcementId) + '/delete', { method: 'POST', body: JSON.stringify({ announcementId }) });
}

export async function fetchAttendance(companyId: string, filters: Record<string, string> = {}): Promise<{ status: number; data: Record<string, unknown> }> {
  const query = new URLSearchParams(filters).toString();
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/attendance' + (query ? '?' + query : ''), { method: 'GET' });
}

export async function checkIn(companyId: string, date: string, status: string, note: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/attendance/check-in', { method: 'POST', body: JSON.stringify({ date, status, note }) });
}

export async function checkOut(companyId: string, date: string, note: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/attendance/check-out', { method: 'POST', body: JSON.stringify({ date, note }) });
}

export async function fetchProfile(): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/profile', { method: 'GET' });
}

export async function updateProfile(input: { firstName?: string; lastName?: string; jobTitle?: string; phone?: string }): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/profile/update', { method: 'POST', body: JSON.stringify(input) });
}

export interface NotificationInfo {
  id: string;
  kind: string;
  title: string;
  body: string;
  targetId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ReportData {
  range: { start: string | null; end: string | null };
  role: string;
  membersTotal: number;
  membersByDepartment: { departmentId: string | null; departmentName: string | null; count: number }[];
  membersByRole: { role: string; count: number }[];
  projectsTotal: number;
  projectsByStatus: { status: string; count: number }[];
  tasksTotal: number;
  tasksByStatus: { status: string; count: number }[];
  tasksByPriority: { priority: string; count: number }[];
  tasksByAssignee: { assigneeUserId: string | null; count: number }[];
  attendanceTotal: number;
  attendanceByStatus: { status: string; count: number }[];
  documentsCount: number;
  documentsTotalBytes: number;
  recentActivity: ActivityEntry[];
}

export async function fetchReport(companyId: string, start = '', end = ''): Promise<{ status: number; data: Record<string, unknown> }> {
  const query = new URLSearchParams();
  if (start) query.set('start', start);
  if (end) query.set('end', end);
  const suffix = query.toString();
  return apiFetch('/api/companies/' + encodeURIComponent(companyId) + '/reports' + (suffix ? '?' + suffix : ''), { method: 'GET' });
}

export async function fetchNotifications(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/notifications?company_id=' + encodeURIComponent(companyId), { method: 'GET' });
}

export async function fetchUnreadCount(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/notifications/unread-count?company_id=' + encodeURIComponent(companyId), { method: 'GET' });
}

export async function markNotificationRead(companyId: string, notificationId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({ companyId, notificationId }) });
}

export async function markAllNotificationsRead(companyId: string): Promise<{ status: number; data: Record<string, unknown> }> {
  return apiFetch('/api/notifications/mark-all-read', { method: 'POST', body: JSON.stringify({ companyId }) });
}

export async function trackFirstPartyEvent(companyId: string, event: string, tool = '', outcome = ''): Promise<void> {
  try {
    await apiFetch('/api/analytics/events', { method: 'POST', body: JSON.stringify({ companyId, event, tool, outcome }) });
  } catch {
  }
}
