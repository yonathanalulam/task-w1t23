import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('workflow routes integration', () => {
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

  const extractCookie = (header: string | string[] | undefined) => String(Array.isArray(header) ? header[0] : header ?? '').split(';')[0] ?? '';

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
    await context.seedUser({ username: 'reviewer1', password: 'ReviewerPass1!', roles: ['reviewer'] });

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

    const reviewer1Login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'reviewer1', password: 'ReviewerPass1!' }
    });

    return {
      context,
      app,
      adminCookie: extractCookie(adminLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie']),
      reviewer1Cookie: extractCookie(reviewer1Login.headers['set-cookie'])
    };
  };

  const createPolicy = async (adminCookie: string) => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie
      },
      payload: {
        title: 'Workflow Policy',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        submissionDeadlineAt: '2030-06-01T00:00:00.000Z',
        graceHours: 24,
        annualCapAmount: '5000.00',
        approvalLevelsRequired: 1,
        templates: [{ templateKey: 'budget', label: 'Budget', isRequired: true }]
      }
    });

    return response.json().policy.id as string;
  };

  const createSubmittedApplication = async (researcherCookie: string, policyId: string) => {
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: {
        'content-type': 'application/json',
        cookie: researcherCookie
      },
      payload: {
        policyId,
        title: 'Workflow Application',
        requestedAmount: '250.00'
      }
    });
    const applicationId = createResponse.json().application.id as string;

    const linkResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: {
        'content-type': 'application/json',
        cookie: researcherCookie
      },
      payload: {
        documentKey: 'budget',
        label: 'Budget',
        externalUrl: 'https://example.org/budget'
      }
    });
    expect(linkResponse.statusCode).toBe(201);

    const submitResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/submit`,
      headers: { cookie: researcherCookie }
    });
    expect(submitResponse.statusCode).toBe(200);

    return applicationId;
  };

  it('preserves persisted reviewer access after reviewer roster mutation', async () => {
    const { context, adminCookie, researcherCookie, reviewer1Cookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const applicationId = await createSubmittedApplication(researcherCookie, policyId);

    const initialQueue = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/reviewer/queue',
      headers: { cookie: reviewer1Cookie }
    });

    expect(initialQueue.statusCode).toBe(200);
    expect(initialQueue.json().queue).toHaveLength(1);

    await context.seedUser({ username: 'reviewer2', password: 'ReviewerPass1!', roles: ['reviewer'] });
    await context.seedUser({ username: 'reviewer3', password: 'ReviewerPass1!', roles: ['reviewer'] });

    await context.pool.query(
      `
      DELETE FROM user_roles
      WHERE user_id = (SELECT id FROM users WHERE username = 'reviewer3')
        AND role_id = (SELECT id FROM roles WHERE code = 'reviewer')
      `
    );

    const reviewer2Login = await app!.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'reviewer2', password: 'ReviewerPass1!' }
    });
    const reviewer2Cookie = extractCookie(reviewer2Login.headers['set-cookie']);

    const assignedDetail = await app!.inject({
      method: 'GET',
      url: `/api/v1/workflow/reviewer/applications/${applicationId}`,
      headers: { cookie: reviewer1Cookie }
    });
    expect(assignedDetail.statusCode).toBe(200);

    const newReviewerDetail = await app!.inject({
      method: 'GET',
      url: `/api/v1/workflow/reviewer/applications/${applicationId}`,
      headers: { cookie: reviewer2Cookie }
    });
    expect(newReviewerDetail.statusCode).toBe(403);

    const newReviewerQueue = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/reviewer/queue',
      headers: { cookie: reviewer2Cookie }
    });
    expect(newReviewerQueue.statusCode).toBe(200);
    expect(newReviewerQueue.json().queue).toHaveLength(0);
  }, integrationTimeout);
});
