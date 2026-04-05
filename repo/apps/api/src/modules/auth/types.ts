import type { UserRole } from '@rrga/shared';

export interface AuthUserRecord {
  userId: string;
  username: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockoutUntil: Date | null;
  isActive: boolean;
  roles: UserRole[];
}

export interface AuthSessionRecord {
  sessionId: string;
  userId: string;
  username: string;
  roles: UserRole[];
  expiresAt: Date;
}

export interface AuthRequestMeta {
  requestId?: string;
  ip?: string;
  userAgent?: string;
}
