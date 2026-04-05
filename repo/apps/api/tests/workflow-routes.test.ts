import Fastify from 'fastify';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerErrorEnvelope } from '../src/plugins/error-envelope.js';
import { workflowRoutes } from '../src/modules/workflow/routes.js';
import { HttpError } from '../src/lib/http-error.js';

describe('workflow routes RBAC and object boundaries', () => {
  const apps: Array<Awaited<ReturnType<typeof buildTestApp>>> = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (apps.length > 0) {
      const app = apps.pop();
      if (app) {
        await app.close();
      }
    }

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  const buildTestApp = async () => {
    const app = Fastify({ logger: false });

    app.decorate('audit', {
      write: vi.fn(async () => undefined)
    });

    const workflowService = {
      reviewerQueue: vi.fn(async () => []),
      reviewerDetail: vi.fn(async () => ({ application: { id: 'app-1' } })),
      reviewerDocumentAccess: vi.fn(async () => ({
        document: { id: 'doc-1' },
        version: {
          id: 'ver-1',
          storageType: 'FILE',
          isPreviewable: true,
          filePath: '/tmp/does-not-exist.pdf',
          mimeType: 'application/pdf',
          fileName: 'evidence.pdf',
          externalUrl: null
        }
      })),
      reviewerDecision: vi.fn(async () => ({ ok: true })),
      approverQueue: vi.fn(async () => []),
      approverDetail: vi.fn(async () => ({ application: { id: 'app-1' } })),
      approverDocumentAccess: vi.fn(async () => ({
        document: { id: 'doc-1' },
        version: {
          id: 'ver-1',
          storageType: 'FILE',
          isPreviewable: true,
          filePath: '/tmp/does-not-exist.pdf',
          mimeType: 'application/pdf',
          fileName: 'evidence.pdf',
          externalUrl: null
        }
      })),
      approverSignOff: vi.fn(async () => ({ ok: true }))
    };

    app.decorate('workflowService', workflowService);

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
        roles: roles as any,
        sessionId: 'session-1'
      };
    });

    await app.register(workflowRoutes, { prefix: '/workflow' });
    registerErrorEnvelope(app);

    apps.push(app);
    return { app, workflowService };
  };

  it('returns 401 for unauthenticated reviewer queue request', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/workflow/reviewer/queue' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 when reviewer route is called by non-reviewer role', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/workflow/reviewer/queue',
      headers: {
        'x-test-user-id': 'user-1',
        'x-test-roles': 'approver'
      }
    });
    expect(response.statusCode).toBe(403);
  });

  it('allows reviewer queue for reviewer role and calls service', async () => {
    const { app, workflowService } = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: '/workflow/reviewer/queue',
      headers: {
        'x-test-user-id': 'reviewer-1',
        'x-test-roles': 'reviewer'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(workflowService.reviewerQueue).toHaveBeenCalled();
  });

  it('returns 403 when approver sign-off is attempted by reviewer role', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/workflow/approver/applications/app-1/sign-off',
      headers: {
        'content-type': 'application/json',
        'x-test-user-id': 'reviewer-1',
        'x-test-roles': 'reviewer'
      },
      payload: { decision: 'approve', comment: 'looks good' }
    });

    expect(response.statusCode).toBe(403);
  });

  it('preserves object-level denial from approver detail handler', async () => {
    const { app, workflowService } = await buildTestApp();
    workflowService.approverDetail.mockRejectedValueOnce(
      new HttpError(403, 'FORBIDDEN', 'Application is not in an approver-signoff state.')
    );

    const response = await app.inject({
      method: 'GET',
      url: '/workflow/approver/applications/app-1',
      headers: {
        'x-test-user-id': 'approver-1',
        'x-test-roles': 'approver'
      }
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error?.code ?? body.code).toBe('FORBIDDEN');
  });

  it('serves reviewer preview for accessible workflow documents', async () => {
    const { app, workflowService } = await buildTestApp();
    const tempDir = await mkdtemp(join(tmpdir(), 'workflow-preview-'));
    tempDirs.push(tempDir);
    const filePath = join(tempDir, 'evidence.pdf');
    await writeFile(filePath, Buffer.from('%PDF-1.4\nworkflow-test', 'utf8'));

    workflowService.reviewerDocumentAccess.mockResolvedValueOnce({
      document: { id: 'doc-1' },
      version: {
        id: 'ver-1',
        storageType: 'FILE',
        isPreviewable: true,
        filePath,
        mimeType: 'application/pdf',
        fileName: 'evidence.pdf',
        externalUrl: null
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/workflow/reviewer/applications/app-1/documents/doc-1/preview',
      headers: {
        'x-test-user-id': 'reviewer-1',
        'x-test-roles': 'reviewer'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(workflowService.reviewerDocumentAccess).toHaveBeenCalledWith('app-1', 'doc-1');
  });

  it('returns 423 when reviewer document access is held for admin review', async () => {
    const { app, workflowService } = await buildTestApp();
    workflowService.reviewerDocumentAccess.mockRejectedValueOnce(
      new HttpError(423, 'DOCUMENT_HELD_FOR_ADMIN_REVIEW', 'Document is currently held for administrator review and is not accessible.')
    );

    const response = await app.inject({
      method: 'GET',
      url: '/workflow/reviewer/applications/app-1/documents/doc-1/download',
      headers: {
        'x-test-user-id': 'reviewer-1',
        'x-test-roles': 'reviewer'
      }
    });

    expect(response.statusCode).toBe(423);
    const body = response.json();
    expect(body.error?.code ?? body.code).toBe('DOCUMENT_HELD_FOR_ADMIN_REVIEW');
  });

  it('supports approver download watermark headers for text-like files', async () => {
    const { app, workflowService } = await buildTestApp();
    const tempDir = await mkdtemp(join(tmpdir(), 'workflow-download-'));
    tempDirs.push(tempDir);
    const filePath = join(tempDir, 'evidence.txt');
    await writeFile(filePath, Buffer.from('original-body', 'utf8'));

    workflowService.approverDocumentAccess.mockResolvedValueOnce({
      document: { id: 'doc-1' },
      version: {
        id: 'ver-1',
        storageType: 'FILE',
        isPreviewable: true,
        filePath,
        mimeType: 'text/plain',
        fileName: 'evidence.txt',
        externalUrl: null
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/workflow/approver/applications/app-1/documents/doc-1/download?watermark=true',
      headers: {
        'x-test-user-id': 'approver-1',
        'x-test-roles': 'approver'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-rrga-watermark']).toContain('Downloaded by tester at');
    expect(response.headers['x-rrga-watermark-mode']).toBe('content_prefix');
    expect(response.body).toContain('[RRGA WATERMARK]');
    expect(response.body).toContain('original-body');
  });
});
