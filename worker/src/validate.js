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

const setupSchema = z.object({
  setupToken: z.string().min(16).max(512),
});

const verifySchema = z.object({
  setupToken: z.string().min(16).max(512),
  code: z.string().regex(/^\d{6}$/),
});

const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
  totp: z.string().regex(/^\d{6}$/).optional().nullable(),
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

export function parseSetup(body) {
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseVerify(body) {
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}

export function parseLogin(body) {
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) fail(400, 'Invalid request.');
  return parsed.data;
}
