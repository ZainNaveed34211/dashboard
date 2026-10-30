export function validateNext(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return '/';
  if (value.includes('\\')) return '/';
  const dashOrigin = 'https://dash.kluzar.com';
  if (value === dashOrigin) return '/';
  if (value.startsWith(dashOrigin + '/')) {
    const path = value.slice(dashOrigin.length).split('?')[0].split('#')[0];
    return path && path.startsWith('/') ? path : '/';
  }
  if (value.startsWith('/') && !value.startsWith('//')) {
    const path = value.split('?')[0].split('#')[0];
    return path ? path : '/';
  }
  return '/';
}
