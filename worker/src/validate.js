import { z } from 'zod';
import { fail } from './verify.js';

const inviteSchema = z.object({
  companyId: z.string().min(1).max(200),
  email: z.string().email().max(320),
  role: z.enum(['owner', 'admin', 'manager', 'employee']),
  departmentId: z.string().max(200).optional().nullable(),
});

const claimSchema = z.object({
  token: z.string().min(10).max(256),
});

const step1Schema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
});

const loginStepSchema = z.object({
  loginToken: z.string().min(16).max(512),
});

const setupVerifySchema = z.object({
  loginToken: z.string().min(16).max(512),
  totpCode: z.string().regex(/^\d{6}$/),
});

const verifyStepSchema = z.object({
  loginToken: z.string().min(16).max(512),
  code: z.string().min(1).max(64),
});

const memberRoleSchema = z.object({
  userId: z.string().min(1).max(200),
  role: z.enum(['owner', 'admin', 'manager', 'employee']).optional(),
  departmentId: z.string().max(200).optional().nullable(),
});

const removeSchema = z.object({
  userId: z.string().min(1).max(200),
});

const revokeSchema = z.object({
  invitationId: z.string().min(1).max(200),
});

const transferSchema = z.object({
  newOwnerUserId: z.string().min(1).max(200),
});

const departmentSchema = z.object({
  name: z.string().min(1).max(200),
  managerUserId: z.string().max(200).optional().nullable(),
});

const departmentUpdateSchema = z.object({
  deptId: z.string().min(1).max(200),
  name: z.string().min(1).max(200).optional(),
  managerUserId: z.string().max(200).optional().nullable(),
});

const departmentDeleteSchema = z.object({
  deptId: z.string().min(1).max(200),
});

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  departmentId: z.string().max(200).optional().nullable(),
  status: z.enum(['planned', 'active', 'completed', 'archived']).optional(),
  startDate: z.string().max(50).optional().nullable(),
  endDate: z.string().max(50).optional().nullable(),
});

const projectUpdateSchema = z.object({
  projectId: z.string().min(1).max(200),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  departmentId: z.string().max(200).optional().nullable(),
  status: z.enum(['planned', 'active', 'completed', 'archived']).optional(),
  startDate: z.string().max(50).optional().nullable(),
  endDate: z.string().max(50).optional().nullable(),
});

const projectDeleteSchema = z.object({
  projectId: z.string().min(1).max(200),
});

const taskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  projectId: z.string().max(200).optional().nullable(),
  assigneeUserId: z.string().max(200).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  category: z.string().max(200).optional(),
  dueAt: z.string().max(50).optional().nullable(),
});

const taskUpdateSchema = z.object({
  taskId: z.string().min(1).max(200),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  projectId: z.string().max(200).optional().nullable(),
  assigneeUserId: z.string().max(200).optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'review', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  category: z.string().max(200).optional(),
  dueAt: z.string().max(50).optional().nullable(),
});

const taskDeleteSchema = z.object({
  taskId: z.string().min(1).max(200),
});

const commentSchema = z.object({
  body: z.string().min(1).max(5000),
});

const commentUpdateSchema = z.object({
  commentId: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

const commentDeleteSchema = z.object({
  commentId: z.string().min(1).max(200),
});

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startAt: z.string().min(1).max(50),
  endAt: z.string().min(1).max(50),
  kind: z.enum(['event', 'meeting', 'deadline']).optional(),
  visibility: z.enum(['company', 'department', 'personal']).optional(),
  departmentId: z.string().max(200).optional().nullable(),
});

const eventUpdateSchema = z.object({
  eventId: z.string().min(1).max(200),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  startAt: z.string().min(1).max(50).optional(),
  endAt: z.string().min(1).max(50).optional(),
  kind: z.enum(['event', 'meeting', 'deadline']).optional(),
  visibility: z.enum(['company', 'department', 'personal']).optional(),
  departmentId: z.string().max(200).optional().nullable(),
});

const eventDeleteSchema = z.object({
  eventId: z.string().min(1).max(200),
});

const announcementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

const announcementUpdateSchema = z.object({
  announcementId: z.string().min(1).max(200),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
});

const announcementDeleteSchema = z.object({
  announcementId: z.string().min(1).max(200),
});

const documentDeleteSchema = z.object({
  documentId: z.string().min(1).max(200),
});

const profileUpdateSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  jobTitle: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
});

const attendanceCheckInSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['present', 'remote']).optional(),
  note: z.string().max(500).optional(),
});

const attendanceCheckOutSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
});

export function parseInvite(body) {
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseClaim(body) {
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseStep1(body) {
  const parsed = step1Schema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseLoginStep(body) {
  const parsed = loginStepSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseSetupVerify(body) {
  const parsed = setupVerifySchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseVerifyStep(body) {
  const parsed = verifyStepSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseMemberRole(body) {
  const parsed = memberRoleSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseRemove(body) {
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseRevoke(body) {
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseTransfer(body) {
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseDepartment(body) {
  const parsed = departmentSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseDepartmentUpdate(body) {
  const parsed = departmentUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseDepartmentDelete(body) {
  const parsed = departmentDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseProject(body) {
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseProjectUpdate(body) {
  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseProjectDelete(body) {
  const parsed = projectDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseTask(body) {
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseTaskUpdate(body) {
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseTaskDelete(body) {
  const parsed = taskDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseComment(body) {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseCommentUpdate(body) {
  const parsed = commentUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseCommentDelete(body) {
  const parsed = commentDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseEvent(body) {
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseEventUpdate(body) {
  const parsed = eventUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseEventDelete(body) {
  const parsed = eventDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseAnnouncement(body) {
  const parsed = announcementSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseAnnouncementUpdate(body) {
  const parsed = announcementUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseAnnouncementDelete(body) {
  const parsed = announcementDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseDocumentDelete(body) {
  const parsed = documentDeleteSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseProfileUpdate(body) {
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseAttendanceCheckIn(body) {
  const parsed = attendanceCheckInSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseAttendanceCheckOut(body) {
  const parsed = attendanceCheckOutSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}
