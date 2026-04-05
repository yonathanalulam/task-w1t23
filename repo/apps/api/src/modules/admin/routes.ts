import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { HttpError } from '../../lib/http-error.js';
import { requireAuthenticated, requireRoles } from '../access-control/guards.js';

const toMeta = (request: FastifyRequest) => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

export const adminRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = [requireAuthenticated(app), requireRoles(app, ['administrator'])];

  app.get('/ping', { preHandler: adminOnly }, async () => {
    return {
      ok: true,
      area: 'admin'
    };
  });

  app.get('/upload-holds', { preHandler: adminOnly }, async () => {
    const [researcherDocumentHolds, journalAttachmentHolds] = await Promise.all([
      app.researcherRepository.listHeldDocumentVersions(),
      app.journalGovernanceRepository.listHeldAttachmentVersions()
    ]);

    return {
      researcherDocumentHolds,
      journalAttachmentHolds
    };
  });

  app.post(
    '/upload-holds/researcher-documents/:versionId/release',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['note'],
          additionalProperties: false,
          properties: {
            note: { type: 'string', minLength: 3, maxLength: 2000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const versionId = String((request.params as { versionId: string }).versionId);
      const note = String((request.body as { note: string }).note ?? '').trim();

      const version = await app.researcherRepository.findDocumentVersionById(versionId);
      if (!version) {
        throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
      }

      if (!version.isAdminReviewRequired) {
        throw new HttpError(409, 'HOLD_NOT_ACTIVE', 'Document version is not currently held.');
      }

      const released = await app.researcherRepository.releaseHeldDocumentVersion({ versionId });
      if (!released) {
        throw new HttpError(409, 'HOLD_NOT_ACTIVE', 'Document version is not currently held.');
      }

      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'UPLOAD_HOLD_RELEASED',
        entityType: 'application_document_version',
        entityId: versionId,
        outcome: 'success',
        details: {
          holdType: 'researcher_document',
          note
        },
        ...toMeta(request)
      });

      return { ok: true };
    }
  );

  app.post(
    '/upload-holds/journal-attachments/:versionId/release',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['note'],
          additionalProperties: false,
          properties: {
            note: { type: 'string', minLength: 3, maxLength: 2000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const versionId = String((request.params as { versionId: string }).versionId);
      const note = String((request.body as { note: string }).note ?? '').trim();

      const version = await app.journalGovernanceRepository.findAttachmentVersionById(versionId);
      if (!version) {
        throw new HttpError(404, 'JOURNAL_ATTACHMENT_VERSION_NOT_FOUND', 'Attachment version was not found.');
      }

      if (!version.isAdminReviewRequired) {
        throw new HttpError(409, 'HOLD_NOT_ACTIVE', 'Attachment version is not currently held.');
      }

      const released = await app.journalGovernanceRepository.releaseHeldAttachmentVersion({ versionId });
      if (!released) {
        throw new HttpError(409, 'HOLD_NOT_ACTIVE', 'Attachment version is not currently held.');
      }

      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'UPLOAD_HOLD_RELEASED',
        entityType: 'journal_attachment_version',
        entityId: versionId,
        outcome: 'success',
        details: {
          holdType: 'journal_attachment',
          note
        },
        ...toMeta(request)
      });

      return { ok: true };
    }
  );
};
