import { describe, expect, it } from 'vitest';
import type { UserRole } from '@rrga/shared';
import { createAuthService } from '../src/modules/auth/service.js';
import type { AuthRepository } from '../src/modules/auth/repository.js';
import { hashPassword } from '../src/modules/auth/crypto.js';

const makeRepository = async (): Promise<AuthRepository> => {
  const users = new Map<string, {
    userId: string;
    username: string;
    passwordHash: string;
    failedLoginAttempts: number;
    lockoutUntil: Date | null;
    isActive: boolean;
    roles: UserRole[];
  }>();

  const sessions = new Map<string, {
    sessionId: string;
    userId: string;
    username: string;
    roles: UserRole[];
    expiresAt: Date;
    revokedAt: Date | null;
  }>();

  const attempts: Array<{ username: string; success: boolean; reason?: string }> = [];

  const baseUser = {
    userId: 'user-1',
    username: 'owner',
    passwordHash: await hashPassword('OwnerPass1!'),
    failedLoginAttempts: 0,
    lockoutUntil: null,
    isActive: true,
    roles: ['administrator']
  };
  users.set(baseUser.username, baseUser);

  return {
    async countUsers() {
      return users.size;
    },
    async createUserWithRole(username, passwordHash, roleCode) {
      const next = {
        userId: `user-${users.size + 1}`,
        username,
        passwordHash,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        isActive: true,
        roles: [roleCode]
      };

      users.set(username, next);
      return {
        userId: next.userId,
        username: next.username,
        roles: next.roles
      };
    },
    async findUserByUsername(username) {
      return users.get(username) ?? null;
    },
    async findUserById(userId) {
      for (const user of users.values()) {
        if (user.userId === userId) {
          return user;
        }
      }
      return null;
    },
    async updateFailedLogin(userId, failedAttempts, lockoutUntil) {
      for (const user of users.values()) {
        if (user.userId === userId) {
          user.failedLoginAttempts = failedAttempts;
          user.lockoutUntil = lockoutUntil;
        }
      }
    },
    async resetFailedLogin(userId) {
      for (const user of users.values()) {
        if (user.userId === userId) {
          user.failedLoginAttempts = 0;
          user.lockoutUntil = null;
        }
      }
    },
    async updateLastLogin() {},
    async recordAuthAttempt(input) {
      attempts.push({
        username: input.username,
        success: input.success,
        reason: input.failureReason
      });
    },
    async createSession(input) {
      const user = Array.from(users.values()).find((entry) => entry.userId === input.userId);
      if (!user) {
        throw new Error('user missing');
      }

      const sessionId = `session-${sessions.size + 1}`;
      sessions.set(input.sessionTokenHash, {
        sessionId,
        userId: user.userId,
        username: user.username,
        roles: user.roles,
        expiresAt: input.expiresAt,
        revokedAt: null
      });
      return { sessionId };
    },
    async findActiveSessionByHash(sessionTokenHash, now) {
      const session = sessions.get(sessionTokenHash);
      if (!session || session.revokedAt || session.expiresAt <= now) {
        return null;
      }
      return session;
    },
    async revokeSession(sessionId) {
      for (const session of sessions.values()) {
        if (session.sessionId === sessionId) {
          session.revokedAt = new Date();
        }
      }
    },
    async revokeOtherSessions(userId, exceptSessionId) {
      for (const session of sessions.values()) {
        if (session.userId === userId && session.sessionId !== exceptSessionId) {
          session.revokedAt = new Date();
        }
      }
    },
    async updatePassword(userId, passwordHash) {
      for (const user of users.values()) {
        if (user.userId === userId) {
          user.passwordHash = passwordHash;
        }
      }
    }
  };
};

describe('auth service', () => {
  it('logs in successfully with valid credentials', async () => {
    const auditEvents: Array<{ eventType: string; outcome: string }> = [];
    const service = createAuthService({
      config: {
        nodeEnv: 'test',
        port: 0,
        logLevel: 'silent',
        publicApiBase: '/api/v1',
        sessionSecret: 'secret',
        auth: {
          sessionCookieName: 'rrga_session',
          sessionTtlMinutes: 60,
          lockoutMinutes: 15,
          maxFailedAttempts: 5
        },
        uploads: {
          rootDir: '/tmp/rrga-test-uploads',
          maxBytes: 1024 * 1024
        },
        database: {
          host: '127.0.0.1',
          port: 1,
          user: 'x',
          password: 'x',
          database: 'x',
          ssl: false
        }
      },
      repository: await makeRepository(),
      audit: {
        async write(input) {
          auditEvents.push({ eventType: input.eventType, outcome: input.outcome });
        }
      }
    });

    const login = await service.login({
      username: 'owner',
      password: 'OwnerPass1!',
      meta: {}
    });

    expect(login.user.username).toBe('owner');
    expect(login.user.roles).toContain('administrator');
    expect(login.sessionToken.length).toBeGreaterThan(20);
    expect(auditEvents.some((event) => event.eventType === 'AUTH_LOGIN_SUCCESS')).toBe(true);
  });

  it('rejects change-password when new password violates policy', async () => {
    const service = createAuthService({
      config: {
        nodeEnv: 'test',
        port: 0,
        logLevel: 'silent',
        publicApiBase: '/api/v1',
        sessionSecret: 'secret',
        auth: {
          sessionCookieName: 'rrga_session',
          sessionTtlMinutes: 60,
          lockoutMinutes: 15,
          maxFailedAttempts: 5
        },
        uploads: {
          rootDir: '/tmp/rrga-test-uploads',
          maxBytes: 1024 * 1024
        },
        database: {
          host: '127.0.0.1',
          port: 1,
          user: 'x',
          password: 'x',
          database: 'x',
          ssl: false
        }
      },
      repository: await makeRepository(),
      audit: {
        async write() {}
      }
    });

    await expect(
      service.changePassword({
        auth: {
          userId: 'user-1',
          username: 'owner',
          roles: ['administrator'],
          sessionId: 'session-1'
        },
        currentPassword: 'OwnerPass1!',
        nextPassword: 'weak',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'PASSWORD_POLICY_VIOLATION');
  });

  it('locks account after five failed attempts', async () => {
    const auditEvents: string[] = [];
    const service = createAuthService({
      config: {
        nodeEnv: 'test',
        port: 0,
        logLevel: 'silent',
        publicApiBase: '/api/v1',
        sessionSecret: 'secret',
        auth: {
          sessionCookieName: 'rrga_session',
          sessionTtlMinutes: 60,
          lockoutMinutes: 15,
          maxFailedAttempts: 5
        },
        uploads: {
          rootDir: '/tmp/rrga-test-uploads',
          maxBytes: 1024 * 1024
        },
        database: {
          host: '127.0.0.1',
          port: 1,
          user: 'x',
          password: 'x',
          database: 'x',
          ssl: false
        }
      },
      repository: await makeRepository(),
      audit: {
        async write(input) {
          auditEvents.push(input.eventType);
        }
      }
    });

    for (let index = 0; index < 5; index += 1) {
      await expect(
        service.login({
          username: 'owner',
          password: 'wrong-password',
          meta: {}
        })
      ).rejects.toHaveProperty('code', 'INVALID_CREDENTIALS');
    }

    await expect(
      service.login({
        username: 'owner',
        password: 'OwnerPass1!',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'ACCOUNT_LOCKED');

    expect(auditEvents).toContain('AUTH_LOGIN_FAILURE');
    expect(auditEvents).toContain('AUTH_LOCKOUT_TRIGGERED');
  });
});
