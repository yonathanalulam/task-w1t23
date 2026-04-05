import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('researcher routes integration', () => {
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

    await context.seedUser({ username: 'researcher1', password: 'ResearcherPass1!', roles: ['researcher'] });
    await context.seedUser({ username: 'researcher2', password: 'ResearcherPass1!', roles: ['researcher'] });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!' }
    });

    const researcher1Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'researcher1', password: 'ResearcherPass1!' }
    });

    const researcher2Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'researcher2', password: 'ResearcherPass1!' }
    });

    return {
      context,
      app,
      adminCookie: String(Array.isArray(adminLogin.headers['set-cookie']) ? adminLogin.headers['set-cookie'][0] : adminLogin.headers['set-cookie']).split(';')[0],
      researcher1Cookie: String(Array.isArray(researcher1Login.headers['set-cookie']) ? researcher1Login.headers['set-cookie'][0] : researcher1Login.headers['set-cookie']).split(';')[0],
      researcher2Cookie: String(Array.isArray(researcher2Login.headers['set-cookie']) ? researcher2Login.headers['set-cookie'][0] : researcher2Login.headers['set-cookie']).split(';')[0]
    };
  };

  const createPolicy = async (adminCookie: string, input?: Partial<{ title: string; periodStart: string; periodEnd: string }>) => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      payload: {
        title: input?.title ?? 'Policy A',
        periodStart: input?.periodStart ?? '2026-01-01',
        periodEnd: input?.periodEnd ?? '2026-12-31',
        submissionDeadlineAt: '2030-06-01T00:00:00.000Z',
        graceHours: 24,
        annualCapAmount: '5000.00',
        templates: [{ templateKey: 'budget', label: 'Budget', isRequired: true }]
      }
    });

    return response.json().policy.id as string;
  };

  const createApplication = async (cookie: string, policyId: string, title: string) => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: {
        'content-type': 'application/json',
        cookie
      },
      payload: {
        policyId,
        title,
        requestedAmount: '100.00'
      }
    });

    return response.json().application.id as string;
  };

  const addRequiredLink = async (cookie: string, applicationId: string) => {
    return app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: {
        'content-type': 'application/json',
        cookie
      },
      payload: {
        documentKey: 'budget',
        label: 'Budget',
        externalUrl: 'https://example.org/budget'
      }
    });
  };

  it('returns 401 for unauthenticated researcher submit flow access', async () => {
    const { adminCookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json' },
      payload: {
        policyId,
        title: 'Seed Grant',
        requestedAmount: '100.00'
      }
    });

    expect(createResponse.statusCode).toBe(401);
  }, integrationTimeout);

  it('submits an application end-to-end with real policy, document, and session data', async () => {
    const { adminCookie, researcher1Cookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const applicationId = await createApplication(researcher1Cookie, policyId, 'Seed Grant');

    const linkResponse = await addRequiredLink(researcher1Cookie, applicationId);
    expect(linkResponse.statusCode).toBe(201);

    const submitResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/submit`,
      headers: { cookie: researcher1Cookie }
    });

    expect(submitResponse.statusCode).toBe(200);
    expect(submitResponse.json().application.status).toBe('SUBMITTED_ON_TIME');
  }, integrationTimeout);

  it('returns 403 when another researcher accesses someone else application', async () => {
    const { adminCookie, researcher1Cookie, researcher2Cookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const applicationId = await createApplication(researcher1Cookie, policyId, 'Private Grant');

    const response = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}`,
      headers: { cookie: researcher2Cookie }
    });

    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns 409 when creating an overlapping-period duplicate application', async () => {
    const { adminCookie, researcher1Cookie } = await boot();
    const policyA = await createPolicy(adminCookie, { title: 'Policy A', periodStart: '2026-01-01', periodEnd: '2026-12-31' });
    const policyB = await createPolicy(adminCookie, { title: 'Policy B', periodStart: '2026-06-01', periodEnd: '2027-05-31' });

    const firstApplicationId = await createApplication(researcher1Cookie, policyA, 'Initial Grant');
    await addRequiredLink(researcher1Cookie, firstApplicationId);
    const firstSubmit = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${firstApplicationId}/submit`,
      headers: { cookie: researcher1Cookie }
    });
    expect(firstSubmit.statusCode).toBe(200);

    const secondCreate = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: {
        'content-type': 'application/json',
        cookie: researcher1Cookie
      },
      payload: {
        policyId: policyB,
        title: 'Overlapping Grant',
        requestedAmount: '100.00'
      }
    });

    expect(secondCreate.statusCode).toBe(409);
    const body = secondCreate.json();
    expect(body.error?.code ?? body.code).toBe('DUPLICATE_APPLICATION');
  }, integrationTimeout);
});
