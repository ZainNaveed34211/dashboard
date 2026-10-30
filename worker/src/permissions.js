export const ROLES = ['owner', 'admin', 'manager', 'employee'];

export function canInvite(inviterRole) {
  return inviterRole === 'owner';
}

export function isValidRole(role) {
  return ROLES.includes(role);
}
