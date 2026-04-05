import { redirect, type Handle } from '@sveltejs/kit';
import type { AuthUser, UserRole } from '$lib/auth';
import { fetchApi } from '$lib/server/api';

const protectedRolePrefixes = [
  { prefix: '/researcher', requiredRole: 'researcher' },
  { prefix: '/reviewer', requiredRole: 'reviewer' },
  { prefix: '/approver', requiredRole: 'approver' },
  { prefix: '/manager', requiredRole: 'resource_manager' },
  { prefix: '/finance', requiredRole: 'finance_clerk' },
  { prefix: '/admin', requiredRole: 'administrator' }
] as const;

const publicPaths = new Set(['/login', '/forbidden']);

const getRequiredRole = (pathname: string): UserRole | null => {
  const match = protectedRolePrefixes.find((entry) => pathname.startsWith(entry.prefix));
  return match?.requiredRole ?? null;
};

const fetchCurrentUser = async (event: Parameters<Handle>[0]['event']): Promise<AuthUser | null> => {
  const sessionCookie = event.cookies.get('rrga_session');
  if (!sessionCookie) {
    return null;
  }

  const response = await fetchApi(event, '/auth/me');
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { user?: AuthUser };
  return payload.user ?? null;
};

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;

  if (pathname.startsWith('/session/')) {
    return resolve(event);
  }

  const user = await fetchCurrentUser(event);
  event.locals.user = user;
  event.locals.role = user?.roles[0] ?? null;

  const requiredRole = getRequiredRole(pathname);

  if (requiredRole && !user) {
    const next = encodeURIComponent(event.url.pathname + event.url.search);
    throw redirect(302, `/login?next=${next}`);
  }

  if (requiredRole && user && !user.roles.includes(requiredRole)) {
    throw redirect(302, '/forbidden');
  }

  if (pathname === '/login' && user) {
    throw redirect(302, '/');
  }

  if (publicPaths.has(pathname) || pathname === '/') {
    return resolve(event);
  }

  return resolve(event);
};
