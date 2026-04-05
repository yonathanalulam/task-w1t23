import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  const suffix = Math.random().toString(36).slice(2, 10);

  const appPromise = buildApp({
    config: {
      nodeEnv: 'test',
      port: 0,
      logLevel: 'silent',
      publicApiBase: '/api/v1',
      sessionSecret: `test_session_secret_${suffix}`,
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
        user: `u_${suffix}`,
        password: `p_${suffix}`,
        database: `d_${suffix}`,
        ssl: false
      }
    }
  });

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it('returns service health with envelope-friendly structure', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health'
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('service', 'rrga-api');
    expect(body).toHaveProperty('database.status');
    expect(['ok', 'degraded']).toContain(body.status);
  });

  it('returns 404 with standardized error envelope for unknown routes', async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/not-a-route'
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty('error.code', 'ROUTE_NOT_FOUND');
  });
});
