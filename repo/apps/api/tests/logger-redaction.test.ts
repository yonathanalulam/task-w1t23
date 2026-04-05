import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createLoggerConfig } from '../src/lib/logger.js';

const buildConfig = () => ({
  nodeEnv: 'test',
  port: 0,
  logLevel: 'info',
  publicApiBase: '/api/v1',
  sessionSecret: 'test_secret',
  encryptionKey: 'enc-key',
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
});

describe('logger redaction baseline', () => {
  it('contains expanded sensitive field paths for masking', () => {
    const logger = createLoggerConfig(buildConfig());

    const redact = (logger as { redact?: { paths?: string[] } }).redact;
    const paths = Array.isArray(redact?.paths) ? redact.paths : [];
    expect(paths).toContain('req.headers.authorization');
    expect(paths).toContain('req.headers.cookie');
    expect(paths).toContain('body.password');
    expect(paths).toContain('body.token');
    expect(paths).toContain('body.secret');
    expect(paths).toContain('body.account');
    expect(paths).toContain('body.routingNumber');
    expect(paths).toContain('body.bankRoutingNumber');
    expect(paths).toContain('body.accountNumber');
    expect(paths).toContain('body.bankAccountNumber');
    expect(paths).toContain('*.authorization');
    expect(paths).toContain('*.cookie');
    expect(paths).toContain('*.apiKey');
    expect(paths).toContain('*.accessKey');
    expect(paths).toContain('*.account');
    expect(paths).toContain('*.routingNumber');
    expect(paths).toContain('*.bankRoutingNumber');
    expect(paths).toContain('*.accountNumber');
    expect(paths).toContain('*.bankAccountNumber');
  });

  it('redacts deeply nested payload values at runtime', () => {
    const output: string[] = [];
    const stream = {
      write(chunk: string) {
        output.push(chunk);
      }
    };
    const logger = pino(createLoggerConfig(buildConfig()) as never, stream as never);

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=secret-cookie',
          'x-api-key': 'header-key'
        }
      },
      body: {
        password: 'super-secret',
        nested: {
          token: 'nested-token',
          secret: 'nested-secret',
          authorization: 'nested-auth',
          cookie: 'nested-cookie',
          apiKey: 'nested-api-key',
          accessKey: 'nested-access-key',
          account: 'nested-account',
          accountNumber: 'nested-account-number',
          routingNumber: 'nested-routing-number',
          bankRoutingNumber: 'nested-bank-routing-number',
          bankAccountNumber: 'nested-bank-account-number'
        }
      }
    }, 'runtime redaction test');

    const serialized = output.join('');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toContain('super-secret');
    expect(serialized).not.toContain('secret-token');
    expect(serialized).not.toContain('secret-cookie');
    expect(serialized).not.toContain('nested-token');
    expect(serialized).not.toContain('nested-secret');
    expect(serialized).not.toContain('nested-auth');
    expect(serialized).not.toContain('nested-cookie');
    expect(serialized).not.toContain('nested-api-key');
    expect(serialized).not.toContain('nested-access-key');
    expect(serialized).not.toContain('nested-account');
    expect(serialized).not.toContain('nested-account-number');
    expect(serialized).not.toContain('nested-routing-number');
    expect(serialized).not.toContain('nested-bank-routing-number');
    expect(serialized).not.toContain('nested-bank-account-number');
  });
});
