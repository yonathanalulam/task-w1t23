import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import type { Pool, PoolClient } from 'pg';
import type {
  AttachmentCategory,
  CustomFieldDefinitionRecord,
  CustomFieldType,
  JournalAttachmentRecord,
  JournalAttachmentVersionRecord,
  JournalRecord,
  JournalVersionRecord
} from './types.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

const parseJsonObject = (value: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const parseStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }

  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const mapCustomField = (row: Record<string, unknown>): CustomFieldDefinitionRecord => ({
  id: String(row.id),
  fieldKey: String(row.field_key),
  label: String(row.label),
  fieldType: String(row.field_type) as CustomFieldType,
  isRequired: Boolean(row.is_required),
  options: parseStringArray(row.options),
  helpText: row.help_text ? String(row.help_text) : null,
  isActive: Boolean(row.is_active),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapJournal = (row: Record<string, unknown>): JournalRecord => ({
  id: String(row.id),
  title: String(row.title),
  issn: row.issn ? String(row.issn) : null,
  publisher: row.publisher ? String(row.publisher) : null,
  isDeleted: Boolean(row.is_deleted),
  customFieldValues: parseJsonObject(row.custom_field_values),
  currentVersionNumber: Number(row.current_version_number),
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapJournalVersion = (row: Record<string, unknown>): JournalVersionRecord => ({
  id: Number(row.id),
  journalId: String(row.journal_id),
  versionNumber: Number(row.version_number),
  changeType: String(row.change_type) as JournalVersionRecord['changeType'],
  snapshot: parseJsonObject(row.snapshot),
  changedByUserId: String(row.changed_by_user_id),
  changeComment: row.change_comment ? String(row.change_comment) : null,
  createdAt: toDate(row.created_at)
});

const mapAttachment = (row: Record<string, unknown>): JournalAttachmentRecord => ({
  id: String(row.id),
  journalId: String(row.journal_id),
  attachmentKey: String(row.attachment_key),
  label: String(row.label),
  category: String(row.category) as AttachmentCategory,
  currentVersionId: row.current_version_id ? String(row.current_version_id) : null,
  currentVersionNumber: row.current_version_number ? Number(row.current_version_number) : null,
  currentStorageType: row.current_storage_type ? (String(row.current_storage_type) as 'FILE' | 'LINK') : null,
  currentFileName: row.current_file_name ? String(row.current_file_name) : null,
  currentMimeType: row.current_mime_type ? String(row.current_mime_type) : null,
  currentExternalUrl: row.current_external_url ? String(row.current_external_url) : null,
  currentSecurityScanStatus: row.current_security_scan_status ? (String(row.current_security_scan_status) as 'CLEAN' | 'WARNING' | 'HELD') : null,
  currentSecurityFindings: Array.isArray(row.current_security_findings) ? row.current_security_findings.map((entry) => String(entry)) : [],
  currentAdminReviewRequired: Boolean(row.current_admin_review_required),
  currentNotes: row.current_notes ? String(row.current_notes) : null,
  createdAt: toDate(row.created_at),
  updatedAt: toDate(row.updated_at)
});

const mapAttachmentVersion = (row: Record<string, unknown>): JournalAttachmentVersionRecord => ({
  id: String(row.id),
  attachmentId: String(row.attachment_id),
  versionNumber: Number(row.version_number),
  storageType: String(row.storage_type) as 'FILE' | 'LINK',
  filePath: row.file_path ? String(row.file_path) : null,
  fileName: row.file_name ? String(row.file_name) : null,
  mimeType: row.mime_type ? String(row.mime_type) : null,
  sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
  externalUrl: row.external_url ? String(row.external_url) : null,
  detectedMimeType: row.detected_mime_type ? String(row.detected_mime_type) : null,
  securityScanStatus: String(row.security_scan_status ?? 'CLEAN') as 'CLEAN' | 'WARNING' | 'HELD',
  securityFindings: Array.isArray(row.security_scan_findings) ? row.security_scan_findings.map((entry) => String(entry)) : [],
  isAdminReviewRequired: Boolean(row.is_admin_review_required),
  notes: row.notes ? String(row.notes) : null,
  createdAt: toDate(row.created_at)
});

const withTransaction = async <T>(pool: Pool, action: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export interface HeldJournalAttachmentVersionRecord {
  versionId: string;
  journalId: string;
  journalTitle: string;
  attachmentId: string;
  attachmentKey: string;
  attachmentLabel: string;
  category: AttachmentCategory;
  fileName: string | null;
  mimeType: string | null;
  securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
  securityFindings: string[];
  createdAt: Date;
}

export const createJournalGovernanceRepository = (pool: Pool, uploadRoot: string) => {
  const listAttachmentsVia = async (client: PoolClient | Pool, journalId: string): Promise<JournalAttachmentRecord[]> => {
    const result = await client.query<Record<string, unknown>>(
      `
      SELECT
        a.id,
        a.journal_id,
        a.attachment_key,
        a.label,
        a.category,
        a.current_version_id,
        a.created_at,
        a.updated_at,
        v.version_number AS current_version_number,
        v.storage_type AS current_storage_type,
        v.file_name AS current_file_name,
        v.mime_type AS current_mime_type,
        v.external_url AS current_external_url,
        v.security_scan_status AS current_security_scan_status,
        v.security_scan_findings AS current_security_findings,
        v.is_admin_review_required AS current_admin_review_required,
        v.notes AS current_notes
      FROM journal_attachments a
      LEFT JOIN journal_attachment_versions v ON v.id = a.current_version_id
      WHERE a.journal_id = $1
      ORDER BY a.created_at ASC
      `,
      [journalId]
    );

    return result.rows.map(mapAttachment);
  };

  const findAttachmentByIdVia = async (client: PoolClient | Pool, attachmentId: string): Promise<JournalAttachmentRecord | null> => {
    const result = await client.query<Record<string, unknown>>(
      `
      SELECT
        a.id,
        a.journal_id,
        a.attachment_key,
        a.label,
        a.category,
        a.current_version_id,
        a.created_at,
        a.updated_at,
        v.version_number AS current_version_number,
        v.storage_type AS current_storage_type,
        v.file_name AS current_file_name,
        v.mime_type AS current_mime_type,
        v.external_url AS current_external_url,
        v.security_scan_status AS current_security_scan_status,
        v.security_scan_findings AS current_security_findings,
        v.is_admin_review_required AS current_admin_review_required,
        v.notes AS current_notes
      FROM journal_attachments a
      LEFT JOIN journal_attachment_versions v ON v.id = a.current_version_id
      WHERE a.id = $1
      `,
      [attachmentId]
    );

    const row = result.rows[0];
    return row ? mapAttachment(row) : null;
  };

  const recordJournalVersion = async (client: PoolClient, input: {
    journalId: string;
    changedByUserId: string;
    changeType: 'CREATED' | 'UPDATED' | 'DELETED';
    changeComment?: string;
  }): Promise<void> => {
    const journalResult = await client.query<Record<string, unknown>>('SELECT * FROM journal_records WHERE id = $1', [input.journalId]);
    const journalRow = journalResult.rows[0];
    if (!journalRow) {
      throw new Error('Journal not found while recording version.');
    }

    const currentVersion = Number(journalRow.current_version_number ?? 0);
    const nextVersion = currentVersion + 1;

    const snapshot = {
      id: String(journalRow.id),
      title: String(journalRow.title),
      issn: journalRow.issn ? String(journalRow.issn) : null,
      publisher: journalRow.publisher ? String(journalRow.publisher) : null,
      isDeleted: Boolean(journalRow.is_deleted),
      customFieldValues: parseJsonObject(journalRow.custom_field_values),
      updatedAt: toDate(journalRow.updated_at).toISOString()
    };

    await client.query(
      `
      INSERT INTO journal_record_versions (
        journal_id,
        version_number,
        change_type,
        snapshot,
        changed_by_user_id,
        change_comment
      ) VALUES ($1,$2,$3,$4::jsonb,$5,$6)
      `,
      [input.journalId, nextVersion, input.changeType, JSON.stringify(snapshot), input.changedByUserId, input.changeComment ?? null]
    );

    await client.query('UPDATE journal_records SET current_version_number = $2, updated_at = NOW() WHERE id = $1', [input.journalId, nextVersion]);
  };

  return {
    async listCustomFieldDefinitions(includeInactive = false): Promise<CustomFieldDefinitionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM journal_custom_field_definitions
        ${includeInactive ? '' : 'WHERE is_active = TRUE'}
        ORDER BY created_at ASC
        `
      );

      return result.rows.map(mapCustomField);
    },

    async createCustomFieldDefinition(input: {
      fieldKey: string;
      label: string;
      fieldType: CustomFieldType;
      isRequired: boolean;
      options: string[];
      helpText?: string;
      createdByUserId: string;
    }): Promise<CustomFieldDefinitionRecord> {
      const result = await pool.query<Record<string, unknown>>(
        `
        INSERT INTO journal_custom_field_definitions (
          field_key,
          label,
          field_type,
          is_required,
          options,
          help_text,
          created_by_user_id,
          updated_by_user_id
        ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$7)
        RETURNING *
        `,
        [input.fieldKey, input.label, input.fieldType, input.isRequired, JSON.stringify(input.options), input.helpText ?? null, input.createdByUserId]
      );

      const row = result.rows[0];
      if (!row) {
        throw new Error('Failed to create custom field definition.');
      }
      return mapCustomField(row);
    },

    async updateCustomFieldDefinition(input: {
      fieldId: string;
      label: string;
      fieldType: CustomFieldType;
      isRequired: boolean;
      options: string[];
      helpText?: string;
      isActive: boolean;
      updatedByUserId: string;
    }): Promise<CustomFieldDefinitionRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        UPDATE journal_custom_field_definitions
        SET label = $2,
            field_type = $3,
            is_required = $4,
            options = $5::jsonb,
            help_text = $6,
            is_active = $7,
            updated_by_user_id = $8,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          input.fieldId,
          input.label,
          input.fieldType,
          input.isRequired,
          JSON.stringify(input.options),
          input.helpText ?? null,
          input.isActive,
          input.updatedByUserId
        ]
      );

      const row = result.rows[0];
      return row ? mapCustomField(row) : null;
    },

    async listJournals(includeDeleted = false): Promise<JournalRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM journal_records
        ${includeDeleted ? '' : 'WHERE is_deleted = FALSE'}
        ORDER BY updated_at DESC
        `
      );

      return result.rows.map(mapJournal);
    },

    async getJournalById(journalId: string): Promise<JournalRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM journal_records WHERE id = $1', [journalId]);
      const row = result.rows[0];
      return row ? mapJournal(row) : null;
    },

    async createJournal(input: {
      title: string;
      issn?: string;
      publisher?: string;
      customFieldValues: Record<string, unknown>;
      actorUserId: string;
      changeComment?: string;
    }): Promise<JournalRecord> {
      return withTransaction(pool, async (client) => {
        const created = await client.query<Record<string, unknown>>(
          `
          INSERT INTO journal_records (
            title,
            issn,
            publisher,
            custom_field_values,
            created_by_user_id,
            updated_by_user_id
          ) VALUES ($1,$2,$3,$4::jsonb,$5,$5)
          RETURNING *
          `,
          [input.title, input.issn ?? null, input.publisher ?? null, JSON.stringify(input.customFieldValues), input.actorUserId]
        );

        const journal = created.rows[0];
        if (!journal) {
          throw new Error('Failed to create journal.');
        }

        const journalId = String(journal.id);
        await recordJournalVersion(client, {
          journalId,
          changedByUserId: input.actorUserId,
          changeType: 'CREATED',
          ...(input.changeComment ? { changeComment: input.changeComment } : {})
        });

        const refreshed = await client.query<Record<string, unknown>>('SELECT * FROM journal_records WHERE id = $1', [journalId]);
        const refreshedRow = refreshed.rows[0];
        if (!refreshedRow) {
          throw new Error('Journal not found after create.');
        }
        return mapJournal(refreshedRow);
      });
    },

    async updateJournal(input: {
      journalId: string;
      title: string;
      issn?: string;
      publisher?: string;
      customFieldValues: Record<string, unknown>;
      actorUserId: string;
      changeComment?: string;
    }): Promise<JournalRecord | null> {
      return withTransaction(pool, async (client) => {
        const updated = await client.query<Record<string, unknown>>(
          `
          UPDATE journal_records
          SET title = $2,
              issn = $3,
              publisher = $4,
              custom_field_values = $5::jsonb,
              updated_by_user_id = $6,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [input.journalId, input.title, input.issn ?? null, input.publisher ?? null, JSON.stringify(input.customFieldValues), input.actorUserId]
        );

        const journal = updated.rows[0];
        if (!journal) {
          return null;
        }

        await recordJournalVersion(client, {
          journalId: input.journalId,
          changedByUserId: input.actorUserId,
          changeType: 'UPDATED',
          ...(input.changeComment ? { changeComment: input.changeComment } : {})
        });

        const refreshed = await client.query<Record<string, unknown>>('SELECT * FROM journal_records WHERE id = $1', [input.journalId]);
        return refreshed.rows[0] ? mapJournal(refreshed.rows[0]) : null;
      });
    },

    async softDeleteJournal(input: { journalId: string; actorUserId: string; changeComment?: string }): Promise<JournalRecord | null> {
      return withTransaction(pool, async (client) => {
        const deleted = await client.query<Record<string, unknown>>(
          `
          UPDATE journal_records
          SET is_deleted = TRUE,
              updated_by_user_id = $2,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [input.journalId, input.actorUserId]
        );

        const journal = deleted.rows[0];
        if (!journal) {
          return null;
        }

        await recordJournalVersion(client, {
          journalId: input.journalId,
          changedByUserId: input.actorUserId,
          changeType: 'DELETED',
          ...(input.changeComment ? { changeComment: input.changeComment } : {})
        });

        const refreshed = await client.query<Record<string, unknown>>('SELECT * FROM journal_records WHERE id = $1', [input.journalId]);
        return refreshed.rows[0] ? mapJournal(refreshed.rows[0]) : null;
      });
    },

    async listJournalVersions(journalId: string): Promise<JournalVersionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM journal_record_versions
        WHERE journal_id = $1
        ORDER BY version_number DESC
        `,
        [journalId]
      );

      return result.rows.map(mapJournalVersion);
    },

    async listAttachments(journalId: string): Promise<JournalAttachmentRecord[]> {
      return listAttachmentsVia(pool, journalId);
    },

    async findAttachmentById(attachmentId: string): Promise<JournalAttachmentRecord | null> {
      return findAttachmentByIdVia(pool, attachmentId);
    },

    async listAttachmentVersions(attachmentId: string): Promise<JournalAttachmentVersionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM journal_attachment_versions
        WHERE attachment_id = $1
        ORDER BY version_number DESC
        `,
        [attachmentId]
      );

      return result.rows.map(mapAttachmentVersion);
    },

    async findAttachmentVersionById(versionId: string): Promise<JournalAttachmentVersionRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM journal_attachment_versions WHERE id = $1', [versionId]);
      const row = result.rows[0];
      return row ? mapAttachmentVersion(row) : null;
    },

    async addLinkAttachmentVersion(input: {
      journalId: string;
      attachmentKey: string;
      label: string;
      category: AttachmentCategory;
      externalUrl: string;
      notes?: string;
      actorUserId: string;
    }): Promise<{ attachment: JournalAttachmentRecord; version: JournalAttachmentVersionRecord }> {
      return withTransaction(pool, async (client) => {
        let attachmentId: string;

        const existing = await client.query<{ id: string }>(
          'SELECT id FROM journal_attachments WHERE journal_id = $1 AND attachment_key = $2 FOR UPDATE',
          [input.journalId, input.attachmentKey]
        );

        if (existing.rows[0]) {
          attachmentId = existing.rows[0].id;
          await client.query(
            `
            UPDATE journal_attachments
            SET label = $2,
                category = $3,
                updated_by_user_id = $4,
                updated_at = NOW()
            WHERE id = $1
            `,
            [attachmentId, input.label, input.category, input.actorUserId]
          );
        } else {
          const created = await client.query<{ id: string }>(
            `
            INSERT INTO journal_attachments (
              journal_id,
              attachment_key,
              label,
              category,
              created_by_user_id,
              updated_by_user_id
            ) VALUES ($1,$2,$3,$4,$5,$5)
            RETURNING id
            `,
            [input.journalId, input.attachmentKey, input.label, input.category, input.actorUserId]
          );

          attachmentId = String(created.rows[0]?.id);
        }

        const count = await client.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM journal_attachment_versions WHERE attachment_id = $1', [
          attachmentId
        ]);
        const nextVersion = Number(count.rows[0]?.total ?? '0') + 1;

        const insertedVersion = await client.query<Record<string, unknown>>(
          `
          INSERT INTO journal_attachment_versions (
            attachment_id,
            version_number,
            storage_type,
            external_url,
            notes,
            created_by_user_id
          ) VALUES ($1,$2,'LINK',$3,$4,$5)
          RETURNING *
          `,
          [attachmentId, nextVersion, input.externalUrl, input.notes ?? null, input.actorUserId]
        );

        const version = insertedVersion.rows[0];
        if (!version) {
          throw new Error('Failed to create journal attachment link version.');
        }

        await client.query(
          'UPDATE journal_attachments SET current_version_id = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1',
          [attachmentId, version.id, input.actorUserId]
        );

        const attachment = await findAttachmentByIdVia(client, attachmentId);
        if (!attachment) {
          throw new Error('Attachment not found after link version insert.');
        }

        return {
          attachment,
          version: mapAttachmentVersion(version)
        };
      });
    },

    async addFileAttachmentVersion(input: {
      journalId: string;
      attachmentKey: string;
      label: string;
      category: AttachmentCategory;
      file: MultipartFile;
      fileBuffer: Buffer;
      normalizedMimeType: string | null;
      detectedMimeType: string | null;
      securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
      securityScanFindings: string[];
      isAdminReviewRequired: boolean;
      notes?: string;
      actorUserId: string;
    }): Promise<{ attachment: JournalAttachmentRecord; version: JournalAttachmentVersionRecord }> {
      const originalName = basename(input.file.filename || 'upload.bin');
      const extension = extname(originalName);
      const storageName = `${randomUUID()}${extension}`;
      const attachmentDir = join(uploadRoot, 'journal-governance', input.journalId, input.attachmentKey);
      await mkdir(attachmentDir, { recursive: true });

      const storagePath = join(attachmentDir, storageName);
      await writeFile(storagePath, input.fileBuffer);

      return withTransaction(pool, async (client) => {
        let attachmentId: string;

        const existing = await client.query<{ id: string }>(
          'SELECT id FROM journal_attachments WHERE journal_id = $1 AND attachment_key = $2 FOR UPDATE',
          [input.journalId, input.attachmentKey]
        );

        if (existing.rows[0]) {
          attachmentId = existing.rows[0].id;
          await client.query(
            `
            UPDATE journal_attachments
            SET label = $2,
                category = $3,
                updated_by_user_id = $4,
                updated_at = NOW()
            WHERE id = $1
            `,
            [attachmentId, input.label, input.category, input.actorUserId]
          );
        } else {
          const created = await client.query<{ id: string }>(
            `
            INSERT INTO journal_attachments (
              journal_id,
              attachment_key,
              label,
              category,
              created_by_user_id,
              updated_by_user_id
            ) VALUES ($1,$2,$3,$4,$5,$5)
            RETURNING id
            `,
            [input.journalId, input.attachmentKey, input.label, input.category, input.actorUserId]
          );

          attachmentId = String(created.rows[0]?.id);
        }

        const count = await client.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM journal_attachment_versions WHERE attachment_id = $1', [
          attachmentId
        ]);
        const nextVersion = Number(count.rows[0]?.total ?? '0') + 1;

        const insertedVersion = await client.query<Record<string, unknown>>(
          `
          INSERT INTO journal_attachment_versions (
            attachment_id,
            version_number,
            storage_type,
            file_path,
            file_name,
            mime_type,
            size_bytes,
            detected_mime_type,
            security_scan_status,
            security_scan_findings,
            is_admin_review_required,
            notes,
            created_by_user_id
          ) VALUES ($1,$2,'FILE',$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
          RETURNING *
          `,
          [
            attachmentId,
            nextVersion,
            storagePath,
            originalName,
            input.normalizedMimeType,
            input.fileBuffer.length,
            input.detectedMimeType,
            input.securityScanStatus,
            JSON.stringify(input.securityScanFindings),
            input.isAdminReviewRequired,
            input.notes ?? null,
            input.actorUserId
          ]
        );

        const version = insertedVersion.rows[0];
        if (!version) {
          throw new Error('Failed to create journal attachment file version.');
        }

        await client.query(
          'UPDATE journal_attachments SET current_version_id = $2, updated_by_user_id = $3, updated_at = NOW() WHERE id = $1',
          [attachmentId, version.id, input.actorUserId]
        );

        const attachment = await findAttachmentByIdVia(client, attachmentId);
        if (!attachment) {
          throw new Error('Attachment not found after file version insert.');
        }

        return {
          attachment,
          version: mapAttachmentVersion(version)
        };
      });
    },

    async listHeldAttachmentVersions(): Promise<HeldJournalAttachmentVersionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          v.id AS version_id,
          v.created_at,
          v.file_name,
          v.mime_type,
          v.security_scan_status,
          v.security_scan_findings,
          a.id AS attachment_id,
          a.attachment_key,
          a.label AS attachment_label,
          a.category,
          j.id AS journal_id,
          j.title AS journal_title
        FROM journal_attachment_versions v
        JOIN journal_attachments a ON a.id = v.attachment_id
        JOIN journal_records j ON j.id = a.journal_id
        WHERE v.is_admin_review_required = TRUE
          AND a.current_version_id = v.id
        ORDER BY v.created_at ASC
        `
      );

      return result.rows.map((row) => ({
        versionId: String(row.version_id),
        journalId: String(row.journal_id),
        journalTitle: String(row.journal_title),
        attachmentId: String(row.attachment_id),
        attachmentKey: String(row.attachment_key),
        attachmentLabel: String(row.attachment_label),
        category: String(row.category) as AttachmentCategory,
        fileName: row.file_name ? String(row.file_name) : null,
        mimeType: row.mime_type ? String(row.mime_type) : null,
        securityScanStatus: String(row.security_scan_status) as 'CLEAN' | 'WARNING' | 'HELD',
        securityFindings: Array.isArray(row.security_scan_findings) ? row.security_scan_findings.map((entry) => String(entry)) : [],
        createdAt: toDate(row.created_at)
      }));
    },

    async releaseHeldAttachmentVersion(input: { versionId: string }): Promise<boolean> {
      const result = await pool.query(
        `
        UPDATE journal_attachment_versions
        SET is_admin_review_required = FALSE,
            security_scan_status = CASE WHEN security_scan_status = 'HELD' THEN 'WARNING' ELSE security_scan_status END
        WHERE id = $1
          AND is_admin_review_required = TRUE
        `,
        [input.versionId]
      );

      return (result.rowCount ?? 0) > 0;
    }
  };
};
