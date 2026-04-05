import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminRoutes } from '../src/modules/admin/routes.js';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';

describe('admin upload hold routes', () => {
  const apps: any[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }
  });

  const buildApp = async () => {
    const app = Fastify({ logger: false });

    app.decorate('audit', {
      write: vi.fn(async () => undefined)
    });

    const researcherRepository = {
      listHeldDocumentVersions: vi.fn(async () => [{ versionId: 'doc-ver-1' }]),
      findDocumentVersionById: vi.fn(async (versionId: string) => ({ id: versionId, isAdminReviewRequired: true })),
      releaseHeldDocumentVersion: vi.fn(async () => true)
    };
    app.decorate('researcherRepository', researcherRepository);

    const journalGovernanceRepository = {
      listHeldAttachmentVersions: vi.fn(async () => [{ versionId: 'att-ver-1' }]),
      findAttachmentVersionById: vi.fn(async (versionId: string) => ({ id: versionId, isAdminReviewRequired: true })),
      releaseHeldAttachmentVersion: vi.fn(async () => true)
    };
    app.decorate('journalGovernanceRepository', journalGovernanceRepository);

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
        username: 'admin-tester',
        roles: roles as any,
        sessionId: 'session-1'
      };
    });

    await app.register(adminRoutes, { prefix: '/admin' });
    registerErrorEnvelope(app);
    apps.push(app);

    return {
      app,
      researcherRepository,
      journalGovernanceRepository
    };
  };

  it('requires administrator role for upload hold queue', async () => {
    const { app } = await buildApp();

    const denied = await app.inject({
      method: 'GET',
      url: '/admin/upload-holds',
      headers: {
        'x-test-user-id': 'reviewer-1',
        'x-test-roles': 'reviewer'
      }
    });

    expect(denied.statusCode).toBe(403);

    const allowed = await app.inject({
      method: 'GET',
      url: '/admin/upload-holds',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-roles': 'administrator'
      }
    });

    expect(allowed.statusCode).toBe(200);
    const body = allowed.json();
    expect(body.researcherDocumentHolds).toHaveLength(1);
    expect(body.journalAttachmentHolds).toHaveLength(1);
  });

  it('releases held researcher document versions', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/upload-holds/researcher-documents/doc-ver-1/release',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'admin-1',
        'x-test-roles': 'administrator'
      },
      payload: {
        note: 'Security review complete, release approved.'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
  });

  it('rejects release when hold is no longer active', async () => {
    const { app, researcherRepository } = await buildApp();

    researcherRepository.findDocumentVersionById.mockResolvedValueOnce({
      id: 'doc-ver-1',
      isAdminReviewRequired: false
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/upload-holds/researcher-documents/doc-ver-1/release',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'admin-1',
        'x-test-roles': 'administrator'
      },
      payload: {
        note: 'Attempted duplicate release.'
      }
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.error?.code ?? body.code).toBe('HOLD_NOT_ACTIVE');
  });
});
