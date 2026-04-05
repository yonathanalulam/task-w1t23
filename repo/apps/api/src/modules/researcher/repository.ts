import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve, sep } from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import type { Pool, PoolClient } from 'pg';
import type { ApplicationStatus } from './types.js';

export interface PolicyTemplateRecord {
  id: string;
  templateKey: string;
  label: string;
  instructions: string | null;
  isRequired: boolean;
}

export interface PolicyRecord {
  id: string;
  title: string;
  description: string | null;
  periodStart: string;
  periodEnd: string;
  submissionDeadlineAt: Date;
  graceHours: number;
  annualCapAmount: string;
  approvalLevelsRequired: number;
  isActive: boolean;
  templates: PolicyTemplateRecord[];
}

export interface ApplicationRecord {
  id: string;
  policyId: string;
  applicantUserId: string;
  title: string;
  summary: string | null;
  requestedAmount: string;
  status: ApplicationStatus;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  periodStart: string;
  periodEnd: string;
  submissionDeadlineAt: Date;
  graceHours: number;
  annualCapAmount: string;
  extensionUntil: Date | null;
  extensionUsedAt: Date | null;
}

export interface ApplicationDocumentRecord {
  id: string;
  applicationId: string;
  documentKey: string;
  label: string;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  latestStorageType: 'FILE' | 'LINK' | null;
  latestMimeType: string | null;
  latestFileName: string | null;
  latestExternalUrl: string | null;
  latestIsPreviewable: boolean;
  latestSecurityScanStatus: 'CLEAN' | 'WARNING' | 'HELD' | null;
  latestSecurityFindings: string[];
  latestAdminReviewRequired: boolean;
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionNumber: number;
  storageType: 'FILE' | 'LINK';
  filePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  externalUrl: string | null;
  isPreviewable: boolean;
  detectedMimeType: string | null;
  securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
  securityFindings: string[];
  isAdminReviewRequired: boolean;
  createdAt: Date;
}

export interface HeldApplicationDocumentVersionRecord {
  versionId: string;
  applicationId: string;
  applicationTitle: string;
  applicantUserId: string;
  applicantUsername: string;
  documentId: string;
  documentKey: string;
  documentLabel: string;
  fileName: string | null;
  mimeType: string | null;
  securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
  securityFindings: string[];
  createdAt: Date;
}

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

const toDateOnly = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
};

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

const documentKeyRegex = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

const assertSafeDocumentKey = (documentKey: string) => {
  if (!documentKeyRegex.test(documentKey)) {
    const error = new Error('Invalid document key');
    (error as Error & { code?: string }).code = 'INVALID_DOCUMENT_KEY';
    throw error;
  }
};

const resolveUploadDirectory = (uploadRoot: string, applicationId: string, documentKey: string): string => {
  assertSafeDocumentKey(documentKey);
  const resolvedRoot = resolve(uploadRoot);
  const resolvedDirectory = resolve(join(resolvedRoot, applicationId, documentKey));
  const allowedPrefix = `${resolvedRoot}${sep}`;

  if (resolvedDirectory !== resolvedRoot && !resolvedDirectory.startsWith(allowedPrefix)) {
    const error = new Error('Resolved upload path escaped configured root');
    (error as Error & { code?: string }).code = 'UNSAFE_UPLOAD_PATH';
    throw error;
  }

  return resolvedDirectory;
};

const mapPolicy = (row: Record<string, unknown>, templates: PolicyTemplateRecord[]): PolicyRecord => {
  return {
    id: String(row.id),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    periodStart: toDateOnly(row.period_start),
    periodEnd: toDateOnly(row.period_end),
    submissionDeadlineAt: toDate(row.submission_deadline_at),
    graceHours: Number(row.grace_hours),
    annualCapAmount: String(row.annual_cap_amount),
    approvalLevelsRequired: Number(row.approval_levels_required ?? 1),
    isActive: Boolean(row.is_active),
    templates
  };
};

const mapApplication = (row: Record<string, unknown>): ApplicationRecord => {
  return {
    id: String(row.id),
    policyId: String(row.policy_id),
    applicantUserId: String(row.applicant_user_id),
    title: String(row.title),
    summary: row.summary ? String(row.summary) : null,
    requestedAmount: String(row.requested_amount),
    status: String(row.status) as ApplicationStatus,
    submittedAt: row.submitted_at ? toDate(row.submitted_at) : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    periodStart: toDateOnly(row.period_start),
    periodEnd: toDateOnly(row.period_end),
    submissionDeadlineAt: toDate(row.submission_deadline_at),
    graceHours: Number(row.grace_hours),
    annualCapAmount: String(row.annual_cap_amount),
    extensionUntil: row.extended_until ? toDate(row.extended_until) : null,
    extensionUsedAt: row.extension_used_at ? toDate(row.extension_used_at) : null
  };
};

const mapDocument = (row: Record<string, unknown>): ApplicationDocumentRecord => {
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    documentKey: String(row.document_key),
    label: String(row.label),
    latestVersionId: row.latest_version_id ? String(row.latest_version_id) : null,
    latestVersionNumber: row.latest_version_number ? Number(row.latest_version_number) : null,
    latestStorageType: row.latest_storage_type ? (String(row.latest_storage_type) as 'FILE' | 'LINK') : null,
    latestMimeType: row.latest_mime_type ? String(row.latest_mime_type) : null,
    latestFileName: row.latest_file_name ? String(row.latest_file_name) : null,
    latestExternalUrl: row.latest_external_url ? String(row.latest_external_url) : null,
    latestIsPreviewable: Boolean(row.latest_is_previewable),
    latestSecurityScanStatus: row.latest_security_scan_status ? (String(row.latest_security_scan_status) as 'CLEAN' | 'WARNING' | 'HELD') : null,
    latestSecurityFindings: Array.isArray(row.latest_security_findings)
      ? row.latest_security_findings.map((entry) => String(entry))
      : [],
    latestAdminReviewRequired: Boolean(row.latest_admin_review_required)
  };
};

const mapVersion = (row: Record<string, unknown>): DocumentVersionRecord => {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    versionNumber: Number(row.version_number),
    storageType: String(row.storage_type) as 'FILE' | 'LINK',
    filePath: row.file_path ? String(row.file_path) : null,
    fileName: row.file_name ? String(row.file_name) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    sizeBytes: row.size_bytes ? Number(row.size_bytes) : null,
    externalUrl: row.external_url ? String(row.external_url) : null,
    isPreviewable: Boolean(row.is_previewable),
    detectedMimeType: row.detected_mime_type ? String(row.detected_mime_type) : null,
    securityScanStatus: String(row.security_scan_status ?? 'CLEAN') as 'CLEAN' | 'WARNING' | 'HELD',
    securityFindings: Array.isArray(row.security_scan_findings) ? row.security_scan_findings.map((entry) => String(entry)) : [],
    isAdminReviewRequired: Boolean(row.is_admin_review_required),
    createdAt: toDate(row.created_at)
  };
};

const getOrCreateDocumentForUpdate = async (client: PoolClient, input: {
  applicationId: string;
  documentKey: string;
  label: string;
  createdByUserId: string;
}): Promise<string> => {
  await client.query('SELECT id FROM applications WHERE id = $1 FOR UPDATE', [input.applicationId]);

  const existing = await client.query<{ id: string }>(
    'SELECT id FROM application_documents WHERE application_id = $1 AND document_key = $2 FOR UPDATE',
    [input.applicationId, input.documentKey]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const created = await client.query<{ id: string }>(
    `
    INSERT INTO application_documents (
      application_id,
      document_key,
      label,
      created_by_user_id
    ) VALUES ($1,$2,$3,$4)
    RETURNING id
    `,
    [input.applicationId, input.documentKey, input.label, input.createdByUserId]
  );

  return String(created.rows[0]?.id);
};

const getNextDocumentVersionNumber = async (client: PoolClient, documentId: string): Promise<number> => {
  const countResult = await client.query<{ total: string }>(
    'SELECT COUNT(*)::text AS total FROM application_document_versions WHERE document_id = $1',
    [documentId]
  );
  const currentVersions = Number(countResult.rows[0]?.total ?? '0');
  if (currentVersions >= 20) {
    const error = new Error('Document version limit reached');
    (error as Error & { code?: string }).code = 'DOCUMENT_VERSION_LIMIT_REACHED';
    throw error;
  }

  return currentVersions + 1;
};

const countOverlappingApplications = async (client: PoolClient | Pool, input: {
  applicantUserId: string;
  periodStart: string;
  periodEnd: string;
  excludeApplicationId?: string;
}): Promise<number> => {
  const result = await client.query<{ total: string }>(
    `
    SELECT COUNT(*)::text AS total
    FROM applications a
    JOIN funding_policies p ON p.id = a.policy_id
    WHERE a.applicant_user_id = $1
      AND daterange(p.period_start, p.period_end, '[]') && daterange($2::date, $3::date, '[]')
      AND ($4::uuid IS NULL OR a.id <> $4::uuid)
    `,
    [input.applicantUserId, input.periodStart, input.periodEnd, input.excludeApplicationId ?? null]
  );

  return Number(result.rows[0]?.total ?? '0');
};

export const createResearcherRepository = (pool: Pool, uploadRoot: string) => {
  const getPolicyTemplates = async (client: PoolClient | Pool, policyId: string): Promise<PolicyTemplateRecord[]> => {
    const result = await client.query<Record<string, unknown>>(
      `
      SELECT id, template_key, label, instructions, is_required
      FROM policy_required_document_templates
      WHERE policy_id = $1
      ORDER BY created_at ASC
      `,
      [policyId]
    );

    return result.rows.map((row) => ({
      id: String(row.id),
      templateKey: String(row.template_key),
      label: String(row.label),
      instructions: row.instructions ? String(row.instructions) : null,
      isRequired: Boolean(row.is_required)
    }));
  };

  const findDocumentByIdViaClient = async (client: PoolClient | Pool, documentId: string): Promise<ApplicationDocumentRecord | null> => {
    const result = await client.query<Record<string, unknown>>(
      `
      SELECT
        d.id,
        d.application_id,
        d.document_key,
        d.label,
        d.latest_version_id,
        v.version_number AS latest_version_number,
        v.storage_type AS latest_storage_type,
        v.mime_type AS latest_mime_type,
        v.file_name AS latest_file_name,
        v.external_url AS latest_external_url,
        v.is_previewable AS latest_is_previewable,
        v.security_scan_status AS latest_security_scan_status,
        v.security_scan_findings AS latest_security_findings,
        v.is_admin_review_required AS latest_admin_review_required
      FROM application_documents d
      LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
      WHERE d.id = $1
      `,
      [documentId]
    );

    const row = result.rows[0];
    return row ? mapDocument(row) : null;
  };

  const repository = {
    async withTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
      return withTransaction(pool, action);
    },

    async lockApplicantForSubmission(client: PoolClient, applicantUserId: string): Promise<void> {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [applicantUserId]);
    },

    async listPolicies(includeInactive = false): Promise<PolicyRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM funding_policies
        ${includeInactive ? '' : 'WHERE is_active = TRUE'}
        ORDER BY submission_deadline_at ASC
        `
      );

      const policies: PolicyRecord[] = [];
      for (const row of result.rows) {
        const templates = await getPolicyTemplates(pool, String(row.id));
        policies.push(mapPolicy(row, templates));
      }

      return policies;
    },

    async createPolicy(input: {
      title: string;
      description?: string;
      periodStart: string;
      periodEnd: string;
      submissionDeadlineAt: string;
      graceHours: number;
      annualCapAmount: string;
      approvalLevelsRequired: number;
      isActive: boolean;
      createdByUserId: string;
      templates: Array<{ templateKey: string; label: string; instructions?: string; isRequired: boolean }>;
    }): Promise<PolicyRecord> {
      return withTransaction(pool, async (client) => {
        const created = await client.query<Record<string, unknown>>(
          `
          INSERT INTO funding_policies (
            title,
            description,
            period_start,
            period_end,
            submission_deadline_at,
            grace_hours,
            annual_cap_amount,
            approval_levels_required,
            is_active,
            created_by_user_id
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING *
          `,
          [
            input.title,
            input.description ?? null,
            input.periodStart,
            input.periodEnd,
            input.submissionDeadlineAt,
            input.graceHours,
            input.annualCapAmount,
            input.approvalLevelsRequired,
            input.isActive,
            input.createdByUserId
          ]
        );

        const policy = created.rows[0];
        if (!policy) {
          throw new Error('Failed to create policy');
        }

        for (const template of input.templates) {
          await client.query(
            `
            INSERT INTO policy_required_document_templates (
              policy_id,
              template_key,
              label,
              instructions,
              is_required
            ) VALUES ($1,$2,$3,$4,$5)
            `,
            [policy.id, template.templateKey, template.label, template.instructions ?? null, template.isRequired]
          );
        }

        const templates = await getPolicyTemplates(client, String(policy.id));
        return mapPolicy(policy, templates);
      });
    },

    async updatePolicy(policyId: string, input: {
      title: string;
      description?: string;
      periodStart: string;
      periodEnd: string;
      submissionDeadlineAt: string;
      graceHours: number;
      annualCapAmount: string;
      approvalLevelsRequired: number;
      isActive: boolean;
      templates: Array<{ templateKey: string; label: string; instructions?: string; isRequired: boolean }>;
    }): Promise<PolicyRecord | null> {
      return withTransaction(pool, async (client) => {
        const updated = await client.query<Record<string, unknown>>(
          `
          UPDATE funding_policies
          SET title = $2,
              description = $3,
              period_start = $4,
              period_end = $5,
              submission_deadline_at = $6,
              grace_hours = $7,
              annual_cap_amount = $8,
              approval_levels_required = $9,
              is_active = $10,
              updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [
            policyId,
            input.title,
            input.description ?? null,
            input.periodStart,
            input.periodEnd,
            input.submissionDeadlineAt,
            input.graceHours,
            input.annualCapAmount,
            input.approvalLevelsRequired,
            input.isActive
          ]
        );

        const policy = updated.rows[0];
        if (!policy) {
          return null;
        }

        await client.query('DELETE FROM policy_required_document_templates WHERE policy_id = $1', [policyId]);
        for (const template of input.templates) {
          await client.query(
            `
            INSERT INTO policy_required_document_templates (
              policy_id,
              template_key,
              label,
              instructions,
              is_required
            ) VALUES ($1,$2,$3,$4,$5)
            `,
            [policyId, template.templateKey, template.label, template.instructions ?? null, template.isRequired]
          );
        }

        const templates = await getPolicyTemplates(client, policyId);
        return mapPolicy(policy, templates);
      });
    },

    async getPolicyById(policyId: string): Promise<PolicyRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM funding_policies WHERE id = $1', [policyId]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const templates = await getPolicyTemplates(pool, policyId);
      return mapPolicy(row, templates);
    },

    async getPolicyByIdInTransaction(client: PoolClient, policyId: string): Promise<PolicyRecord | null> {
      const result = await client.query<Record<string, unknown>>('SELECT * FROM funding_policies WHERE id = $1', [policyId]);
      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const templates = await getPolicyTemplates(client, policyId);
      return mapPolicy(row, templates);
    },

    async createApplication(input: {
      policyId: string;
      applicantUserId: string;
      title: string;
      summary?: string;
      requestedAmount: string;
    }): Promise<ApplicationRecord> {
      const appId = await withTransaction(pool, async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.applicantUserId]);

        const policyResult = await client.query<Record<string, unknown>>(
          'SELECT period_start, period_end FROM funding_policies WHERE id = $1',
          [input.policyId]
        );
        const policy = policyResult.rows[0];
        if (!policy) {
          throw new Error('Policy not found for application creation');
        }

        const duplicateCount = await countOverlappingApplications(client, {
          applicantUserId: input.applicantUserId,
          periodStart: toDateOnly(policy.period_start),
          periodEnd: toDateOnly(policy.period_end)
        });

        if (duplicateCount > 0) {
          const error = new Error('Duplicate application in overlapping policy period.');
          (error as Error & { code?: string }).code = 'APPLICATION_PERIOD_DUPLICATE';
          throw error;
        }

        const result = await client.query<Record<string, unknown>>(
          `
          INSERT INTO applications (
            policy_id,
            applicant_user_id,
            title,
            summary,
            requested_amount,
            status
          ) VALUES ($1,$2,$3,$4,$5,'DRAFT')
          RETURNING id
          `,
          [input.policyId, input.applicantUserId, input.title, input.summary ?? null, input.requestedAmount]
        );

        const appId = String(result.rows[0]?.id);
        await client.query(
          `
          INSERT INTO application_status_history (
            application_id,
            previous_status,
            next_status,
            changed_by_user_id,
            reason
          ) VALUES ($1,$2,$3,$4,$5)
          `,
          [appId, null, 'DRAFT', input.applicantUserId, 'draft_created']
        );

        return appId;
      });

      const application = await repository.getApplicationById(appId);
      if (!application) {
        throw new Error('Failed to create application');
      }

      return application;
    },

    async listApplicationsByResearcher(researcherId: string): Promise<ApplicationRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*, p.period_start, p.period_end, p.submission_deadline_at, p.grace_hours, p.annual_cap_amount,
          e.extended_until, e.used_at AS extension_used_at
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        LEFT JOIN application_extensions e ON e.application_id = a.id
        WHERE a.applicant_user_id = $1
        ORDER BY a.created_at DESC
        `,
        [researcherId]
      );

      return result.rows.map(mapApplication);
    },

    async getApplicationById(applicationId: string): Promise<ApplicationRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*, p.period_start, p.period_end, p.submission_deadline_at, p.grace_hours, p.annual_cap_amount,
          e.extended_until, e.used_at AS extension_used_at
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        LEFT JOIN application_extensions e ON e.application_id = a.id
        WHERE a.id = $1
        `,
        [applicationId]
      );

      const row = result.rows[0];
      return row ? mapApplication(row) : null;
    },

    async getApplicationByIdForUpdate(client: PoolClient, applicationId: string): Promise<ApplicationRecord | null> {
      const result = await client.query<Record<string, unknown>>(
        `
        SELECT
          a.*, p.period_start, p.period_end, p.submission_deadline_at, p.grace_hours, p.annual_cap_amount,
          e.extended_until, e.used_at AS extension_used_at
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        LEFT JOIN application_extensions e ON e.application_id = a.id
        WHERE a.id = $1
        FOR UPDATE OF a
        `,
        [applicationId]
      );

      const row = result.rows[0];
      return row ? mapApplication(row) : null;
    },

    async countOtherApplicationsInOverlappingPeriod(input: {
      applicantUserId: string;
      periodStart: string;
      periodEnd: string;
      excludeApplicationId: string;
    }): Promise<number> {
      return countOverlappingApplications(pool, input);
    },

    async countOtherApplicationsInOverlappingPeriodInTransaction(client: PoolClient, input: {
      applicantUserId: string;
      periodStart: string;
      periodEnd: string;
      excludeApplicationId: string;
    }): Promise<number> {
      return countOverlappingApplications(client, input);
    },

    async sumYearlySubmittedAmounts(input: {
      applicantUserId: string;
      fiscalYearStart: string;
      fiscalYearEndExclusive: string;
      excludeApplicationId: string;
    }): Promise<number> {
      const result = await pool.query<{ total: string }>(
        `
        SELECT COALESCE(SUM(a.requested_amount), 0)::text AS total
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        WHERE a.applicant_user_id = $1
          AND a.id <> $2
          AND a.status IN ('SUBMITTED_ON_TIME', 'SUBMITTED_LATE', 'APPROVED')
          AND p.period_start >= $3
          AND p.period_start < $4
        `,
        [input.applicantUserId, input.excludeApplicationId, input.fiscalYearStart, input.fiscalYearEndExclusive]
      );

      return Number(result.rows[0]?.total ?? '0');
    },

    async sumYearlySubmittedAmountsInTransaction(client: PoolClient, input: {
      applicantUserId: string;
      fiscalYearStart: string;
      fiscalYearEndExclusive: string;
      excludeApplicationId: string;
    }): Promise<number> {
      const result = await client.query<{ total: string }>(
        `
        SELECT COALESCE(SUM(a.requested_amount), 0)::text AS total
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        WHERE a.applicant_user_id = $1
          AND a.id <> $2
          AND a.status IN ('SUBMITTED_ON_TIME', 'SUBMITTED_LATE', 'APPROVED')
          AND p.period_start >= $3
          AND p.period_start < $4
        `,
        [input.applicantUserId, input.excludeApplicationId, input.fiscalYearStart, input.fiscalYearEndExclusive]
      );

      return Number(result.rows[0]?.total ?? '0');
    },

    async insertValidation(input: { applicationId: string; validationType: string; passed: boolean; details: Record<string, unknown> }): Promise<void> {
      await pool.query(
        `
        INSERT INTO application_validations (
          application_id,
          validation_type,
          passed,
          details
        ) VALUES ($1,$2,$3,$4::jsonb)
        `,
        [input.applicationId, input.validationType, input.passed, JSON.stringify(input.details)]
      );
    },

    async insertValidationInTransaction(client: PoolClient, input: { applicationId: string; validationType: string; passed: boolean; details: Record<string, unknown> }): Promise<void> {
      await client.query(
        `
        INSERT INTO application_validations (
          application_id,
          validation_type,
          passed,
          details
        ) VALUES ($1,$2,$3,$4::jsonb)
        `,
        [input.applicationId, input.validationType, input.passed, JSON.stringify(input.details)]
      );
    },

    async updateApplicationStatus(input: {
      applicationId: string;
      nextStatus: ApplicationStatus;
      changedByUserId: string;
      reason: string;
      markSubmittedAt: boolean;
    }): Promise<void> {
      const previous = await pool.query<{ status: string }>('SELECT status FROM applications WHERE id = $1', [input.applicationId]);
      const previousStatus = previous.rows[0]?.status ?? null;

      await pool.query(
        `
        UPDATE applications
        SET status = $2,
            submitted_at = CASE WHEN $3 THEN NOW() ELSE submitted_at END,
            last_status_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [input.applicationId, input.nextStatus, input.markSubmittedAt]
      );

      await pool.query(
        `
        INSERT INTO application_status_history (
          application_id,
          previous_status,
          next_status,
          changed_by_user_id,
          reason
        ) VALUES ($1,$2,$3,$4,$5)
        `,
        [input.applicationId, previousStatus, input.nextStatus, input.changedByUserId, input.reason]
      );
    },

    async updateApplicationStatusInTransaction(client: PoolClient, input: {
      applicationId: string;
      nextStatus: ApplicationStatus;
      changedByUserId: string;
      reason: string;
      markSubmittedAt: boolean;
    }): Promise<void> {
      const previous = await client.query<{ status: string }>('SELECT status FROM applications WHERE id = $1', [input.applicationId]);
      const previousStatus = previous.rows[0]?.status ?? null;

      await client.query(
        `
        UPDATE applications
        SET status = $2,
            submitted_at = CASE WHEN $3 THEN NOW() ELSE submitted_at END,
            last_status_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [input.applicationId, input.nextStatus, input.markSubmittedAt]
      );

      await client.query(
        `
        INSERT INTO application_status_history (
          application_id,
          previous_status,
          next_status,
          changed_by_user_id,
          reason
        ) VALUES ($1,$2,$3,$4,$5)
        `,
        [input.applicationId, previousStatus, input.nextStatus, input.changedByUserId, input.reason]
      );
    },

    async listDocumentsInTransaction(client: PoolClient, applicationId: string): Promise<ApplicationDocumentRecord[]> {
      const result = await client.query<Record<string, unknown>>(
        `
        SELECT
          d.id,
          d.application_id,
          d.document_key,
          d.label,
          d.latest_version_id,
          v.version_number AS latest_version_number,
          v.storage_type AS latest_storage_type,
          v.mime_type AS latest_mime_type,
          v.file_name AS latest_file_name,
          v.external_url AS latest_external_url,
          v.is_previewable AS latest_is_previewable,
          v.security_scan_status AS latest_security_scan_status,
          v.security_scan_findings AS latest_security_findings,
          v.is_admin_review_required AS latest_admin_review_required
        FROM application_documents d
        LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.application_id = $1
        ORDER BY d.created_at ASC
        `,
        [applicationId]
      );

      return result.rows.map(mapDocument);
    },

    async markExtensionUsedInTransaction(client: PoolClient, applicationId: string): Promise<void> {
      await client.query(
        `
        UPDATE application_extensions
        SET used_at = NOW()
        WHERE application_id = $1
          AND used_at IS NULL
        `,
        [applicationId]
      );
    },

    async listDocuments(applicationId: string): Promise<ApplicationDocumentRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          d.id,
          d.application_id,
          d.document_key,
          d.label,
          d.latest_version_id,
          v.version_number AS latest_version_number,
          v.storage_type AS latest_storage_type,
          v.mime_type AS latest_mime_type,
          v.file_name AS latest_file_name,
          v.external_url AS latest_external_url,
          v.is_previewable AS latest_is_previewable,
          v.security_scan_status AS latest_security_scan_status,
          v.security_scan_findings AS latest_security_findings,
          v.is_admin_review_required AS latest_admin_review_required
        FROM application_documents d
        LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.application_id = $1
        ORDER BY d.created_at ASC
        `,
        [applicationId]
      );

      return result.rows.map(mapDocument);
    },

    async findDocumentById(documentId: string): Promise<ApplicationDocumentRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          d.id,
          d.application_id,
          d.document_key,
          d.label,
          d.latest_version_id,
          v.version_number AS latest_version_number,
          v.storage_type AS latest_storage_type,
          v.mime_type AS latest_mime_type,
          v.file_name AS latest_file_name,
          v.external_url AS latest_external_url,
          v.is_previewable AS latest_is_previewable,
          v.security_scan_status AS latest_security_scan_status,
          v.security_scan_findings AS latest_security_findings,
          v.is_admin_review_required AS latest_admin_review_required
        FROM application_documents d
        LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.id = $1
        `,
        [documentId]
      );

      const row = result.rows[0];
      return row ? mapDocument(row) : null;
    },

    async listDocumentVersions(documentId: string): Promise<DocumentVersionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT *
        FROM application_document_versions
        WHERE document_id = $1
        ORDER BY version_number DESC
        `,
        [documentId]
      );

      return result.rows.map(mapVersion);
    },

    async findDocumentVersionById(versionId: string): Promise<DocumentVersionRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM application_document_versions WHERE id = $1', [versionId]);
      const row = result.rows[0];
      return row ? mapVersion(row) : null;
    },

    async addLinkDocumentVersion(input: {
      applicationId: string;
      documentKey: string;
      label: string;
      externalUrl: string;
      createdByUserId: string;
    }): Promise<{ document: ApplicationDocumentRecord; version: DocumentVersionRecord }> {
      return withTransaction(pool, async (client) => {
        assertSafeDocumentKey(input.documentKey);
        const documentId = await getOrCreateDocumentForUpdate(client, input);
        const nextVersion = await getNextDocumentVersionNumber(client, documentId);

        const versionResult = await client.query<Record<string, unknown>>(
          `
          INSERT INTO application_document_versions (
            document_id,
            version_number,
            storage_type,
            external_url,
            is_previewable,
            created_by_user_id
          ) VALUES ($1,$2,'LINK',$3,FALSE,$4)
          RETURNING *
          `,
          [documentId, nextVersion, input.externalUrl, input.createdByUserId]
        );

        const versionId = String(versionResult.rows[0]?.id);
        const insertedVersion = versionResult.rows[0];
        if (!insertedVersion) {
          throw new Error('Failed to insert link document version');
        }

        await client.query(
          'UPDATE application_documents SET latest_version_id = $2, label = $3, updated_at = NOW() WHERE id = $1',
          [documentId, versionId, input.label]
        );

        const document = await findDocumentByIdViaClient(client, documentId);
        const version = mapVersion(insertedVersion);

        if (!document) {
          throw new Error('Document was not found after link version insert');
        }

        return { document, version };
      });
    },

    async addFileDocumentVersion(input: {
      applicationId: string;
      documentKey: string;
      label: string;
      file: MultipartFile;
      createdByUserId: string;
      fileBuffer: Buffer;
      normalizedMimeType: string | null;
      detectedMimeType: string | null;
      isPreviewable: boolean;
      securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
      securityScanFindings: string[];
      isAdminReviewRequired: boolean;
    }): Promise<{ document: ApplicationDocumentRecord; version: DocumentVersionRecord }> {
      return withTransaction(pool, async (client) => {
        assertSafeDocumentKey(input.documentKey);
        const originalName = basename(input.file.filename || 'upload.bin');
        const extension = extname(originalName);
        const storageName = `${randomUUID()}${extension}`;
        const policyDir = resolveUploadDirectory(uploadRoot, input.applicationId, input.documentKey);
        await mkdir(policyDir, { recursive: true });

        const storagePath = resolve(join(policyDir, storageName));
        const allowedPrefix = `${resolve(uploadRoot)}${sep}`;
        if (!storagePath.startsWith(allowedPrefix)) {
          const error = new Error('Resolved upload file path escaped configured root');
          (error as Error & { code?: string }).code = 'UNSAFE_UPLOAD_PATH';
          throw error;
        }

        const documentId = await getOrCreateDocumentForUpdate(client, input);
        const nextVersion = await getNextDocumentVersionNumber(client, documentId);

        await writeFile(storagePath, input.fileBuffer);

        const versionResult = await client.query<Record<string, unknown>>(
          `
          INSERT INTO application_document_versions (
            document_id,
            version_number,
            storage_type,
            file_path,
            file_name,
            mime_type,
            size_bytes,
            is_previewable,
            detected_mime_type,
            security_scan_status,
            security_scan_findings,
            is_admin_review_required,
            created_by_user_id
          ) VALUES ($1,$2,'FILE',$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)
          RETURNING *
          `,
          [
            documentId,
            nextVersion,
            storagePath,
            originalName,
            input.normalizedMimeType,
            input.fileBuffer.length,
            input.isPreviewable,
            input.detectedMimeType,
            input.securityScanStatus,
            JSON.stringify(input.securityScanFindings),
            input.isAdminReviewRequired,
            input.createdByUserId
          ]
        );

        const versionId = String(versionResult.rows[0]?.id);
        const insertedVersion = versionResult.rows[0];
        if (!insertedVersion) {
          throw new Error('Failed to insert file document version');
        }

        await client.query(
          'UPDATE application_documents SET latest_version_id = $2, label = $3, updated_at = NOW() WHERE id = $1',
          [documentId, versionId, input.label]
        );

        const document = await findDocumentByIdViaClient(client, documentId);
        const version = mapVersion(insertedVersion);

        if (!document) {
          throw new Error('Document was not found after file version insert');
        }

        return { document, version };
      });
    },

    async countDocumentVersions(documentId: string): Promise<number> {
      const result = await pool.query<{ total: string }>('SELECT COUNT(*)::text AS total FROM application_document_versions WHERE document_id = $1', [
        documentId
      ]);
      return Number(result.rows[0]?.total ?? '0');
    },

    async listHeldDocumentVersions(): Promise<HeldApplicationDocumentVersionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          v.id AS version_id,
          v.created_at,
          v.file_name,
          v.mime_type,
          v.security_scan_status,
          v.security_scan_findings,
          d.id AS document_id,
          d.document_key,
          d.label AS document_label,
          d.application_id,
          a.title AS application_title,
          a.applicant_user_id,
          u.username AS applicant_username
        FROM application_document_versions v
        JOIN application_documents d ON d.id = v.document_id
        JOIN applications a ON a.id = d.application_id
        JOIN users u ON u.id = a.applicant_user_id
        WHERE v.is_admin_review_required = TRUE
          AND d.latest_version_id = v.id
        ORDER BY v.created_at ASC
        `
      );

      return result.rows.map((row) => ({
        versionId: String(row.version_id),
        applicationId: String(row.application_id),
        applicationTitle: String(row.application_title),
        applicantUserId: String(row.applicant_user_id),
        applicantUsername: String(row.applicant_username),
        documentId: String(row.document_id),
        documentKey: String(row.document_key),
        documentLabel: String(row.document_label),
        fileName: row.file_name ? String(row.file_name) : null,
        mimeType: row.mime_type ? String(row.mime_type) : null,
        securityScanStatus: String(row.security_scan_status) as 'CLEAN' | 'WARNING' | 'HELD',
        securityFindings: Array.isArray(row.security_scan_findings) ? row.security_scan_findings.map((entry) => String(entry)) : [],
        createdAt: toDate(row.created_at)
      }));
    },

    async releaseHeldDocumentVersion(input: { versionId: string }): Promise<boolean> {
      const result = await pool.query(
        `
        UPDATE application_document_versions
        SET is_admin_review_required = FALSE,
            security_scan_status = CASE WHEN security_scan_status = 'HELD' THEN 'WARNING' ELSE security_scan_status END
        WHERE id = $1
          AND is_admin_review_required = TRUE
        `,
        [input.versionId]
      );

      return (result.rowCount ?? 0) > 0;
    },

    async rollbackDocumentVersion(input: { documentId: string; targetVersionId: string; actorUserId: string }): Promise<void> {
      await withTransaction(pool, async (client) => {
        await client.query('UPDATE application_documents SET latest_version_id = $2, updated_at = NOW() WHERE id = $1', [
          input.documentId,
          input.targetVersionId
        ]);

        await client.query(
          `
          INSERT INTO document_rollbacks (
            document_id,
            target_version_id,
            rolled_back_by_user_id
          ) VALUES ($1,$2,$3)
          `,
          [input.documentId, input.targetVersionId, input.actorUserId]
        );
      });
    },

    async markExtensionUsed(applicationId: string): Promise<void> {
      await pool.query('UPDATE application_extensions SET used_at = NOW() WHERE application_id = $1 AND used_at IS NULL', [applicationId]);
    },

    async createExtension(input: {
      applicationId: string;
      grantedByUserId: string;
      reason: string;
      extendedUntil: string;
    }): Promise<void> {
      await pool.query(
        `
        INSERT INTO application_extensions (
          application_id,
          granted_by_user_id,
          reason,
          extended_until
        ) VALUES ($1,$2,$3,$4)
        `,
        [input.applicationId, input.grantedByUserId, input.reason, input.extendedUntil]
      );
    }
  };

  return repository;
};
