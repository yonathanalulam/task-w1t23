import { describe, expect, it } from 'vitest';
import { createLoggerConfig } from '../src/lib/logger.js';

describe('logger redaction baseline', () => {
  it('contains sensitive fields for masking', () => {
    const logger = createLoggerConfig({
      nodeEnv: 'test',
      port: 0,
      logLevel: 'silent',
      publicApiBase: '/api/v1',
      sessionSecret: 'test_secret',
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

    const paths = 'redact' in logger && typeof logger.redact === 'object' && logger.redact ? logger.redact.paths : [];
    expect(paths).toContain('body.password');
    expect(paths).toContain('body.routingNumber');
    expect(paths).toContain('body.bankAccountNumber');
  });
});
