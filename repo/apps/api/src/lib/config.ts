import { readFileSync } from 'node:fs';

const toNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readSecretFromEnvOrFile = (name: string): string | undefined => {
  const directValue = process.env[name];
  if (directValue) {
    return directValue;
  }

  const filePath = process.env[`${name}_FILE`];
  if (!filePath) {
    return undefined;
  }

  return readFileSync(filePath, 'utf-8').trim();
};

const readRequiredFromEnvOrFile = (name: string): string => {
  const value = readSecretFromEnvOrFile(name);
  if (!value) {
    throw new Error(`Missing required configuration: ${name} or ${name}_FILE`);
  }

  return value;
};

const toRequiredNumber = (name: string, value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Configuration ${name} must be a number`);
  }

  return parsed;
};

export interface AppConfig {
  nodeEnv: string;
  port: number;
  logLevel: string;
  publicApiBase: string;
  sessionSecret: string;
  encryptionKey?: string;
  auth: {
    sessionCookieName: string;
    sessionTtlMinutes: number;
    lockoutMinutes: number;
    maxFailedAttempts: number;
  };
  uploads: {
    rootDir: string;
    maxBytes: number;
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
  };
}

export const loadConfig = (): AppConfig => {
  const sessionSecret = readRequiredFromEnvOrFile('APP_SESSION_SECRET');
  const encryptionKey = readSecretFromEnvOrFile('APP_ENCRYPTION_KEY');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: toNumber(process.env.PORT, 3000),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    publicApiBase: process.env.PUBLIC_API_BASE_URL ?? '/api/v1',
    sessionSecret,
    ...(encryptionKey ? { encryptionKey } : {}),
    auth: {
      sessionCookieName: process.env.APP_SESSION_COOKIE_NAME ?? 'rrga_session',
      sessionTtlMinutes: toNumber(process.env.APP_SESSION_TTL_MINUTES, 12 * 60),
      lockoutMinutes: toNumber(process.env.APP_LOCKOUT_MINUTES, 15),
      maxFailedAttempts: toNumber(process.env.APP_MAX_FAILED_ATTEMPTS, 5)
    },
    uploads: {
      rootDir: process.env.APP_UPLOAD_DIR ?? '/tmp/rrga_uploads',
      maxBytes: toNumber(process.env.APP_UPLOAD_MAX_BYTES, 200 * 1024 * 1024)
    },
    database: {
      host: readRequiredFromEnvOrFile('PGHOST'),
      port: toRequiredNumber('PGPORT', readRequiredFromEnvOrFile('PGPORT')),
      user: readRequiredFromEnvOrFile('PGUSER'),
      password: readRequiredFromEnvOrFile('PGPASSWORD'),
      database: readRequiredFromEnvOrFile('PGDATABASE'),
      ssl: process.env.PGSSL === '1'
    }
  };
};
