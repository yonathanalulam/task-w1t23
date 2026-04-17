import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('journal governance routes integration (true no-mock)', () => {
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

    await context.seedUser({ username: 'reviewer1', password: 'ReviewerPass1!', roles: ['reviewer'] });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'admin', password: 'AdminPass1!' }
    });

    const reviewerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: { username: 'reviewer1', password: 'ReviewerPass1!' }
    });

    return {
      adminCookie: extractCookie(adminLogin.headers['set-cookie']),
      reviewerCookie: extractCookie(reviewerLogin.headers['set-cookie'])
    };
  };

  it('rejects unauthenticated access to GET /api/v1/journal-governance/journals', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/journal-governance/journals' });
    expect(response.statusCode).toBe(401);
  }, integrationTimeout);

  it('rejects non-admin access to GET /api/v1/journal-governance/custom-fields', async () => {
    const { reviewerCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/journal-governance/custom-fields',
      headers: { cookie: reviewerCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('supports full journal custom-field lifecycle via POST/GET/PATCH /api/v1/journal-governance/custom-fields', async () => {
    const { adminCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/journal-governance/custom-fields',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        fieldKey: 'discipline',
        label: 'Discipline',
        fieldType: 'TEXT',
        isRequired: true,
        options: []
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const createdField = createResponse.json().field;
    expect(createdField.fieldKey).toBe('discipline');
    expect(createdField.isRequired).toBe(true);

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/journal-governance/custom-fields',
      headers: { cookie: adminCookie }
    });
    expect(listResponse.statusCode).toBe(200);
    const fields = listResponse.json().fields;
    expect(Array.isArray(fields)).toBe(true);
    expect(fields.some((entry: { id: string }) => entry.id === createdField.id)).toBe(true);

    const patchResponse = await app!.inject({
      method: 'PATCH',
      url: `/api/v1/journal-governance/custom-fields/${createdField.id}`,
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        label: 'Primary Discipline',
        fieldType: 'TEXT',
        isRequired: false,
        isActive: true,
        options: []
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().field.label).toBe('Primary Discipline');
    expect(patchResponse.json().field.isRequired).toBe(false);
  }, integrationTimeout);

  it('supports journal lifecycle via POST/GET/PATCH/DELETE /api/v1/journal-governance/journals and history endpoint', async () => {
    const { adminCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/journal-governance/journals',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        title: 'Journal of Integration Tests',
        issn: '1234-5678',
        publisher: 'Example Publisher'
      }
    });
    expect(createResponse.statusCode).toBe(201);
    const journal = createResponse.json().journal;
    expect(journal.title).toBe('Journal of Integration Tests');
    const journalId = journal.id as string;

    const listResponse = await app!.inject({
      method: 'GET',
      url: '/api/v1/journal-governance/journals',
      headers: { cookie: adminCookie }
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().journals).toHaveLength(1);

    const getResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/journal-governance/journals/${journalId}`,
      headers: { cookie: adminCookie }
    });
    expect(getResponse.statusCode).toBe(200);
    const detail = getResponse.json();
    expect(detail.journal.id).toBe(journalId);
    expect(Array.isArray(detail.history)).toBe(true);
    expect(Array.isArray(detail.attachments)).toBe(true);

    const patchResponse = await app!.inject({
      method: 'PATCH',
      url: `/api/v1/journal-governance/journals/${journalId}`,
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        title: 'Journal of Integration Tests (renamed)',
        changeComment: 'Renamed for clarity'
      }
    });
    expect(patchResponse.statusCode).toBe(200);
    expect(patchResponse.json().journal.title).toBe('Journal of Integration Tests (renamed)');

    const historyResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/journal-governance/journals/${journalId}/history`,
      headers: { cookie: adminCookie }
    });
    expect(historyResponse.statusCode).toBe(200);
    expect(Array.isArray(historyResponse.json().history)).toBe(true);
    expect(historyResponse.json().history.length).toBeGreaterThanOrEqual(2);

    const deleteResponse = await app!.inject({
      method: 'DELETE',
      url: `/api/v1/journal-governance/journals/${journalId}`,
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { changeComment: 'Duplicate entry' }
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().journal.id).toBe(journalId);
  }, integrationTimeout);

  it('supports journal link attachment + versions + download via POST /api/v1/journal-governance/journals/:id/attachments/link', async () => {
    const { adminCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/journal-governance/journals',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { title: 'Attach Journal' }
    });
    const journalId = createResponse.json().journal.id as string;

    const linkResponse = await app!.inject({
      method: 'POST',
      url: `/api/v1/journal-governance/journals/${journalId}/attachments/link`,
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: {
        attachmentKey: 'contract_2026',
        label: 'Contract 2026',
        category: 'CONTRACT',
        externalUrl: 'https://example.org/contract.pdf',
        notes: 'Signed agreement'
      }
    });
    expect(linkResponse.statusCode).toBe(201);
    const savedAttachment = linkResponse.json();
    expect(savedAttachment.attachment.attachmentKey).toBe('contract_2026');
    const attachmentId = savedAttachment.attachment.id as string;

    const versionsResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/journal-governance/journals/${journalId}/attachments/${attachmentId}/versions`,
      headers: { cookie: adminCookie }
    });
    expect(versionsResponse.statusCode).toBe(200);
    expect(versionsResponse.json().attachment.id).toBe(attachmentId);
    expect(Array.isArray(versionsResponse.json().versions)).toBe(true);
    expect(versionsResponse.json().versions.length).toBeGreaterThan(0);

    const downloadResponse = await app!.inject({
      method: 'GET',
      url: `/api/v1/journal-governance/journals/${journalId}/attachments/${attachmentId}/download`,
      headers: { cookie: adminCookie }
    });
    expect(downloadResponse.statusCode).toBe(200);
    expect(downloadResponse.json().mode).toBe('external_link');
    expect(downloadResponse.json().externalUrl).toBe('https://example.org/contract.pdf');
  }, integrationTimeout);

  it('returns 400 on POST /api/v1/journal-governance/journals/:id/attachments/file when no file is provided', async () => {
    const { adminCookie } = await boot();

    const createResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/journal-governance/journals',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { title: 'File Upload Journal' }
    });
    const journalId = createResponse.json().journal.id as string;

    const response = await app!.inject({
      method: 'POST',
      url: `/api/v1/journal-governance/journals/${journalId}/attachments/file`,
      headers: { cookie: adminCookie }
    });
    expect([400, 406, 415]).toContain(response.statusCode);
  }, integrationTimeout);
});
