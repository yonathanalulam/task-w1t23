import { roleSurfaces } from './role-surfaces';

export type UserRole = (typeof roleSurfaces)[number]['role'];

export interface AuthUser {
  userId: string;
  username: string;
  roles: UserRole[];
  sessionId: string;
}

export const roleHomePath = (roles: UserRole[]): string => {
  const firstMatch = roleSurfaces.find((surface) => roles.includes(surface.role));
  return firstMatch?.href ?? '/';
};
