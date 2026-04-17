import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('admin routes integration (true no-mock)', () => {
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

  const extractCookie = (header: string | string[] | undefined) =>
    String(Array.isArray(header) ? header[0] : header ?? '').split(';')[0] ?? '';

  const boot = async () => {
    context = await createIntegrationDatabase();
    app = await context.buildApiApp();

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/bootstrap-admin',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!', bootstrapSecret: 'test-bootstrap-secret' }
    });

    await context.seedUser({ username: 'researcher1', password: 'ResearcherPass1!', roles: ['researcher'] });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!' }
    });

    const researcherLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'researcher1', password: 'ResearcherPass1!' }
    });

    return {
      adminCookie: extractCookie(adminLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie'])
    };
  };

  it('returns 401 for unauthenticated GET /api/v1/admin/ping', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/admin/ping' });
    expect(response.statusCode).toBe(401);
  }, integrationTimeout);

  it('returns 403 for non-admin GET /api/v1/admin/ping', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/admin/ping',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns {ok:true,area:"admin"} for administrator on GET /api/v1/admin/ping', async () => {
    const { adminCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/admin/ping',
      headers: { cookie: adminCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, area: 'admin' });
  }, integrationTimeout);

  it('returns both hold lists on GET /api/v1/admin/upload-holds for administrator', async () => {
    const { adminCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/admin/upload-holds',
      headers: { cookie: adminCookie }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.researcherDocumentHolds)).toBe(true);
    expect(Array.isArray(body.journalAttachmentHolds)).toBe(true);
  }, integrationTimeout);

  it('returns 404 on POST /api/v1/admin/upload-holds/researcher-documents/:versionId/release for unknown version', async () => {
    const { adminCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/admin/upload-holds/researcher-documents/00000000-0000-0000-0000-000000000000/release',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { note: 'Release unknown for test coverage' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error?.code ?? response.json().code).toBe('DOCUMENT_VERSION_NOT_FOUND');
  }, integrationTimeout);

  it('returns 404 on POST /api/v1/admin/upload-holds/journal-attachments/:versionId/release for unknown version', async () => {
    const { adminCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/admin/upload-holds/journal-attachments/00000000-0000-0000-0000-000000000000/release',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { note: 'Release unknown journal attachment for test coverage' }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error?.code ?? response.json().code).toBe('JOURNAL_ATTACHMENT_VERSION_NOT_FOUND');
  }, integrationTimeout);

  it('returns 400 on release endpoints when note is missing', async () => {
    const { adminCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/admin/upload-holds/researcher-documents/00000000-0000-0000-0000-000000000000/release',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {}
    });
    expect(response.statusCode).toBe(400);
  }, integrationTimeout);
});
