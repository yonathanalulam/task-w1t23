import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { applyTextWatermark, buildWatermarkLabel, isWatermarkContentSupported } from '../../lib/download-watermark.js';
import { HttpError } from '../../lib/http-error.js';
import { requireAuthenticated, requireRoles } from '../access-control/guards.js';
import { assertActorOwnsResource } from '../access-control/object-authorization.js';
import { evaluateDeadlineSurface } from './rules.js';

const editableStatuses = new Set(['DRAFT', 'RETURNED_FOR_REVISION', 'BLOCKED_LATE']);

const toMeta = (request: FastifyRequest) => {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;

  return {
    requestId: request.id,
    ip: request.ip,
    ...(userAgent ? { userAgent } : {})
  };
};

interface DeadlinePayloadSource {
  submissionDeadlineAt: Date;
  graceHours: number;
  extensionUntil: Date | null;
  extensionUsedAt: Date | null;
}

const buildDeadlinePayload = (application: DeadlinePayloadSource | null) => {
  if (!application) {
    return null;
  }

  const surface = evaluateDeadlineSurface({
    submissionDeadlineAt: application.submissionDeadlineAt,
    graceHours: application.graceHours,
    now: new Date(),
    extensionUntil: application.extensionUntil,
    extensionUsedAt: application.extensionUsedAt
  });

  return {
    state: surface.state,
    submissionAllowed: surface.submissionAllowed,
    message: surface.message,
    deadlineAt: surface.deadlineAt.toISOString(),
    graceDeadlineAt: surface.graceDeadlineAt.toISOString(),
    extensionUntil: surface.extensionUntil?.toISOString() ?? null,
    extensionUsedAt: surface.extensionUsedAt?.toISOString() ?? null
  };
};

const isHeldForAdminReview = (version: { securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD'; isAdminReviewRequired: boolean }) => {
  return version.isAdminReviewRequired || version.securityScanStatus === 'HELD';
};

export const researcherRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/applications',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])],
      schema: {
        body: {
          type: 'object',
          required: ['policyId', 'title', 'requestedAmount'],
          additionalProperties: false,
          properties: {
            policyId: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 3, maxLength: 180 },
            summary: { type: 'string', maxLength: 4000 },
            requestedAmount: { type: 'string', pattern: '^\\d+(?:\\.\\d{1,2})?$' }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const body = request.body as {
        policyId: string;
        title: string;
        summary?: string;
        requestedAmount: string;
      };

      const policy = await app.researcherRepository.getPolicyById(body.policyId);
      if (!policy || !policy.isActive) {
        throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
      }

      try {
        const application = await app.researcherRepository.createApplication({
          policyId: body.policyId,
          applicantUserId: actor.userId,
          title: body.title,
          ...(body.summary ? { summary: body.summary } : {}),
          requestedAmount: body.requestedAmount
        });

        await app.audit.write({
          actorUserId: actor.userId,
          eventType: 'APPLICATION_DRAFT_CREATED',
          entityType: 'application',
          entityId: application.id,
          outcome: 'success',
          details: {
            policyId: body.policyId,
            title: body.title
          },
          ...toMeta(request)
        });

        return reply.code(201).send({ application, deadline: buildDeadlinePayload(application) });
      } catch (error) {
        const message = String(error);
        if (message.includes('duplicate key value violates unique constraint') || message.includes('applications_policy_id_applicant_user_id_key')) {
          throw new HttpError(409, 'DUPLICATE_APPLICATION', 'A draft or submission already exists for this policy period.');
        }
        throw error;
      }
    }
  );

  app.get('/applications', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applications = await app.researcherRepository.listApplicationsByResearcher(actor.userId);
    return {
      applications: applications.map((application) => ({
        ...application,
        deadline: buildDeadlinePayload(application)
      }))
    };
  });

  app.get('/applications/:applicationId', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const application = await app.researcherRepository.getApplicationById(applicationId);

    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    await assertActorOwnsResource({
      app,
      request,
      actorUserId: actor.userId,
      ownerUserId: application.applicantUserId,
      entityType: 'application',
      entityId: application.id
    });

    const documents = await app.researcherRepository.listDocuments(applicationId);
    const policy = await app.researcherRepository.getPolicyById(application.policyId);

    return {
      application,
      policy,
      documents,
      deadline: buildDeadlinePayload(application)
    };
  });

  app.post('/applications/:applicationId/submit', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const result = await app.researcherService.submitApplication({
      applicationId,
      actorUserId: actor.userId,
      mode: 'submit',
      meta: toMeta(request)
    });

    return {
      application: result,
      deadline: buildDeadlinePayload(result)
    };
  });

  app.post('/applications/:applicationId/resubmit', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const result = await app.researcherService.submitApplication({
      applicationId,
      actorUserId: actor.userId,
      mode: 'resubmit',
      meta: toMeta(request)
    });

    return {
      application: result,
      deadline: buildDeadlinePayload(result)
    };
  });

  app.post('/applications/:applicationId/documents/file', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request, reply) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const file = await (request as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }).file();
    if (!file) {
      throw new HttpError(400, 'FILE_REQUIRED', 'File is required.');
    }

    const fields = file.fields as Record<string, { value?: unknown } | Array<{ value?: unknown }>>;
    const getFieldValue = (name: string): string => {
      const entry = fields[name];
      if (!entry) return '';
      if (Array.isArray(entry)) {
        return String(entry[0]?.value ?? '');
      }
      return String(entry.value ?? '');
    };

    const documentKey = getFieldValue('documentKey').trim();
    const label = getFieldValue('label').trim();

    if (!documentKey || !label) {
      throw new HttpError(400, 'DOCUMENT_METADATA_REQUIRED', 'documentKey and label are required form fields.');
    }

    const saved = await app.researcherService.addFileVersion({
      applicationId,
      actorUserId: actor.userId,
      documentKey,
      label,
      file,
      meta: toMeta(request)
    });

    return reply.code(201).send(saved);
  });

  app.post(
    '/applications/:applicationId/documents/link',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])],
      schema: {
        body: {
          type: 'object',
          required: ['documentKey', 'label', 'externalUrl'],
          additionalProperties: false,
          properties: {
            documentKey: { type: 'string', minLength: 1, maxLength: 80 },
            label: { type: 'string', minLength: 1, maxLength: 180 },
            externalUrl: { type: 'string', maxLength: 2048 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const applicationId = String((request.params as { applicationId: string }).applicationId);
      const body = request.body as { documentKey: string; label: string; externalUrl: string };

      const saved = await app.researcherService.addLinkVersion({
        applicationId,
        actorUserId: actor.userId,
        documentKey: body.documentKey,
        label: body.label,
        externalUrl: body.externalUrl,
        meta: toMeta(request)
      });

      return reply.code(201).send(saved);
    }
  );

  app.get('/applications/:applicationId/documents/:documentId/versions', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const params = request.params as { applicationId: string; documentId: string };
    const application = await app.researcherRepository.getApplicationById(params.applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    await assertActorOwnsResource({
      app,
      request,
      actorUserId: actor.userId,
      ownerUserId: application.applicantUserId,
      entityType: 'application',
      entityId: application.id
    });

    const document = await app.researcherRepository.findDocumentById(params.documentId);
    if (!document || document.applicationId !== application.id) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const versions = await app.researcherRepository.listDocumentVersions(document.id);
    return {
      document,
      versions,
      latestVersionId: document.latestVersionId
    };
  });

  app.post(
    '/applications/:applicationId/documents/:documentId/rollback/:versionId',
    { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const params = request.params as { applicationId: string; documentId: string; versionId: string };

      await app.researcherService.rollbackVersion({
        applicationId: params.applicationId,
        actorUserId: actor.userId,
        documentId: params.documentId,
        targetVersionId: params.versionId,
        meta: toMeta(request)
      });

      return { ok: true };
    }
  );

  app.get('/applications/:applicationId/documents/:documentId/preview', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request, reply) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const params = request.params as { applicationId: string; documentId: string };
    const application = await app.researcherRepository.getApplicationById(params.applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    await assertActorOwnsResource({
      app,
      request,
      actorUserId: actor.userId,
      ownerUserId: application.applicantUserId,
      entityType: 'application',
      entityId: application.id
    });

    const document = await app.researcherRepository.findDocumentById(params.documentId);
    if (!document || document.applicationId !== application.id) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const versionId = document.latestVersionId;
    if (!versionId) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'No active version found.');
    }

    const version = await app.researcherRepository.findDocumentVersionById(versionId);
    if (!version || version.storageType !== 'FILE' || !version.isPreviewable || !version.filePath) {
      throw new HttpError(415, 'PREVIEW_NOT_SUPPORTED', 'Preview is supported for PDF/image file uploads only.');
    }

    if (isHeldForAdminReview(version)) {
      throw new HttpError(
        423,
        'DOCUMENT_HELD_FOR_ADMIN_REVIEW',
        'Document is currently held for administrator review and cannot be previewed.'
      );
    }

    await access(version.filePath);

    await app.audit.write({
      actorUserId: actor.userId,
      eventType: 'APPLICATION_DOCUMENT_PREVIEWED',
      entityType: 'application_document',
      entityId: document.id,
      outcome: 'success',
      details: {
        applicationId: application.id,
        documentId: document.id,
        versionId: version.id
      },
      ...toMeta(request)
    });

    reply.type(version.mimeType ?? 'application/octet-stream');
    return reply.send(createReadStream(version.filePath));
  });

  app.get('/applications/:applicationId/documents/:documentId/download', { preHandler: [requireAuthenticated(app), requireRoles(app, ['researcher'])] }, async (request, reply) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const params = request.params as { applicationId: string; documentId: string };
    const application = await app.researcherRepository.getApplicationById(params.applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    await assertActorOwnsResource({
      app,
      request,
      actorUserId: actor.userId,
      ownerUserId: application.applicantUserId,
      entityType: 'application',
      entityId: application.id
    });

    const document = await app.researcherRepository.findDocumentById(params.documentId);
    if (!document || document.applicationId !== application.id) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    const versionId = document.latestVersionId;
    if (!versionId) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'No active version found.');
    }

    const version = await app.researcherRepository.findDocumentVersionById(versionId);
    if (!version) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Version was not found.');
    }

    if (isHeldForAdminReview(version)) {
      throw new HttpError(
        423,
        'DOCUMENT_HELD_FOR_ADMIN_REVIEW',
        'Document is currently held for administrator review and cannot be downloaded.'
      );
    }

    if (version.storageType === 'LINK') {
      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'APPLICATION_DOCUMENT_LINK_OPENED',
        entityType: 'application_document',
        entityId: document.id,
        outcome: 'success',
        details: {
          applicationId: application.id,
          documentId: document.id,
          versionId: version.id
        },
        ...toMeta(request)
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

    const watermarkRequested = String((request.query as { watermark?: string }).watermark ?? 'true') !== 'false';
    const watermarkLabel = buildWatermarkLabel({
      actorUsername: actor.username,
      downloadedAt: new Date()
    });

    const watermarkContentApplied = watermarkRequested && isWatermarkContentSupported(version.mimeType, version.fileName);
    const fileName = version.fileName ?? 'document';

    reply.header('content-disposition', `attachment; filename="${fileName}"`);
    reply.type(version.mimeType ?? 'application/octet-stream');

    if (watermarkRequested) {
      reply.header('x-rrga-watermark', watermarkLabel);
      reply.header('x-rrga-watermark-mode', watermarkContentApplied ? 'content_prefix' : 'header_only');
    }

    await app.audit.write({
      actorUserId: actor.userId,
      eventType: 'APPLICATION_DOCUMENT_DOWNLOADED',
      entityType: 'application_document',
      entityId: document.id,
      outcome: 'success',
      details: {
        applicationId: application.id,
        documentId: document.id,
        versionId: version.id,
        watermarkRequested,
        watermarkApplied: watermarkContentApplied,
        watermarkLabel: watermarkRequested ? watermarkLabel : null
      },
      ...toMeta(request)
    });

    if (watermarkContentApplied) {
      const original = await readFile(version.filePath);
      const watermarked = applyTextWatermark({
        buffer: original,
        watermarkLabel
      });
      return reply.send(watermarked);
    }

    return reply.send(createReadStream(version.filePath));
  });

  app.post(
    '/applications/:applicationId/extensions',
    {
      preHandler: [requireAuthenticated(app), requireRoles(app, ['administrator'])],
      schema: {
        body: {
          type: 'object',
          required: ['reason', 'extendedUntil'],
          additionalProperties: false,
          properties: {
            reason: { type: 'string', minLength: 3, maxLength: 1000 },
            extendedUntil: { type: 'string', format: 'date-time' }
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
      const body = request.body as { reason: string; extendedUntil: string };

      const application = await app.researcherService.grantExtension({
        applicationId,
        actorUserId: actor.userId,
        reason: body.reason,
        extendedUntil: body.extendedUntil,
        meta: toMeta(request)
      });

      return {
        application,
        deadline: buildDeadlinePayload(application)
      };
    }
  );

  app.get('/applications/:applicationId/status-history', { preHandler: [requireAuthenticated(app)] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const application = await app.researcherRepository.getApplicationById(applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    const isAdmin = actor.roles.includes('administrator');
    if (!isAdmin && actor.userId !== application.applicantUserId) {
      throw new HttpError(403, 'FORBIDDEN', 'Cannot access status history for this application.');
    }

    const history = await app.dbPool.query(
      `
      SELECT *
      FROM application_status_history
      WHERE application_id = $1
      ORDER BY created_at DESC
      `,
      [applicationId]
    );

    return {
      history: history.rows
    };
  });

  app.get('/applications/:applicationId/validations', { preHandler: [requireAuthenticated(app)] }, async (request) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const applicationId = String((request.params as { applicationId: string }).applicationId);
    const application = await app.researcherRepository.getApplicationById(applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    const isAdmin = actor.roles.includes('administrator');
    if (!isAdmin && actor.userId !== application.applicantUserId) {
      throw new HttpError(403, 'FORBIDDEN', 'Cannot access validation history for this application.');
    }

    const validations = await app.dbPool.query(
      `
      SELECT *
      FROM application_validations
      WHERE application_id = $1
      ORDER BY created_at DESC
      `,
      [applicationId]
    );

    return {
      validations: validations.rows
    };
  });
};
