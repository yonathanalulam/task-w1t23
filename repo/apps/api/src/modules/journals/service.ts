import type { MultipartFile } from '@fastify/multipart';
import { HttpError } from '../../lib/http-error.js';
import { analyzeUploadedFile } from '../../lib/upload-security.js';
import type { AuditWriteInput } from '../audit/types.js';
import { DEFAULT_MAX_UPLOAD_BYTES } from '../researcher/rules.js';
import type { createJournalGovernanceRepository } from './repository.js';
import { attachmentCategories, customFieldTypes, type AttachmentCategory, type CustomFieldDefinitionRecord, type CustomFieldType } from './types.js';

type JournalGovernanceRepository = ReturnType<typeof createJournalGovernanceRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const keyPattern = /^[a-z][a-z0-9_]{1,62}$/;

const withMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const normalizeOptions = (input: string[]): string[] => {
  return [...new Set(input.map((entry) => entry.trim()).filter(Boolean))];
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  return null;
};

const normalizeCustomFieldValues = (input: {
  definitions: CustomFieldDefinitionRecord[];
  rawValues: Record<string, unknown>;
}): Record<string, unknown> => {
  const activeDefinitions = input.definitions.filter((entry) => entry.isActive);
  const definitionByKey = new Map(activeDefinitions.map((entry) => [entry.fieldKey, entry]));

  for (const key of Object.keys(input.rawValues)) {
    if (!definitionByKey.has(key)) {
      throw new HttpError(400, 'UNKNOWN_CUSTOM_FIELD', `Unknown custom field key: ${key}`);
    }
  }

  const normalized: Record<string, unknown> = {};

  for (const definition of activeDefinitions) {
    const rawValue = input.rawValues[definition.fieldKey];

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (definition.isRequired) {
        throw new HttpError(400, 'CUSTOM_FIELD_REQUIRED', `Custom field '${definition.label}' is required.`);
      }
      continue;
    }

    switch (definition.fieldType) {
      case 'TEXT': {
        const text = String(rawValue).trim();
        if (!text && definition.isRequired) {
          throw new HttpError(400, 'CUSTOM_FIELD_REQUIRED', `Custom field '${definition.label}' is required.`);
        }
        if (text) {
          normalized[definition.fieldKey] = text;
        }
        break;
      }
      case 'NUMBER': {
        const number = Number(rawValue);
        if (!Number.isFinite(number)) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must be a valid number.`);
        }
        normalized[definition.fieldKey] = number;
        break;
      }
      case 'DATE': {
        const text = String(rawValue).trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must be YYYY-MM-DD.`);
        }
        const parsed = new Date(`${text}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime())) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' has invalid date value.`);
        }
        normalized[definition.fieldKey] = text;
        break;
      }
      case 'URL': {
        const text = String(rawValue).trim();
        let parsed: URL;
        try {
          parsed = new URL(text);
        } catch {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must be a valid URL.`);
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must use HTTP/HTTPS.`);
        }

        normalized[definition.fieldKey] = text;
        break;
      }
      case 'BOOLEAN': {
        const parsed = parseBoolean(rawValue);
        if (parsed === null) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must be true or false.`);
        }
        normalized[definition.fieldKey] = parsed;
        break;
      }
      case 'SELECT': {
        const text = String(rawValue).trim();
        if (!definition.options.includes(text)) {
          throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Custom field '${definition.label}' must match a configured option.`);
        }
        normalized[definition.fieldKey] = text;
        break;
      }
      default:
        throw new HttpError(400, 'CUSTOM_FIELD_INVALID', `Unsupported field type for '${definition.label}'.`);
    }
  }

  return normalized;
};

export const createJournalGovernanceService = (deps: {
  repository: JournalGovernanceRepository;
  audit: AuditWriter;
  maxUploadBytes?: number;
}) => {
  const { repository, audit } = deps;
  const maxUploadBytes = deps.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  const ensureJournalExistsForMutation = async (journalId: string) => {
    const journal = await repository.getJournalById(journalId);
    if (!journal) {
      throw new HttpError(404, 'JOURNAL_NOT_FOUND', 'Journal record was not found.');
    }
    if (journal.isDeleted) {
      throw new HttpError(409, 'JOURNAL_DELETED', 'Journal record is deleted and cannot be mutated.');
    }
    return journal;
  };

  const validateCustomFieldDefinitionInput = (input: {
    fieldKey: string;
    label: string;
    fieldType: string;
    isRequired: boolean;
    options: string[];
  }) => {
    if (!keyPattern.test(input.fieldKey)) {
      throw new HttpError(400, 'INVALID_FIELD_KEY', 'Custom field key must match /^[a-z][a-z0-9_]{1,62}$/.');
    }

    if (!customFieldTypes.includes(input.fieldType as CustomFieldType)) {
      throw new HttpError(400, 'INVALID_FIELD_TYPE', 'Unsupported custom field type.');
    }

    const normalizedOptions = normalizeOptions(input.options);

    if (input.fieldType === 'SELECT' && normalizedOptions.length === 0) {
      throw new HttpError(400, 'FIELD_OPTIONS_REQUIRED', 'SELECT custom fields require one or more options.');
    }

    if (input.fieldType !== 'SELECT' && normalizedOptions.length > 0) {
      throw new HttpError(400, 'FIELD_OPTIONS_NOT_ALLOWED', 'Options are only allowed for SELECT custom fields.');
    }

    return {
      fieldType: input.fieldType as CustomFieldType,
      options: normalizedOptions
    };
  };

  return {
    async listCustomFields(includeInactive = false) {
      return repository.listCustomFieldDefinitions(includeInactive);
    },

    async createCustomField(input: {
      actorUserId: string;
      fieldKey: string;
      label: string;
      fieldType: string;
      isRequired: boolean;
      options: string[];
      helpText?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const normalized = validateCustomFieldDefinitionInput(input);

      try {
        const created = await repository.createCustomFieldDefinition({
          fieldKey: input.fieldKey,
          label: input.label.trim(),
          fieldType: normalized.fieldType,
          isRequired: input.isRequired,
          options: normalized.options,
          ...(input.helpText?.trim() ? { helpText: input.helpText.trim() } : {}),
          createdByUserId: input.actorUserId
        });

        await audit.write({
          actorUserId: input.actorUserId,
          eventType: 'JOURNAL_CUSTOM_FIELD_CREATED',
          entityType: 'journal_custom_field',
          entityId: created.id,
          outcome: 'success',
          details: {
            fieldKey: created.fieldKey,
            fieldType: created.fieldType,
            isRequired: created.isRequired
          },
          ...withMeta(input.meta)
        });

        return created;
      } catch (error) {
        const message = String(error);
        if (message.includes('journal_custom_field_definitions_field_key_key')) {
          throw new HttpError(409, 'CUSTOM_FIELD_EXISTS', 'A custom field with this key already exists.');
        }
        throw error;
      }
    },

    async updateCustomField(input: {
      actorUserId: string;
      fieldId: string;
      label: string;
      fieldType: string;
      isRequired: boolean;
      options: string[];
      helpText?: string;
      isActive: boolean;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const normalized = validateCustomFieldDefinitionInput({
        fieldKey: 'valid_key',
        label: input.label,
        fieldType: input.fieldType,
        isRequired: input.isRequired,
        options: input.options
      });

      const updated = await repository.updateCustomFieldDefinition({
        fieldId: input.fieldId,
        label: input.label.trim(),
        fieldType: normalized.fieldType,
        isRequired: input.isRequired,
        options: normalized.options,
        ...(input.helpText?.trim() ? { helpText: input.helpText.trim() } : {}),
        isActive: input.isActive,
        updatedByUserId: input.actorUserId
      });

      if (!updated) {
        throw new HttpError(404, 'CUSTOM_FIELD_NOT_FOUND', 'Custom field definition was not found.');
      }

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_CUSTOM_FIELD_UPDATED',
        entityType: 'journal_custom_field',
        entityId: updated.id,
        outcome: 'success',
        details: {
          fieldKey: updated.fieldKey,
          fieldType: updated.fieldType,
          isRequired: updated.isRequired,
          isActive: updated.isActive
        },
        ...withMeta(input.meta)
      });

      return updated;
    },

    async listJournals(includeDeleted = false) {
      return repository.listJournals(includeDeleted);
    },

    async getJournalDetail(journalId: string) {
      const journal = await repository.getJournalById(journalId);
      if (!journal) {
        throw new HttpError(404, 'JOURNAL_NOT_FOUND', 'Journal record was not found.');
      }

      const [customFields, history, attachments] = await Promise.all([
        repository.listCustomFieldDefinitions(true),
        repository.listJournalVersions(journalId),
        repository.listAttachments(journalId)
      ]);

      return {
        journal,
        customFields,
        history,
        attachments
      };
    },

    async createJournal(input: {
      actorUserId: string;
      title: string;
      issn?: string;
      publisher?: string;
      customFieldValues: Record<string, unknown>;
      changeComment?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const definitions = await repository.listCustomFieldDefinitions(false);
      const normalizedCustomFields = normalizeCustomFieldValues({ definitions, rawValues: input.customFieldValues });

      const created = await repository.createJournal({
        title: input.title.trim(),
        ...(input.issn?.trim() ? { issn: input.issn.trim() } : {}),
        ...(input.publisher?.trim() ? { publisher: input.publisher.trim() } : {}),
        customFieldValues: normalizedCustomFields,
        actorUserId: input.actorUserId,
        ...(input.changeComment?.trim() ? { changeComment: input.changeComment.trim() } : {})
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_CREATED',
        entityType: 'journal',
        entityId: created.id,
        outcome: 'success',
        details: {
          title: created.title,
          version: created.currentVersionNumber
        },
        ...withMeta(input.meta)
      });

      return created;
    },

    async updateJournal(input: {
      actorUserId: string;
      journalId: string;
      title: string;
      issn?: string;
      publisher?: string;
      customFieldValues: Record<string, unknown>;
      changeComment?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      await ensureJournalExistsForMutation(input.journalId);
      const definitions = await repository.listCustomFieldDefinitions(false);
      const normalizedCustomFields = normalizeCustomFieldValues({ definitions, rawValues: input.customFieldValues });

      const updated = await repository.updateJournal({
        journalId: input.journalId,
        title: input.title.trim(),
        ...(input.issn?.trim() ? { issn: input.issn.trim() } : {}),
        ...(input.publisher?.trim() ? { publisher: input.publisher.trim() } : {}),
        customFieldValues: normalizedCustomFields,
        actorUserId: input.actorUserId,
        ...(input.changeComment?.trim() ? { changeComment: input.changeComment.trim() } : {})
      });

      if (!updated) {
        throw new HttpError(404, 'JOURNAL_NOT_FOUND', 'Journal record was not found.');
      }

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_UPDATED',
        entityType: 'journal',
        entityId: updated.id,
        outcome: 'success',
        details: {
          title: updated.title,
          version: updated.currentVersionNumber
        },
        ...withMeta(input.meta)
      });

      return updated;
    },

    async deleteJournal(input: {
      actorUserId: string;
      journalId: string;
      changeComment?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const deleted = await repository.softDeleteJournal({
        journalId: input.journalId,
        actorUserId: input.actorUserId,
        ...(input.changeComment?.trim() ? { changeComment: input.changeComment.trim() } : {})
      });

      if (!deleted) {
        throw new HttpError(404, 'JOURNAL_NOT_FOUND', 'Journal record was not found.');
      }

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_DELETED',
        entityType: 'journal',
        entityId: deleted.id,
        outcome: 'success',
        details: {
          title: deleted.title,
          version: deleted.currentVersionNumber
        },
        ...withMeta(input.meta)
      });

      return deleted;
    },

    async addLinkAttachment(input: {
      actorUserId: string;
      journalId: string;
      attachmentKey: string;
      label: string;
      category: string;
      externalUrl: string;
      notes?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      await ensureJournalExistsForMutation(input.journalId);

      if (!keyPattern.test(input.attachmentKey)) {
        throw new HttpError(400, 'INVALID_ATTACHMENT_KEY', 'Attachment key must match /^[a-z][a-z0-9_]{1,62}$/.');
      }

      if (!attachmentCategories.includes(input.category as AttachmentCategory)) {
        throw new HttpError(400, 'INVALID_ATTACHMENT_CATEGORY', 'Unsupported attachment category.');
      }

      let parsed: URL;
      try {
        parsed = new URL(input.externalUrl);
      } catch {
        throw new HttpError(400, 'INVALID_ATTACHMENT_URL', 'Attachment link must be a valid URL.');
      }

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new HttpError(400, 'INVALID_ATTACHMENT_URL', 'Attachment link must use HTTP/HTTPS.');
      }

      const saved = await repository.addLinkAttachmentVersion({
        journalId: input.journalId,
        attachmentKey: input.attachmentKey,
        label: input.label.trim(),
        category: input.category as AttachmentCategory,
        externalUrl: input.externalUrl,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        actorUserId: input.actorUserId
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_ATTACHMENT_VERSION_ADDED',
        entityType: 'journal_attachment',
        entityId: saved.attachment.id,
        outcome: 'success',
        details: {
          journalId: input.journalId,
          storageType: 'LINK',
          versionNumber: saved.version.versionNumber,
          attachmentKey: saved.attachment.attachmentKey,
          category: saved.attachment.category
        },
        ...withMeta(input.meta)
      });

      return saved;
    },

    async addFileAttachment(input: {
      actorUserId: string;
      journalId: string;
      attachmentKey: string;
      label: string;
      category: string;
      file: MultipartFile;
      notes?: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      await ensureJournalExistsForMutation(input.journalId);

      if (!keyPattern.test(input.attachmentKey)) {
        throw new HttpError(400, 'INVALID_ATTACHMENT_KEY', 'Attachment key must match /^[a-z][a-z0-9_]{1,62}$/.');
      }

      if (!attachmentCategories.includes(input.category as AttachmentCategory)) {
        throw new HttpError(400, 'INVALID_ATTACHMENT_CATEGORY', 'Unsupported attachment category.');
      }

      const fileBuffer = await input.file.toBuffer();
      const security = analyzeUploadedFile({
        fileName: input.file.filename,
        declaredMimeType: input.file.mimetype,
        buffer: fileBuffer,
        maxUploadBytes
      });

      if (security.blockedReason) {
        const code = security.findings.includes('file_too_large') ? 'FILE_TOO_LARGE' : 'UNSAFE_UPLOAD_BLOCKED';
        throw new HttpError(400, code, security.blockedReason, { findings: security.findings });
      }

      const saved = await repository.addFileAttachmentVersion({
        journalId: input.journalId,
        attachmentKey: input.attachmentKey,
        label: input.label.trim(),
        category: input.category as AttachmentCategory,
        file: input.file,
        fileBuffer,
        normalizedMimeType: security.normalizedMimeType,
        detectedMimeType: security.detectedMimeType,
        securityScanStatus: security.status,
        securityScanFindings: security.findings,
        isAdminReviewRequired: security.holdForAdminReview,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        actorUserId: input.actorUserId
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'JOURNAL_ATTACHMENT_VERSION_ADDED',
        entityType: 'journal_attachment',
        entityId: saved.attachment.id,
        outcome: 'success',
        details: {
          journalId: input.journalId,
          storageType: 'FILE',
          versionNumber: saved.version.versionNumber,
          attachmentKey: saved.attachment.attachmentKey,
          category: saved.attachment.category,
          fileName: saved.version.fileName,
          mimeType: saved.version.mimeType,
          securityScanStatus: saved.version.securityScanStatus,
          isAdminReviewRequired: saved.version.isAdminReviewRequired,
          securityFindings: saved.version.securityFindings
        },
        ...withMeta(input.meta)
      });

      return saved;
    }
  };
};
