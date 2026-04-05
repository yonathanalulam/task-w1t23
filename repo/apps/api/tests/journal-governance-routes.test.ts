import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';
import { journalGovernanceRoutes } from '../src/modules/journals/routes.js';

describe('journal governance routes RBAC boundaries', () => {
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

    const journalGovernanceService = {
      listCustomFields: vi.fn(async () => []),
      createCustomField: vi.fn(async () => ({ id: 'f-1' })),
      updateCustomField: vi.fn(async () => ({ id: 'f-1' })),
      listJournals: vi.fn(async () => []),
      createJournal: vi.fn(async () => ({ id: 'j-1' })),
      getJournalDetail: vi.fn(async () => ({ journal: { id: 'j-1' }, customFields: [], history: [], attachments: [] })),
      updateJournal: vi.fn(async () => ({ id: 'j-1' })),
      deleteJournal: vi.fn(async () => ({ id: 'j-1' })),
      addLinkAttachment: vi.fn(async () => ({ attachment: { id: 'a-1' }, version: { id: 'v-1' } })),
      addFileAttachment: vi.fn(async () => ({ attachment: { id: 'a-1' }, version: { id: 'v-1' } }))
    };

    const journalGovernanceRepository = {
      listAttachmentVersions: vi.fn(async () => []),
      findAttachmentVersionById: vi.fn(async () => null)
    };

    app.decorate('journalGovernanceService', journalGovernanceService);
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
        username: 'tester',
        roles: roles as never,
        sessionId: 'session-1'
      };
    });

    await app.register(journalGovernanceRoutes, { prefix: '/journal-governance' });
    registerErrorEnvelope(app);

    apps.push(app);
    return { app, journalGovernanceService };
  };

  it('returns 401 for unauthenticated journal list request', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/journal-governance/journals' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when non-admin role requests journal mutation endpoint', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/journal-governance/custom-fields',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-roles': 'reviewer',
        'content-type': 'application/json'
      },
      payload: {
        fieldKey: 'discipline',
        label: 'Discipline',
        fieldType: 'TEXT',
        isRequired: true,
        options: []
      }
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows admin role to list journals and invokes service', async () => {
    const { app, journalGovernanceService } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/journal-governance/journals',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-roles': 'administrator'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(journalGovernanceService.listJournals).toHaveBeenCalled();
  });

  it('allows admin role to create custom fields and invokes mutation service', async () => {
    const { app, journalGovernanceService } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/journal-governance/custom-fields',
      headers: {
        'x-test-user-id': 'admin-1',
        'x-test-roles': 'administrator',
        'content-type': 'application/json'
      },
      payload: {
        fieldKey: 'discipline',
        label: 'Discipline',
        fieldType: 'TEXT',
        isRequired: true,
        options: []
      }
    });

    expect(response.statusCode).toBe(201);
    expect(journalGovernanceService.createCustomField).toHaveBeenCalled();
  });
});
