import { createReadStream } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { applyTextWatermark, buildWatermarkLabel, isWatermarkContentSupported } from '../../lib/download-watermark.js';
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

export const journalGovernanceRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = [requireAuthenticated(app), requireRoles(app, ['administrator'])];

  app.get('/custom-fields', { preHandler: adminOnly }, async (request) => {
    const includeInactive = String((request.query as { includeInactive?: string }).includeInactive ?? 'false') === 'true';
    const fields = await app.journalGovernanceService.listCustomFields(includeInactive);
    return { fields };
  });

  app.post(
    '/custom-fields',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['fieldKey', 'label', 'fieldType', 'isRequired'],
          additionalProperties: false,
          properties: {
            fieldKey: { type: 'string', minLength: 2, maxLength: 63 },
            label: { type: 'string', minLength: 2, maxLength: 120 },
            fieldType: { type: 'string', enum: ['TEXT', 'NUMBER', 'DATE', 'URL', 'BOOLEAN', 'SELECT'] },
            isRequired: { type: 'boolean' },
            options: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 120 }
            },
            helpText: { type: 'string', maxLength: 1000 }
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
        fieldKey: string;
        label: string;
        fieldType: string;
        isRequired: boolean;
        options?: string[];
        helpText?: string;
      };

      const field = await app.journalGovernanceService.createCustomField({
        actorUserId: actor.userId,
        fieldKey: body.fieldKey,
        label: body.label,
        fieldType: body.fieldType,
        isRequired: body.isRequired,
        options: body.options ?? [],
        ...(body.helpText ? { helpText: body.helpText } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send({ field });
    }
  );

  app.patch(
    '/custom-fields/:fieldId',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['label', 'fieldType', 'isRequired', 'isActive'],
          additionalProperties: false,
          properties: {
            label: { type: 'string', minLength: 2, maxLength: 120 },
            fieldType: { type: 'string', enum: ['TEXT', 'NUMBER', 'DATE', 'URL', 'BOOLEAN', 'SELECT'] },
            isRequired: { type: 'boolean' },
            isActive: { type: 'boolean' },
            options: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: 120 }
            },
            helpText: { type: 'string', maxLength: 1000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const fieldId = String((request.params as { fieldId: string }).fieldId);
      const body = request.body as {
        label: string;
        fieldType: string;
        isRequired: boolean;
        isActive: boolean;
        options?: string[];
        helpText?: string;
      };

      const field = await app.journalGovernanceService.updateCustomField({
        actorUserId: actor.userId,
        fieldId,
        label: body.label,
        fieldType: body.fieldType,
        isRequired: body.isRequired,
        options: body.options ?? [],
        ...(body.helpText ? { helpText: body.helpText } : {}),
        isActive: body.isActive,
        meta: toMeta(request)
      });

      return { field };
    }
  );

  app.get('/journals', { preHandler: adminOnly }, async (request) => {
    const includeDeleted = String((request.query as { includeDeleted?: string }).includeDeleted ?? 'false') === 'true';
    const journals = await app.journalGovernanceService.listJournals(includeDeleted);
    return { journals };
  });

  app.post(
    '/journals',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 2, maxLength: 240 },
            issn: { type: 'string', maxLength: 30 },
            publisher: { type: 'string', maxLength: 240 },
            customFieldValues: { type: 'object', additionalProperties: true },
            changeComment: { type: 'string', maxLength: 2000 }
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
        title: string;
        issn?: string;
        publisher?: string;
        customFieldValues?: Record<string, unknown>;
        changeComment?: string;
      };

      const journal = await app.journalGovernanceService.createJournal({
        actorUserId: actor.userId,
        title: body.title,
        ...(body.issn ? { issn: body.issn } : {}),
        ...(body.publisher ? { publisher: body.publisher } : {}),
        customFieldValues: body.customFieldValues ?? {},
        ...(body.changeComment ? { changeComment: body.changeComment } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send({ journal });
    }
  );

  app.get('/journals/:journalId', { preHandler: adminOnly }, async (request) => {
    const journalId = String((request.params as { journalId: string }).journalId);
    return app.journalGovernanceService.getJournalDetail(journalId);
  });

  app.patch(
    '/journals/:journalId',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 2, maxLength: 240 },
            issn: { type: 'string', maxLength: 30 },
            publisher: { type: 'string', maxLength: 240 },
            customFieldValues: { type: 'object', additionalProperties: true },
            changeComment: { type: 'string', maxLength: 2000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const journalId = String((request.params as { journalId: string }).journalId);
      const body = request.body as {
        title: string;
        issn?: string;
        publisher?: string;
        customFieldValues?: Record<string, unknown>;
        changeComment?: string;
      };

      const journal = await app.journalGovernanceService.updateJournal({
        actorUserId: actor.userId,
        journalId,
        title: body.title,
        ...(body.issn ? { issn: body.issn } : {}),
        ...(body.publisher ? { publisher: body.publisher } : {}),
        customFieldValues: body.customFieldValues ?? {},
        ...(body.changeComment ? { changeComment: body.changeComment } : {}),
        meta: toMeta(request)
      });

      return { journal };
    }
  );

  app.delete(
    '/journals/:journalId',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            changeComment: { type: 'string', maxLength: 2000 }
          }
        }
      }
    },
    async (request) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const journalId = String((request.params as { journalId: string }).journalId);
      const body = (request.body ?? {}) as { changeComment?: string };

      const journal = await app.journalGovernanceService.deleteJournal({
        actorUserId: actor.userId,
        journalId,
        ...(body.changeComment ? { changeComment: body.changeComment } : {}),
        meta: toMeta(request)
      });

      return { journal };
    }
  );

  app.get('/journals/:journalId/history', { preHandler: adminOnly }, async (request) => {
    const journalId = String((request.params as { journalId: string }).journalId);
    const detail = await app.journalGovernanceService.getJournalDetail(journalId);
    return { history: detail.history };
  });

  app.post('/journals/:journalId/attachments/file', { preHandler: adminOnly }, async (request, reply) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const journalId = String((request.params as { journalId: string }).journalId);
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

    const attachmentKey = getFieldValue('attachmentKey').trim();
    const label = getFieldValue('label').trim();
    const category = getFieldValue('category').trim();
    const notes = getFieldValue('notes').trim();

    if (!attachmentKey || !label || !category) {
      throw new HttpError(400, 'ATTACHMENT_METADATA_REQUIRED', 'attachmentKey, label, and category are required form fields.');
    }

    const saved = await app.journalGovernanceService.addFileAttachment({
      actorUserId: actor.userId,
      journalId,
      attachmentKey,
      label,
      category,
      file,
      notes,
      meta: toMeta(request)
    });

    return reply.code(201).send(saved);
  });

  app.post(
    '/journals/:journalId/attachments/link',
    {
      preHandler: adminOnly,
      schema: {
        body: {
          type: 'object',
          required: ['attachmentKey', 'label', 'category', 'externalUrl'],
          additionalProperties: false,
          properties: {
            attachmentKey: { type: 'string', minLength: 2, maxLength: 63 },
            label: { type: 'string', minLength: 2, maxLength: 180 },
            category: { type: 'string', enum: ['CONTRACT', 'QUOTE', 'SAMPLE_ISSUE', 'OTHER'] },
            externalUrl: { type: 'string', maxLength: 2048 },
            notes: { type: 'string', maxLength: 2000 }
          }
        }
      }
    },
    async (request, reply) => {
      const actor = request.auth;
      if (!actor) {
        throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const journalId = String((request.params as { journalId: string }).journalId);
      const body = request.body as {
        attachmentKey: string;
        label: string;
        category: string;
        externalUrl: string;
        notes?: string;
      };

      const saved = await app.journalGovernanceService.addLinkAttachment({
        actorUserId: actor.userId,
        journalId,
        attachmentKey: body.attachmentKey,
        label: body.label,
        category: body.category,
        externalUrl: body.externalUrl,
        ...(body.notes ? { notes: body.notes } : {}),
        meta: toMeta(request)
      });

      return reply.code(201).send(saved);
    }
  );

  app.get('/journals/:journalId/attachments/:attachmentId/versions', { preHandler: adminOnly }, async (request) => {
    const params = request.params as { journalId: string; attachmentId: string };
    const journal = await app.journalGovernanceService.getJournalDetail(params.journalId);
    const attachment = journal.attachments.find((entry) => entry.id === params.attachmentId);
    if (!attachment) {
      throw new HttpError(404, 'JOURNAL_ATTACHMENT_NOT_FOUND', 'Journal attachment was not found.');
    }

    const versions = await app.journalGovernanceRepository.listAttachmentVersions(params.attachmentId);
    return {
      attachment,
      versions,
      latestVersionId: attachment.currentVersionId
    };
  });

  app.get('/journals/:journalId/attachments/:attachmentId/download', { preHandler: adminOnly }, async (request, reply) => {
    const actor = request.auth;
    if (!actor) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const params = request.params as { journalId: string; attachmentId: string };
    const journal = await app.journalGovernanceService.getJournalDetail(params.journalId);
    const attachment = journal.attachments.find((entry) => entry.id === params.attachmentId);
    if (!attachment) {
      throw new HttpError(404, 'JOURNAL_ATTACHMENT_NOT_FOUND', 'Journal attachment was not found.');
    }

    const currentVersionId = attachment.currentVersionId;
    if (!currentVersionId) {
      throw new HttpError(404, 'JOURNAL_ATTACHMENT_VERSION_NOT_FOUND', 'Attachment has no active version.');
    }

    const version = await app.journalGovernanceRepository.findAttachmentVersionById(currentVersionId);
    if (!version) {
      throw new HttpError(404, 'JOURNAL_ATTACHMENT_VERSION_NOT_FOUND', 'Attachment version was not found.');
    }

    if (version.isAdminReviewRequired || version.securityScanStatus === 'HELD') {
      throw new HttpError(
        423,
        'ATTACHMENT_HELD_FOR_ADMIN_REVIEW',
        'Attachment is currently held for administrator review and cannot be downloaded.'
      );
    }

    if (version.storageType === 'LINK') {
      await app.audit.write({
        actorUserId: actor.userId,
        eventType: 'JOURNAL_ATTACHMENT_LINK_OPENED',
        entityType: 'journal_attachment',
        entityId: attachment.id,
        outcome: 'success',
        details: {
          journalId: params.journalId,
          attachmentId: attachment.id,
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
      throw new HttpError(404, 'JOURNAL_ATTACHMENT_FILE_NOT_FOUND', 'Stored file path is missing.');
    }

    await access(version.filePath);

    const watermarkRequested = String((request.query as { watermark?: string }).watermark ?? 'true') !== 'false';
    const watermarkLabel = buildWatermarkLabel({ actorUsername: actor.username, downloadedAt: new Date() });
    const watermarkContentApplied = watermarkRequested && isWatermarkContentSupported(version.mimeType, version.fileName);
    const fileName = version.fileName ?? 'attachment';

    reply.header('content-disposition', `attachment; filename="${fileName}"`);
    reply.type(version.mimeType ?? 'application/octet-stream');

    if (watermarkRequested) {
      reply.header('x-rrga-watermark', watermarkLabel);
      reply.header('x-rrga-watermark-mode', watermarkContentApplied ? 'content_prefix' : 'header_only');
    }

    await app.audit.write({
      actorUserId: actor.userId,
      eventType: 'JOURNAL_ATTACHMENT_DOWNLOADED',
      entityType: 'journal_attachment',
      entityId: attachment.id,
      outcome: 'success',
      details: {
        journalId: params.journalId,
        attachmentId: attachment.id,
        versionId: version.id,
        watermarkRequested,
        watermarkApplied: watermarkContentApplied,
        watermarkLabel: watermarkRequested ? watermarkLabel : null
      },
      ...toMeta(request)
    });

    if (watermarkContentApplied) {
      const original = await readFile(version.filePath);
      const watermarked = applyTextWatermark({ buffer: original, watermarkLabel });
      return reply.send(watermarked);
    }

    return reply.send(createReadStream(version.filePath));
  });
};
