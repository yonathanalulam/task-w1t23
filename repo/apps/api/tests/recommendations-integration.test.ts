import { afterEach, describe, expect, it } from 'vitest';
import { createIntegrationDatabase } from './helpers/db-integration.js';

describe('recommendations routes integration (true no-mock)', () => {
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

    return {
      adminCookie: extractCookie(adminLogin.headers['set-cookie']),
      researcherCookie: extractCookie(researcherLogin.headers['set-cookie']),
      reviewerCookie: extractCookie(reviewerLogin.headers['set-cookie'])
    };
  };

  it('rejects unauthenticated GET /api/v1/recommendations/researcher', async () => {
    await boot();
    const response = await app!.inject({ method: 'GET', url: '/api/v1/recommendations/researcher' });
    expect(response.statusCode).toBe(401);
  }, integrationTimeout);

  it('returns 403 when reviewer accesses GET /api/v1/recommendations/researcher', async () => {
    const { reviewerCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/recommendations/researcher',
      headers: { cookie: reviewerCookie }
    });
    expect(response.statusCode).toBe(403);
  }, integrationTimeout);

  it('returns structured recommendations envelope for authenticated researcher via GET /api/v1/recommendations/researcher', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/recommendations/researcher',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.preferences).toBeDefined();
    expect(Array.isArray(body.feedback)).toBe(true);
    expect(Array.isArray(body.recommendations)).toBe(true);
  }, integrationTimeout);

  it('supports preferences GET/PUT via /api/v1/recommendations/researcher/preferences', async () => {
    const { researcherCookie } = await boot();

    const initial = await app!.inject({
      method: 'GET',
      url: '/api/v1/recommendations/researcher/preferences',
      headers: { cookie: researcherCookie }
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json().preferences).toBeDefined();

    const update = await app!.inject({
      method: 'PUT',
      url: '/api/v1/recommendations/researcher/preferences',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: {
        preferredDisciplines: ['biology', 'chemistry'],
        preferredKeywords: ['genomics'],
        preferredPublishers: ['Example Press'],
        preferredResourceTypes: ['ROOM'],
        preferredLocations: ['Main Campus']
      }
    });
    expect(update.statusCode).toBe(200);
    const saved = update.json().preferences;
    expect(saved.preferredDisciplines).toContain('biology');
    expect(saved.preferredResourceTypes).toContain('ROOM');
  }, integrationTimeout);

  it('lists empty feedback via GET /api/v1/recommendations/researcher/feedback when no feedback exists', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'GET',
      url: '/api/v1/recommendations/researcher/feedback',
      headers: { cookie: researcherCookie }
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().feedback)).toBe(true);
  }, integrationTimeout);

  it('records feedback via POST /api/v1/recommendations/researcher/feedback for existing journal target', async () => {
    const { adminCookie, researcherCookie } = await boot();

    const journalResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/journal-governance/journals',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      payload: { title: 'Target Journal' }
    });
    expect(journalResponse.statusCode).toBe(201);
    const journalId = journalResponse.json().journal.id as string;

    const feedbackResponse = await app!.inject({
      method: 'POST',
      url: '/api/v1/recommendations/researcher/feedback',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: {
        targetType: 'JOURNAL',
        targetId: journalId,
        action: 'LIKE'
      }
    });
    expect(feedbackResponse.statusCode).toBe(201);
    expect(feedbackResponse.json().feedback.targetId).toBe(journalId);
    expect(feedbackResponse.json().feedback.action).toBe('LIKE');
  }, integrationTimeout);

  it('returns 404 when posting feedback for a non-existent journal target', async () => {
    const { researcherCookie } = await boot();
    const response = await app!.inject({
      method: 'POST',
      url: '/api/v1/recommendations/researcher/feedback',
      headers: { 'content-type': 'application/json', cookie: researcherCookie },
      payload: {
        targetType: 'JOURNAL',
        targetId: '00000000-0000-0000-0000-000000000000',
        action: 'LIKE'
      }
    });
    expect(response.statusCode).toBe(404);
  }, integrationTimeout);
});
