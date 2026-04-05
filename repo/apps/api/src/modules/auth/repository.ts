import type { Pool } from 'pg';
import type { UserRole } from '@rrga/shared';
import type { AuthSessionRecord, AuthUserRecord } from './types.js';

const toDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(String(value));
};

const asRoles = (value: unknown): UserRole[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is UserRole => typeof entry === 'string') as UserRole[];
};

const toAuthUser = (row: Record<string, unknown>): AuthUserRecord => {
  return {
    userId: String(row.user_id),
    username: String(row.username),
    passwordHash: String(row.password_hash),
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockoutUntil: toDate(row.lockout_until),
    isActive: Boolean(row.is_active),
    roles: asRoles(row.roles)
  };
};

const toAuthSession = (row: Record<string, unknown>): AuthSessionRecord => {
  return {
    sessionId: String(row.session_id),
    userId: String(row.user_id),
    username: String(row.username),
    roles: asRoles(row.roles),
    expiresAt: new Date(String(row.expires_at))
  };
};

export interface AuthRepository {
  countUsers(): Promise<number>;
  createUserWithRole(username: string, passwordHash: string, roleCode: UserRole): Promise<{ userId: string; username: string; roles: UserRole[] }>;
  findUserByUsername(username: string): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  updateFailedLogin(userId: string, failedAttempts: number, lockoutUntil: Date | null): Promise<void>;
  resetFailedLogin(userId: string): Promise<void>;
  updateLastLogin(userId: string, when: Date): Promise<void>;
  recordAuthAttempt(input: {
    userId?: string;
    username: string;
    success: boolean;
    failureReason?: string;
    requestId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
  createSession(input: {
    userId: string;
    sessionTokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<{ sessionId: string }>;
  findActiveSessionByHash(sessionTokenHash: string, now: Date): Promise<AuthSessionRecord | null>;
  revokeSession(sessionId: string, reason: string): Promise<void>;
  revokeOtherSessions(userId: string, exceptSessionId: string): Promise<void>;
  updatePassword(userId: string, passwordHash: string, when: Date): Promise<void>;
}

export const createAuthRepository = (pool: Pool): AuthRepository => {
  return {
    async countUsers() {
      const result = await pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM users');
      return Number(result.rows[0]?.total ?? 0);
    },

    async createUserWithRole(username, passwordHash, roleCode) {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        const userResult = await client.query<{ id: string; username: string }>(
          `
            INSERT INTO users (username, password_hash)
            VALUES ($1, $2)
            RETURNING id, username
          `,
          [username, passwordHash]
        );

        const user = userResult.rows[0];
        if (!user) {
          throw new Error('User creation failed');
        }

        const roleResult = await client.query<{ id: number; code: UserRole }>('SELECT id, code FROM roles WHERE code = $1', [roleCode]);
        const role = roleResult.rows[0];

        if (!role) {
          throw new Error(`Role ${roleCode} not found`);
        }

        await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [user.id, role.id]);
        await client.query('COMMIT');

        return {
          userId: user.id,
          username: user.username,
          roles: [role.code]
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async findUserByUsername(username) {
      const result = await pool.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.username,
            u.password_hash,
            u.failed_login_attempts,
            u.lockout_until,
            u.is_active,
            COALESCE(array_remove(array_agg(r.code), NULL), ARRAY[]::text[]) AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.username = $1
          GROUP BY u.id
        `,
        [username]
      );

      const row = result.rows[0];
      return row ? toAuthUser(row) : null;
    },

    async findUserById(userId) {
      const result = await pool.query<Record<string, unknown>>(
        `
          SELECT
            u.id AS user_id,
            u.username,
            u.password_hash,
            u.failed_login_attempts,
            u.lockout_until,
            u.is_active,
            COALESCE(array_remove(array_agg(r.code), NULL), ARRAY[]::text[]) AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
          WHERE u.id = $1
          GROUP BY u.id
        `,
        [userId]
      );

      const row = result.rows[0];
      return row ? toAuthUser(row) : null;
    },

    async updateFailedLogin(userId, failedAttempts, lockoutUntil) {
      await pool.query('UPDATE users SET failed_login_attempts = $2, lockout_until = $3, updated_at = NOW() WHERE id = $1', [
        userId,
        failedAttempts,
        lockoutUntil
      ]);
    },

    async resetFailedLogin(userId) {
      await pool.query('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, updated_at = NOW() WHERE id = $1', [userId]);
    },

    async updateLastLogin(userId, when) {
      await pool.query('UPDATE users SET last_login_at = $2, updated_at = NOW() WHERE id = $1', [userId, when]);
    },

    async recordAuthAttempt(input) {
      await pool.query(
        `
          INSERT INTO auth_attempts (
            user_id,
            username,
            success,
            failure_reason,
            request_id,
            ip,
            user_agent
          ) VALUES ($1,$2,$3,$4,$5,$6::inet,$7)
        `,
        [
          input.userId ?? null,
          input.username,
          input.success,
          input.failureReason ?? null,
          input.requestId ?? null,
          input.ip ?? null,
          input.userAgent ?? null
        ]
      );
    },

    async createSession(input) {
      const result = await pool.query<{ id: string }>(
        `
          INSERT INTO sessions (
            user_id,
            session_token_hash,
            expires_at,
            created_ip,
            created_user_agent
          ) VALUES ($1, $2, $3, $4::inet, $5)
          RETURNING id
        `,
        [input.userId, input.sessionTokenHash, input.expiresAt, input.ip ?? null, input.userAgent ?? null]
      );

      return {
        sessionId: String(result.rows[0]?.id)
      };
    },

    async findActiveSessionByHash(sessionTokenHash, now) {
      const result = await pool.query<Record<string, unknown>>(
        `
          SELECT
            s.id AS session_id,
            u.id AS user_id,
            u.username,
            s.expires_at,
            COALESCE(array_remove(array_agg(r.code), NULL), ARRAY[]::text[]) AS roles
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r ON r.id = ur.role_id
          WHERE s.session_token_hash = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > $2
            AND u.is_active = TRUE
          GROUP BY s.id, u.id
        `,
        [sessionTokenHash, now]
      );

      const row = result.rows[0];
      return row ? toAuthSession(row) : null;
    },

    async revokeSession(sessionId, reason) {
      await pool.query('UPDATE sessions SET revoked_at = NOW(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL', [sessionId, reason]);
    },

    async revokeOtherSessions(userId, exceptSessionId) {
      await pool.query(
        'UPDATE sessions SET revoked_at = NOW(), revoked_reason = $3 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
        [userId, exceptSessionId, 'password_changed']
      );
    },

    async updatePassword(userId, passwordHash, when) {
      await pool.query(
        'UPDATE users SET password_hash = $2, password_changed_at = $3, updated_at = NOW(), failed_login_attempts = 0, lockout_until = NULL WHERE id = $1',
        [userId, passwordHash, when]
      );
    }
  };
};
