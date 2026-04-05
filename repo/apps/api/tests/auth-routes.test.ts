import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('auth routes integration', () => {
  const integrationTimeout = 30000;
  let context: Awaited<ReturnType<typeof createIntegrationDatabase>> | null = null;
  let app: Awaited<ReturnType<Awaited<ReturnType<typeof createIntegrationDatabase>>['buildApiApp']>> | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }

    if (context) {
      await context.cleanup();
      context = null;
    }
  });

  const boot = async () => {
    context = await createIntegrationDatabase();
    app = await context.buildApiApp();
    return { context, app };
  };

  const extractCookie = (header: string | string[] | undefined) => String(Array.isArray(header) ? header[0] : header ?? '').split(';')[0] ?? '';

  it('returns 400 for invalid bootstrap-admin payload', async () => {
    const { app } = await boot();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/bootstrap-admin',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', bootstrapSecret: 'test-bootstrap-secret' }
    });

    expect(response.statusCode).toBe(400);
  }, integrationTimeout);

  it('returns 400 for invalid login payload', async () => {
    const { app } = await boot();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin' }
    });

    expect(response.statusCode).toBe(400);
  }, integrationTimeout);

  it('returns 401 for unauthenticated logout, me, and change-password', async () => {
    const { app } = await boot();

    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    const changePassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: { 'content-type': 'application/json' },
      payload: { currentPassword: 'old', nextPassword: 'NewPass1!' }
    });

    expect(logout.statusCode).toBe(401);
    expect(me.statusCode).toBe(401);
    expect(changePassword.statusCode).toBe(401);
  }, integrationTimeout);

  it('supports bootstrap, login, me, change-password, and logout session lifecycle', async () => {
    const { app } = await boot();

    const bootstrap = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/bootstrap-admin',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!', bootstrapSecret: 'test-bootstrap-secret' }
    });
    expect(bootstrap.statusCode).toBe(201);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!' }
    });
    expect(login.statusCode).toBe(200);
    const sessionCookie = extractCookie(login.headers['set-cookie']);
    expect(sessionCookie).toContain('rrga_session=');

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: String(sessionCookie) }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('admin');

    const changed = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      headers: {
        'content-type': 'application/json',
        cookie: String(sessionCookie)
      },
      payload: { currentPassword: 'AdminPass1!', nextPassword: 'AdminPass2!' }
    });
    expect(changed.statusCode).toBe(200);
    const refreshedCookie = extractCookie(changed.headers['set-cookie']);
    expect(refreshedCookie).toContain('rrga_session=');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: String(refreshedCookie) }
    });
    expect(logout.statusCode).toBe(204);

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: String(refreshedCookie) }
    });
    expect(meAfterLogout.statusCode).toBe(401);
  }, integrationTimeout);
});
