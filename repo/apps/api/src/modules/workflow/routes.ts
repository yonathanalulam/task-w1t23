import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { applyTextWatermark, buildWatermarkLabel, isWatermarkContentSupported } from '../../lib/download-watermark.js';
import { HttpError } from '../../lib/http-error.js';
import { requireAuthenticated, requireRoles } from '../access-control/guards.js';
import type { ApproverDecision, ReviewerDecision } from './types.js';

const toMeta = (request: FastifyRequest) => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

export const workflowRoutes: FastifyPluginAsync = async (app) => {
  const respondWithWorkflowDocument = async (input: {
    request: FastifyRequest;
    reply: any;
    applicationId: string;
    documentId: string;
    role: 'reviewer' | 'approver';
    mode: 'preview' | 'download';
  }) => {
    const actor = input.request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const accessResult =
      input.role === 'reviewer'
        ? await app.workflowService.reviewerDocumentAccess(input.applicationId, input.documentId, actor.userId)
        : await app.workflowService.approverDocumentAccess(input.applicationId, input.documentId, actor.userId);

    const { document, version } = accessResult;

    if (input.mode === 'preview') {
      if (version.storageType !== 'FILE' || !version.isPreviewable || !version.filePath) {
        throw new HttpError(415, 'PREVIEW_NOT_SUPPORTED', 'Preview is supported for PDF/image file uploads only.');
      }

      await access(version.filePath);
      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'WORKFLOW_DOCUMENT_PREVIEWED',
        entityType: 'application_document',
        entityId: document.id,
        outcome: 'success',
        details: {
          applicationId: input.applicationId,
          documentId: document.id,
          versionId: version.id,
          role: input.role
        },
        ...toMeta(input.request)
      });

      input.reply.type(version.mimeType ?? 'application/octet-stream');
      return input.reply.send(createReadStream(version.filePath));
    }

    if (version.storageType === 'LINK') {
      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'WORKFLOW_DOCUMENT_LINK_OPENED',
        entityType: 'application_document',
        entityId: document.id,
        outcome: 'success',
        details: {
          applicationId: input.applicationId,
          documentId: document.id,
          versionId: version.id,
          role: input.role
        },
        ...toMeta(input.request)
      });

      return {
        mode: 'external_link',
        externalUrl: version.externalUrl
      };
    }

    if (!version.filePath) {
      throw new HttpError(404, 'DOCUMENT_FILE_NOT_FOUND', 'Stored file path is missing.');
    }

    await access(version.filePath);

    const watermarkRequested = String((input.request.query as { watermark?: string }).watermark ?? 'true') !== 'false';
    const watermarkLabel = buildWatermarkLabel({ actorUsername: actor.username, downloadedAt: new Date() });
    const watermarkContentApplied = watermarkRequested && isWatermarkContentSupported(version.mimeType, version.fileName);
    const fileName = version.fileName ?? 'document';

    input.reply.header('content-disposition', `attachment; filename="${fileName}"`);
    input.reply.type(version.mimeType ?? 'application/octet-stream');

    if (watermarkRequested) {
      input.reply.header('x-rrga-watermark', watermarkLabel);
      input.reply.header('x-rrga-watermark-mode', watermarkContentApplied ? 'content_prefix' : 'header_only');
    }

    await app.audit.write({
      actorUserId: actor.userId,
      eventType: 'WORKFLOW_DOCUMENT_DOWNLOADED',
      entityType: 'application_document',
      entityId: document.id,
      outcome: 'success',
      details: {
        applicationId: input.applicationId,
        documentId: document.id,
        versionId: version.id,
        role: input.role,
        watermarkRequested,
        watermarkApplied: watermarkContentApplied,
        watermarkLabel: watermarkRequested ? watermarkLabel : null
      },
      ...toMeta(input.request)
    });

    if (watermarkContentApplied) {
      const original = await readFile(version.filePath);
      const watermarked = applyTextWatermark({ buffer: original, watermarkLabel });
      return input.reply.send(watermarked);
    }

    return input.reply.send(createReadStream(version.filePath));
  };

  app.get('/reviewer/queue', { preHandler: [requireAuthenticated(app), requireRoles(app, ['reviewer'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const queue = await app.workflowService.reviewerQueue(actor.userId);
    return { queue };
  });

  app.get('/reviewer/applications/:applicationId', { preHandler: [requireAuthenticated(app), requireRoles(app, ['reviewer'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    return app.workflowService.reviewerDetail(applicationId, actor.userId);
  });

  app.get(
    '/reviewer/applications/:applicationId/documents/:documentId/preview',
    { preHandler: [requireAuthenticated(app), requireRoles(app, ['reviewer'])] },
    async (request, reply) => {
      const { applicationId, documentId } = request.params as { applicationId: string; documentId: string };
      return respondWithWorkflowDocument({ request, reply, applicationId, documentId, role: 'reviewer', mode: 'preview' });
    }
  );

  app.get(
    '/reviewer/applications/:applicationId/documents/:documentId/download',
    { preHandler: [requireAuthenticated(app), requireRoles(app, ['reviewer'])] },
    async (request, reply) => {
      const { applicationId, documentId } = request.params as { applicationId: string; documentId: string };
      return respondWithWorkflowDocument({ request, reply, applicationId, documentId, role: 'reviewer', mode: 'download' });
    }
  );

  app.post(
    '/reviewer/applications/:applicationId/decision',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['reviewer'])],
      schema: {
        body: {
          type: 'object',
          required: ['decision', 'comment'],
          additionalProperties: false,
          properties: {
            decision: { type: 'string', enum: ['forward_to_approval', 'return_for_revision', 'reject'] },
            comment: { type: 'string', minLength: 1, maxLength: 4000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const applicationId = String((request.params as { applicationId: string }).applicationId);
      const body = request.body as { decision: ReviewerDecision; comment: string };

      return app.workflowService.reviewerDecision({
        applicationId,
        actorUserId: actor.userId,
        decision: body.decision,
        comment: body.comment,
        meta: toMeta(request)
      });
    }
  );

  app.get('/approver/queue', { preHandler: [requireAuthenticated(app), requireRoles(app, ['approver'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const queue = await app.workflowService.approverQueue(actor.userId);
    return { queue };
  });

  app.get('/approver/applications/:applicationId', { preHandler: [requireAuthenticated(app), requireRoles(app, ['approver'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    return app.workflowService.approverDetail(applicationId, actor.userId);
  });

  app.get(
    '/approver/applications/:applicationId/documents/:documentId/preview',
    { preHandler: [requireAuthenticated(app), requireRoles(app, ['approver'])] },
    async (request, reply) => {
      const { applicationId, documentId } = request.params as { applicationId: string; documentId: string };
      return respondWithWorkflowDocument({ request, reply, applicationId, documentId, role: 'approver', mode: 'preview' });
    }
  );

  app.get(
    '/approver/applications/:applicationId/documents/:documentId/download',
    { preHandler: [requireAuthenticated(app), requireRoles(app, ['approver'])] },
    async (request, reply) => {
      const { applicationId, documentId } = request.params as { applicationId: string; documentId: string };
      return respondWithWorkflowDocument({ request, reply, applicationId, documentId, role: 'approver', mode: 'download' });
    }
  );

  app.post(
    '/approver/applications/:applicationId/sign-off',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['approver'])],
      schema: {
        body: {
          type: 'object',
          required: ['decision', 'comment'],
          additionalProperties: false,
          properties: {
            decision: { type: 'string', enum: ['approve', 'reject'] },
            comment: { type: 'string', minLength: 1, maxLength: 4000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const applicationId = String((request.params as { applicationId: string }).applicationId);
      const body = request.body as { decision: ApproverDecision; comment: string };

      return app.workflowService.approverSignOff({
        applicationId,
        actorUserId: actor.userId,
        decision: body.decision,
        comment: body.comment,
        meta: toMeta(request)
      });
    }
  );
};
