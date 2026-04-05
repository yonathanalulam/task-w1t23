import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { recommendationsRoutes } from '../src/modules/recommendations/routes.js';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';

describe('recommendations routes RBAC boundaries', () => {
  const apps: Array<Awaited<ReturnType<typeof buildTestApp>>> = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  const buildTestApp = async () => {
    const app = Fastify({ logger: false });

    app.decorate('audit', {
      write: vi.fn(async () => undefined)
    });

    const recommendationsService = {
      listResearcherRecommendations: vi.fn(async () => ({
        preferences: {
          userId: 'researcher-1',
          preferredDisciplines: [],
          preferredKeywords: [],
          preferredPublishers: [],
          preferredResourceTypes: [],
          preferredLocations: [],
          updatedAt: new Date()
        },
        feedback: [],
        recommendations: []
      })),
      getResearcherPreferences: vi.fn(async () => ({
        userId: 'researcher-1',
        preferredDisciplines: [],
        preferredKeywords: [],
        preferredPublishers: [],
        preferredResourceTypes: [],
        preferredLocations: [],
        updatedAt: new Date()
      })),
      updateResearcherPreferences: vi.fn(async () => ({
        userId: 'researcher-1',
        preferredDisciplines: [],
        preferredKeywords: [],
        preferredPublishers: [],
        preferredResourceTypes: [],
        preferredLocations: [],
        updatedAt: new Date()
      })),
      listResearcherFeedback: vi.fn(async () => []),
      setResearcherFeedback: vi.fn(async () => ({
        id: 'feedback-1',
        userId: 'researcher-1',
        targetType: 'RESOURCE',
        targetId: '33333333-3333-4333-8333-333333333333',
        action: 'LIKE',
        createdAt: new Date(),
        updatedAt: new Date()
      }))
    };

    app.decorate('recommendationsService', recommendationsService);

    app.addHook('onRequest', async (request) => {
      const userId = request.headers['x-test-user-id'];
      const roles = String(request.headers['x-test-roles'] ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (!userId || roles.length === 0) {
        request.auth = null;
        return;
      }

      request.auth = {
        userId: String(userId),
        username: 'tester',
        roles: roles as never,
        sessionId: 'session-1'
      };
    });

    await app.register(recommendationsRoutes, { prefix: '/recommendations' });
    registerErrorEnvelope(app);

    apps.push(app);
    return { app, recommendationsService };
  };

  it('returns 401 for unauthenticated recommendations request', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/recommendations/researcher' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for non-researcher role on recommendations routes', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/recommendations/researcher',
      headers: {
        'x-test-user-id': 'manager-1',
        'x-test-roles': 'resource_manager'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows researcher role to fetch recommendations and set feedback', async () => {
    const { app, recommendationsService } = await buildTestApp();

    const listResponse = await app.inject({
      method: 'GET',
      url: '/recommendations/researcher',
      headers: {
        'x-test-user-id': 'researcher-1',
        'x-test-roles': 'researcher'
      }
    });

    const feedbackResponse = await app.inject({
      method: 'POST',
      url: '/recommendations/researcher/feedback',
      headers: {
        'x-test-user-id': 'researcher-1',
        'x-test-roles': 'researcher',
        'content-type': 'application/json'
      },
      payload: {
        targetType: 'RESOURCE',
        targetId: '33333333-3333-4333-8333-333333333333',
        action: 'LIKE'
      }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(feedbackResponse.statusCode).toBe(201);
    expect(recommendationsService.listResearcherRecommendations).toHaveBeenCalled();
    expect(recommendationsService.setResearcherFeedback).toHaveBeenCalled();
  });
});
