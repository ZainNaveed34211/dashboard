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
