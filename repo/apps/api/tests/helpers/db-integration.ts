import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool, type PoolClient } from 'pg';
import { hashPassword } from '../../src/modules/auth/crypto.js';
import { buildApp } from '../../src/app.js';
import { closePool } from '../../src/lib/db.js';
import type { AppConfig } from '../../src/lib/config.js';

const integrationLockKey = 482341;

const readFileIfPresent = (filePath: string | undefined): string | undefined => {
  if (!filePath || !existsSync(filePath)) {
    return undefined;
  }

  return readFileSync(filePath, 'utf8').trim();
};

const readEnvFileOrDefaultFile = (name: string, defaultFilePath?: string): string | undefined => {
  const directValue = process.env[name]?.trim();
  if (directValue) {
    return directValue;
  }

  const envFileValue = readFileIfPresent(process.env[`${name}_FILE`]?.trim());
  if (envFileValue) {
    return envFileValue;
  }

  return readFileIfPresent(defaultFilePath);
};

const getFallbackDatabaseUrl = (): string => {
  const host = process.env.DB_HOST || process.env.PGHOST || process.env.RRGA_DB_HOST || 'db';
  const port = process.env.DB_PORT || process.env.PGPORT || process.env.RRGA_DB_PORT || '5432';
  const user =
    process.env.DB_USER ||
    process.env.PGUSER ||
    process.env.RRGA_DB_USER ||
    readFileIfPresent('/run/rrga-runtime/db_user') ||
    'postgres';
  const password =
    process.env.DB_PASSWORD ||
    process.env.PGPASSWORD ||
    process.env.RRGA_DB_PASSWORD ||
    readFileIfPresent('/run/rrga-runtime/db_password') ||
    'postgres';
  const database =
    process.env.DB_NAME ||
    process.env.PGDATABASE ||
    process.env.RRGA_DB_NAME ||
    readFileIfPresent('/run/rrga-runtime/db_name') ||
    'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
};

const getDatabaseUrl = (): string => {
  const value = process.env.DATABASE_URL?.trim();
  if (value) {
    return value;
  }

  return getFallbackDatabaseUrl();
};

const buildConfigFromDatabaseUrl = async (): Promise<AppConfig> => {
  const databaseUrl = new URL(getDatabaseUrl());
  const uploadRoot = await mkdtemp(join(tmpdir(), 'rrga-api-test-uploads-'));

  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'silent',
    publicApiBase: '/api/v1',
    sessionSecret: readEnvFileOrDefaultFile('APP_SESSION_SECRET', '/run/rrga-runtime/app_session_secret') ?? 'test-session-secret',
    encryptionKey: readEnvFileOrDefaultFile('APP_ENCRYPTION_KEY', '/run/rrga-runtime/app_encryption_key') ?? 'test-encryption-key',
    bootstrapSecret: readEnvFileOrDefaultFile('APP_BOOTSTRAP_SECRET') ?? 'test-bootstrap-secret',
    auth: {
      sessionCookieName: process.env.APP_SESSION_COOKIE_NAME ?? 'rrga_session',
      sessionTtlMinutes: Number(process.env.APP_SESSION_TTL_MINUTES ?? '60'),
      lockoutMinutes: Number(process.env.APP_LOCKOUT_MINUTES ?? '15'),
      maxFailedAttempts: Number(process.env.APP_MAX_FAILED_ATTEMPTS ?? '5')
    },
    uploads: {
      rootDir: uploadRoot,
      maxBytes: Number(process.env.APP_UPLOAD_MAX_BYTES ?? `${1024 * 1024 * 4}`)
    },
    database: {
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || '5432'),
      user: decodeURIComponent(databaseUrl.username),
      password: decodeURIComponent(databaseUrl.password),
      database: databaseUrl.pathname.replace(/^\//, ''),
      ssl: databaseUrl.searchParams.get('sslmode') === 'require'
    }
  };
};

const wipeData = async (pool: Pool) => {
  const candidates = [
    'application_assignments',
    'application_review_actions',
    'application_workflow_state',
    'finance_ledger_entries',
    'finance_settlement_rows',
    'finance_settlement_imports',
    'finance_refunds',
    'finance_payments',
    'finance_invoices',
    'recommendation_feedback',
    'recommendation_user_preferences',
    'resource_booking_allocations',
    'resource_bookings',
    'resource_blackout_windows',
    'resources',
    'journal_feedback',
    'journal_attachment_versions',
    'journal_attachments',
    'journal_review_actions',
    'journal_record_versions',
    'journal_records',
    'journals',
    'document_rollbacks',
    'application_document_versions',
    'application_documents',
    'application_validations',
    'application_extensions',
    'application_status_history',
    'applications',
    'policy_required_document_templates',
    'funding_policies',
    'sessions',
    'auth_attempts',
    'audit_events',
    'user_roles',
    'users'
  ];

  const existingTablesResult = await pool.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    `,
    [candidates]
  );

  const existingTables = existingTablesResult.rows.map((row) => row.table_name);
  if (existingTables.length > 0) {
    const identifiers = existingTables.map((tableName) => `"${tableName}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`);
  }

  await pool.query(`
    INSERT INTO roles (code, display_name)
    VALUES
      ('researcher', 'Researcher'),
      ('reviewer', 'Reviewer'),
      ('approver', 'Approver'),
      ('resource_manager', 'Resource Manager'),
      ('finance_clerk', 'Finance Clerk'),
      ('administrator', 'Administrator')
    ON CONFLICT (code) DO NOTHING
  `);
};

export const createIntegrationDatabase = async () => {
  const config = await buildConfigFromDatabaseUrl();
  const connectionConfig = {
    host: config.database.host,
    port: config.database.port,
    user: config.database.user,
    password: config.database.password,
    database: config.database.database,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false
  };
  const pool = new Pool(connectionConfig);
  const lockPool = new Pool(connectionConfig);
  const lockClient: PoolClient = await lockPool.connect();
  await lockClient.query('SELECT pg_advisory_lock($1)', [integrationLockKey]);

  await wipeData(pool);

  return {
    pool,
    config,
    uploadRoot: config.uploads.rootDir,
    buildApiApp: async () => buildApp({ config }),
    seedUser: async (input: { username: string; password: string; roles: string[] }) => {
      const passwordHash = await hashPassword(input.password);
      const inserted = await pool.query<{ id: string }>(
        `
        INSERT INTO users (username, password_hash)
        VALUES ($1, $2)
        RETURNING id
        `,
        [input.username, passwordHash]
      );
      const userId = String(inserted.rows[0]?.id);
      for (const roleCode of input.roles) {
        await pool.query(
          `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, id FROM roles WHERE code = $2
          `,
          [userId, roleCode]
        );
      }
      return { userId };
    },
    cleanup: async () => {
      await closePool();
      await wipeData(pool);
      await pool.end();
      await lockClient.query('SELECT pg_advisory_unlock($1)', [integrationLockKey]);
      lockClient.release();
      await lockPool.end();
    }
  };
};
