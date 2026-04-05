import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('policies routes integration', () => {
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

    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/bootstrap-admin',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!', bootstrapSecret: 'test-bootstrap-secret' }
    });

    await context.seedUser({ username: 'researcher', password: 'ResearcherPass1!', roles: ['researcher'] });

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
      payload: { username: 'researcher', password: 'ResearcherPass1!' }
    });

    return {
      context,
      app,
      adminCookie: String(Array.isArray(adminLogin.headers['set-cookie']) ? adminLogin.headers['set-cookie'][0] : adminLogin.headers['set-cookie']).split(';')[0],
      researcherCookie: String(Array.isArray(researcherLogin.headers['set-cookie']) ? researcherLogin.headers['set-cookie'][0] : researcherLogin.headers['set-cookie']).split(';')[0]
    };
  };

  const policyPayload = {
    title: 'Policy A',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    submissionDeadlineAt: '2026-06-01T00:00:00.000Z',
    graceHours: 24,
    annualCapAmount: '1000.00',
    templates: [{ templateKey: 'budget', label: 'Budget', isRequired: true }]
  };

  it('allows authenticated viewing of policies', async () => {
    const { app, researcherCookie } = await boot();
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/policies',
      headers: { cookie: researcherCookie }
    });

    expect(response.statusCode).toBe(200);
  }, integrationTimeout);

  it('returns 403 when non-admin creates a policy', async () => {
    const { app, researcherCookie } = await boot();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: {
        'content-type': 'application/json',
        cookie: researcherCookie
      },
      payload: policyPayload
    });

    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns 403 when non-admin updates a policy', async () => {
    const { app, adminCookie, researcherCookie } = await boot();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      payload: policyPayload
    });
    const policyId = created.json().policy.id;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/policies/${policyId}`,
      headers: {
        'content-type': 'application/json',
        cookie: researcherCookie
      },
      payload: { ...policyPayload, isActive: true }
    });

    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('allows admin creation and update of policies', async () => {
    const { app, adminCookie } = await boot();

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      payload: policyPayload
    });

    const policyId = createResponse.json().policy.id;
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/v1/policies/${policyId}`,
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      payload: { ...policyPayload, isActive: true }
    });

    expect(createResponse.statusCode).toBe(201);
    expect(updateResponse.statusCode).toBe(200);
  }, integrationTimeout);
});
