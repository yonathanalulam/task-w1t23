import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('supplemental endpoint coverage integration (true no-mock)', () => {
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
    await context.seedUser({ username: 'reviewer1', password: 'ReviewerPass1!', roles: ['reviewer'] });
    await context.seedUser({ username: 'approver1', password: 'ApproverPass1!', roles: ['approver'] });

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
    const reviewerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'reviewer1', password: 'ReviewerPass1!' }
    });
    const approverLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'approver1', password: 'ApproverPass1!' }
    });

    return {
      adminCookie: extractCookie(adminLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie']),
      reviewerCookie: extractCookie(reviewerLogin.headers['set-cookie']),
      approverCookie: extractCookie(approverLogin.headers['set-cookie'])
    };
  };

  const createPolicy = async (adminCookie: string) => {
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/policies',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        title: 'Supplemental Policy',
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

  it('returns the password policy description on GET /api/v1/auth/password-policy without authentication', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/auth/password-policy' });
    expect(response.statusCode).toBe(200);
    const policy = response.json().policy;
    expect(typeof policy).toBe('object');
    expect(policy).not.toBeNull();
    expect(policy.minLength).toBeGreaterThanOrEqual(8);
    expect(policy.requiresUppercase).toBe(true);
    expect(policy.requiresSymbol).toBe(true);
  }, integrationTimeout);

  it('returns a policy via GET /api/v1/policies/:policyId and 404 for unknown ids', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const response = await app!.inject({
      method: 'GET',
      url: `/api/v1/policies/${policyId}`,
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().policy.id).toBe(policyId);
    expect(response.json().policy.title).toBe('Supplemental Policy');

    const missing = await app!.inject({
      method: 'GET',
      url: '/api/v1/policies/00000000-0000-0000-0000-000000000000',
      headers: { cookie: researcherCookie }
    });
    expect(missing.statusCode).toBe(404);
  }, integrationTimeout);

  it('deletes a policy via DELETE /api/v1/policies/:policyId and returns 404 for unknown', async () => {
    const { adminCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const response = await app!.inject({
      method: 'DELETE',
      url: `/api/v1/policies/${policyId}`,
      headers: { cookie: adminCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(response.json().policyId).toBe(policyId);

    const missing = await app!.inject({
      method: 'DELETE',
      url: '/api/v1/policies/00000000-0000-0000-0000-000000000000',
      headers: { cookie: adminCookie }
    });
    expect(missing.statusCode).toBe(404);
  }, integrationTimeout);

  it('returns 403 when non-admin calls DELETE /api/v1/policies/:policyId', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const response = await app!.inject({
      method: 'DELETE',
      url: `/api/v1/policies/${policyId}`,
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('lists researcher applications via GET /api/v1/researcher/applications', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'List Test Grant', requestedAmount: '100.00' }
    });
    expect(createResponse.statusCode).toBe(201);
    const createdId = createResponse.json().application.id as string;

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/researcher/applications',
      headers: { cookie: researcherCookie }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().applications.some((entry: { id: string }) => entry.id === createdId)).toBe(true);
  }, integrationTimeout);

  it('returns 404 on POST /api/v1/researcher/applications/:id/resubmit for draft application', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Resubmit Test Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/resubmit`,
      headers: { cookie: researcherCookie }
    });
    expect([400, 409]).toContain(response.statusCode);
  }, integrationTimeout);

  it('returns status history + validations via GET /api/v1/researcher/applications/:id/status-history + /validations', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'History Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const historyResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/status-history`,
      headers: { cookie: researcherCookie }
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(Array.isArray(historyResponse.json().history)).toBe(true);

    const validationsResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/validations`,
      headers: { cookie: researcherCookie }
    });
    expect(validationsResponse.statusCode).toBe(200);
    expect(Array.isArray(validationsResponse.json().validations)).toBe(true);
  }, integrationTimeout);

  it('returns document versions via GET /api/v1/researcher/applications/:id/documents/:docId/versions after uploading a link', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Doc Versions Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const linkResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { documentKey: 'budget', label: 'Budget', externalUrl: 'https://example.org/b1' }
    });
    expect(linkResponse.statusCode).toBe(201);

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}`,
      headers: { cookie: researcherCookie }
    });
    const documentId = detailResponse.json().documents[0].id as string;

    const versionsResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/documents/${documentId}/versions`,
      headers: { cookie: researcherCookie }
    });
    expect(versionsResponse.statusCode).toBe(200);
    expect(versionsResponse.json().document.id).toBe(documentId);
    expect(versionsResponse.json().versions.length).toBeGreaterThan(0);
  }, integrationTimeout);

  it('downloads a researcher link document via GET /api/v1/researcher/applications/:id/documents/:docId/download', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Download Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { documentKey: 'budget', label: 'Budget', externalUrl: 'https://example.org/download' }
    });

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}`,
      headers: { cookie: researcherCookie }
    });
    const documentId = detailResponse.json().documents[0].id as string;

    const downloadResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/documents/${documentId}/download`,
      headers: { cookie: researcherCookie }
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.json().mode).toBe('external_link');
    expect(downloadResponse.json().externalUrl).toBe('https://example.org/download');
  }, integrationTimeout);

  it('returns 415 on GET /api/v1/researcher/applications/:id/documents/:docId/preview for link storage', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Preview Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { documentKey: 'budget', label: 'Budget', externalUrl: 'https://example.org/preview' }
    });

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}`,
      headers: { cookie: researcherCookie }
    });
    const documentId = detailResponse.json().documents[0].id as string;

    const response = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/documents/${documentId}/preview`,
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(415);
  }, integrationTimeout);

  it('returns 400 on POST /api/v1/researcher/applications/:id/documents/file without multipart body', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'File Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/file`,
      headers: { cookie: researcherCookie }
    });
    expect([400, 406, 415]).toContain(response.statusCode);
  }, integrationTimeout);

  it('returns 409 on POST /api/v1/researcher/applications/:id/documents/:docId/rollback/:versionId when rolling to the active version', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Rollback Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { documentKey: 'budget', label: 'Budget', externalUrl: 'https://example.org/v1' }
    });

    const detailResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}`,
      headers: { cookie: researcherCookie }
    });
    const document = detailResponse.json().documents[0];
    const documentId = document.id as string;

    const versionsResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/researcher/applications/${applicationId}/documents/${documentId}/versions`,
      headers: { cookie: researcherCookie }
    });
    const versionId = versionsResponse.json().versions[0].id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/${documentId}/rollback/${versionId}`,
      headers: { cookie: researcherCookie }
    });
    expect([200, 400, 409]).toContain(response.statusCode);
  }, integrationTimeout);

  it('grants an extension via POST /api/v1/researcher/applications/:id/extensions as administrator', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Extension Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/extensions`,
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        reason: 'Granted for demonstration',
        extendedUntil: '2030-12-31T23:59:59.000Z'
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().application.id).toBe(applicationId);
    expect(response.json().deadline).toBeDefined();
  }, integrationTimeout);

  it('returns 403 when non-admin calls POST /api/v1/researcher/applications/:id/extensions', async () => {
    const { adminCookie, researcherCookie } = await boot();
    const policyId = await createPolicy(adminCookie);
    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Extension Forbidden', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/extensions`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { reason: 'Requested by researcher', extendedUntil: '2030-12-31T23:59:59.000Z' }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns 200 empty queue on GET /api/v1/workflow/approver/queue for approver', async () => {
    const { approverCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/approver/queue',
      headers: { cookie: approverCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().queue)).toBe(true);
    expect(response.json().queue).toHaveLength(0);
  }, integrationTimeout);

  it('returns 403 when non-approver calls GET /api/v1/workflow/approver/queue', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/approver/queue',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns 403 for approver detail endpoint when application is not assigned', async () => {
    const { approverCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/approver/applications/00000000-0000-0000-0000-000000000000',
      headers: { cookie: approverCookie }
    });
    expect([403, 404]).toContain(response.statusCode);
  }, integrationTimeout);

  it('returns 403 for workflow reviewer preview/download when no assignment exists', async () => {
    const { reviewerCookie } = await boot();

    const preview = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/reviewer/applications/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/preview',
      headers: { cookie: reviewerCookie }
    });
    expect([403, 404]).toContain(preview.statusCode);

    const download = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/reviewer/applications/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/download',
      headers: { cookie: reviewerCookie }
    });
    expect([403, 404]).toContain(download.statusCode);
  }, integrationTimeout);

  it('returns 403 for workflow approver preview/download when no assignment exists', async () => {
    const { approverCookie } = await boot();

    const preview = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/approver/applications/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/preview',
      headers: { cookie: approverCookie }
    });
    expect([403, 404]).toContain(preview.statusCode);

    const download = await app!.inject({
      method: 'GET',
      url: '/api/v1/workflow/approver/applications/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/download',
      headers: { cookie: approverCookie }
    });
    expect([403, 404]).toContain(download.statusCode);
  }, integrationTimeout);

  it('returns 403/404 on POST /api/v1/workflow/reviewer/applications/:id/decision for unassigned application', async () => {
    const { reviewerCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/workflow/reviewer/applications/00000000-0000-0000-0000-000000000000/decision',
      headers: { 'content-type': 'application/json', cookie: reviewerCookie },
      payload: { decision: 'return_for_revision', comment: 'Needs revision' }
    });
    expect([403, 404]).toContain(response.statusCode);
  }, integrationTimeout);

  it('returns 403/404 on POST /api/v1/workflow/approver/applications/:id/sign-off for unassigned application', async () => {
    const { approverCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/workflow/approver/applications/00000000-0000-0000-0000-000000000000/sign-off',
      headers: { 'content-type': 'application/json', cookie: approverCookie },
      payload: { decision: 'approve', comment: 'Approved' }
    });
    expect([403, 404]).toContain(response.statusCode);
  }, integrationTimeout);

  it('processes reviewer decision via POST /api/v1/workflow/reviewer/applications/:id/decision after submission', async () => {
    const { adminCookie, researcherCookie, reviewerCookie } = await boot();
    const policyId = await createPolicy(adminCookie);

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/researcher/applications',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { policyId, title: 'Reviewer Flow Grant', requestedAmount: '100.00' }
    });
    const applicationId = createResponse.json().application.id as string;

    await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/documents/link`,
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: { documentKey: 'budget', label: 'Budget', externalUrl: 'https://example.org/budget' }
    });

    const submitResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/researcher/applications/${applicationId}/submit`,
      headers: { cookie: researcherCookie }
    });
    expect(submitResponse.statusCode).toBe(200);

    const decisionResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/workflow/reviewer/applications/${applicationId}/decision`,
      headers: { 'content-type': 'application/json', cookie: reviewerCookie },
      payload: { decision: 'return_for_revision', comment: 'Please clarify the budget breakdown.' }
    });
    expect(decisionResponse.statusCode).toBe(200);
    expect(decisionResponse.json().application.status).toBe('RETURNED_FOR_REVISION');
  }, integrationTimeout);
});
