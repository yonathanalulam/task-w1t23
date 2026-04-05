import type { UserRole } from '@rrga/shared';
import { HttpError, conflict, unauthorized } from '../../lib/http-error.js';
import type { AppConfig } from '../../lib/config.js';
import type { AuditWriteInput } from '../audit/types.js';
import { hashPassword, hashSessionToken, verifyPassword, createSessionToken } from './crypto.js';
import { validatePasswordPolicy } from './password-policy.js';
import type { AuthRepository } from './repository.js';
import type { AuthRequestMeta } from './types.js';

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

export interface AuthContext {
  userId: string;
  username: string;
  roles: UserRole[];
  sessionId: string;
}

export interface AuthService {
  authenticateFromSessionCookie(sessionToken: string): Promise<AuthContext | null>;
  bootstrapAdmin(username: string, password: string, meta: AuthRequestMeta): Promise<{ userId: string; username: string; roles: UserRole[] }>;
  login(input: {
    username: string;
    password: string;
    meta: AuthRequestMeta;
  }): Promise<{ sessionToken: string; expiresAt: Date; user: { userId: string; username: string; roles: UserRole[]; sessionId: string } }>;
  logout(auth: AuthContext, meta: AuthRequestMeta): Promise<void>;
  me(auth: AuthContext): Promise<{ userId: string; username: string; roles: UserRole[]; sessionId: string }>;
  changePassword(input: {
    auth: AuthContext;
    currentPassword: string;
    nextPassword: string;
    meta: AuthRequestMeta;
  }): Promise<{ sessionToken: string; expiresAt: Date }>;
}

const normalizeUsername = (username: string): string => username.trim();

const minutesFromNow = (minutes: number): Date => new Date(Date.now() + minutes * 60_000);

const withMeta = (meta: AuthRequestMeta): Pick<AuditWriteInput, 'requestId' | 'ip' | 'userAgent'> => {
  return {
    ...(meta.requestId ? { requestId: meta.requestId } : {}),
    ...(meta.ip ? { ip: meta.ip } : {}),
    ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
  };
};

export const createAuthService = (deps: {
  config: AppConfig;
  repository: AuthRepository;
  audit: AuditWriter;
}): AuthService => {
  const { config, repository, audit } = deps;

  const writeAudit = async (input: AuditWriteInput): Promise<void> => {
    await audit.write(input);
  };

  const authenticateFromSessionCookie: AuthService['authenticateFromSessionCookie'] = async (sessionToken) => {
    const tokenHash = hashSessionToken(sessionToken, config.sessionSecret);
    const session = await repository.findActiveSessionByHash(tokenHash, new Date());

    if (!session) {
      return null;
    }

    return {
      userId: session.userId,
      username: session.username,
      roles: session.roles,
      sessionId: session.sessionId
    };
  };

  const bootstrapAdmin: AuthService['bootstrapAdmin'] = async (username, password, meta) => {
    const normalized = normalizeUsername(username);
    const policy = validatePasswordPolicy(password);

    if (!normalized) {
      throw new HttpError(400, 'INVALID_USERNAME', 'Username is required.');
    }

    if (!policy.ok) {
      throw new HttpError(400, 'PASSWORD_POLICY_VIOLATION', 'Password does not satisfy policy.', {
        errors: policy.errors
      });
    }

    const existingCount = await repository.countUsers();
    if (existingCount > 0) {
      throw conflict('Bootstrap is only available before the first user is created.');
    }

    const passwordHash = await hashPassword(password);
    const user = await repository.createUserWithRole(normalized, passwordHash, 'administrator');

    await writeAudit({
      actorUserId: user.userId,
      eventType: 'AUTH_BOOTSTRAP_ADMIN',
      entityType: 'user',
      entityId: user.userId,
      outcome: 'success',
      ...withMeta(meta),
      details: { username: user.username }
    });

    return user;
  };

  const login: AuthService['login'] = async ({ username, password, meta }) => {
    const normalized = normalizeUsername(username);
    const genericFailure = new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid username or password.');

    const user = await repository.findUserByUsername(normalized);

    if (!user || !user.isActive) {
      await repository.recordAuthAttempt({
        username: normalized,
        success: false,
        failureReason: 'invalid_credentials',
        ...withMeta(meta)
      });

      await writeAudit({
        eventType: 'AUTH_LOGIN_FAILURE',
        entityType: 'user',
        outcome: 'failure',
        ...withMeta(meta),
        details: { username: normalized, reason: 'invalid_credentials' }
      });

      throw genericFailure;
    }

    const now = new Date();
    if (user.lockoutUntil && user.lockoutUntil > now) {
      await repository.recordAuthAttempt({
        userId: user.userId,
        username: user.username,
        success: false,
        failureReason: 'locked',
        ...withMeta(meta)
      });

      await writeAudit({
        actorUserId: user.userId,
        eventType: 'AUTH_LOGIN_FAILURE',
        entityType: 'user',
        entityId: user.userId,
        outcome: 'failure',
        ...withMeta(meta),
        details: { username: user.username, reason: 'locked' }
      });

      throw new HttpError(423, 'ACCOUNT_LOCKED', 'Account is locked. Please try again later.');
    }

    const verified = await verifyPassword(user.passwordHash, password);
    if (!verified) {
      const nextFailedAttempts = user.failedLoginAttempts + 1;
      const reachedLockout = nextFailedAttempts >= config.auth.maxFailedAttempts;
      const lockoutUntil = reachedLockout ? minutesFromNow(config.auth.lockoutMinutes) : null;

      await repository.updateFailedLogin(user.userId, reachedLockout ? 0 : nextFailedAttempts, lockoutUntil);

      await repository.recordAuthAttempt({
        userId: user.userId,
        username: user.username,
        success: false,
        failureReason: reachedLockout ? 'locked_after_failures' : 'invalid_credentials',
        ...withMeta(meta)
      });

      await writeAudit({
        actorUserId: user.userId,
        eventType: 'AUTH_LOGIN_FAILURE',
        entityType: 'user',
        entityId: user.userId,
        outcome: 'failure',
        ...withMeta(meta),
        details: {
          username: user.username,
          reason: reachedLockout ? 'locked_after_failures' : 'invalid_credentials',
          failedAttemptCount: reachedLockout ? config.auth.maxFailedAttempts : nextFailedAttempts
        }
      });

      if (reachedLockout) {
        await writeAudit({
          actorUserId: user.userId,
          eventType: 'AUTH_LOCKOUT_TRIGGERED',
          entityType: 'user',
          entityId: user.userId,
          outcome: 'failure',
          ...withMeta(meta),
          details: {
            username: user.username,
            lockoutUntil: lockoutUntil?.toISOString()
          }
        });
      }

      throw genericFailure;
    }

    await repository.resetFailedLogin(user.userId);
    await repository.updateLastLogin(user.userId, now);

    const sessionToken = createSessionToken();
    const sessionTokenHash = hashSessionToken(sessionToken, config.sessionSecret);
    const expiresAt = minutesFromNow(config.auth.sessionTtlMinutes);
    const session = await repository.createSession({
      userId: user.userId,
      sessionTokenHash,
      expiresAt,
      ...withMeta(meta)
    });

    await repository.recordAuthAttempt({
      userId: user.userId,
      username: user.username,
      success: true,
      ...withMeta(meta)
    });

    await writeAudit({
      actorUserId: user.userId,
      eventType: 'AUTH_LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.userId,
      outcome: 'success',
      ...withMeta(meta),
      details: { username: user.username, sessionId: session.sessionId }
    });

    return {
      sessionToken,
      expiresAt,
      user: {
        userId: user.userId,
        username: user.username,
        roles: user.roles,
        sessionId: session.sessionId
      }
    };
  };

  const logout: AuthService['logout'] = async (auth, meta) => {
    await repository.revokeSession(auth.sessionId, 'user_logout');

    await writeAudit({
      actorUserId: auth.userId,
      eventType: 'AUTH_LOGOUT',
      entityType: 'session',
      entityId: auth.sessionId,
      outcome: 'success',
      ...withMeta(meta),
      details: { username: auth.username }
    });
  };

  const me: AuthService['me'] = async (auth) => {
    return {
      userId: auth.userId,
      username: auth.username,
      roles: auth.roles,
      sessionId: auth.sessionId
    };
  };

  const changePassword: AuthService['changePassword'] = async ({ auth, currentPassword, nextPassword, meta }) => {
    const policy = validatePasswordPolicy(nextPassword);

    if (!policy.ok) {
      throw new HttpError(400, 'PASSWORD_POLICY_VIOLATION', 'Password does not satisfy policy.', {
        errors: policy.errors
      });
    }

    const user = await repository.findUserById(auth.userId);
    if (!user) {
      throw unauthorized();
    }

    const currentMatches = await verifyPassword(user.passwordHash, currentPassword);
    if (!currentMatches) {
      throw new HttpError(400, 'INVALID_CURRENT_PASSWORD', 'Current password is incorrect.');
    }

    const nextMatchesCurrent = await verifyPassword(user.passwordHash, nextPassword);
    if (nextMatchesCurrent) {
      throw new HttpError(400, 'PASSWORD_REUSE_NOT_ALLOWED', 'New password must differ from the current password.');
    }

    const updatedPasswordHash = await hashPassword(nextPassword);
    const now = new Date();

    await repository.updatePassword(auth.userId, updatedPasswordHash, now);
    await repository.revokeOtherSessions(auth.userId, auth.sessionId);

    const newSessionToken = createSessionToken();
    const newSessionTokenHash = hashSessionToken(newSessionToken, config.sessionSecret);
    const expiresAt = minutesFromNow(config.auth.sessionTtlMinutes);
    const nextSession = await repository.createSession({
      userId: auth.userId,
      sessionTokenHash: newSessionTokenHash,
      expiresAt,
      ...withMeta(meta)
    });

    await repository.revokeSession(auth.sessionId, 'password_changed');

    await writeAudit({
      actorUserId: auth.userId,
      eventType: 'AUTH_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: auth.userId,
      outcome: 'success',
      ...withMeta(meta),
      details: { oldSessionId: auth.sessionId, newSessionId: nextSession.sessionId }
    });

    return {
      sessionToken: newSessionToken,
      expiresAt
    };
  };

  return {
    authenticateFromSessionCookie,
    bootstrapAdmin,
    login,
    logout,
    me,
    changePassword
  };
};
