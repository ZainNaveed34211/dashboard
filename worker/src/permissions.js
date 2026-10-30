export const ROLES = ['owner', 'admin', 'manager', 'employee'];

export function canInvite(inviterRole, targetRole) {
  if (inviterRole === 'owner') return true;
  if (inviterRole === 'admin') return targetRole === 'manager' || targetRole === 'employee';
  return false;
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
