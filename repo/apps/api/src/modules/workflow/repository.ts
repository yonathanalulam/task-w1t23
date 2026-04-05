import type { Pool, PoolClient } from 'pg';
import type { ApplicationStatus } from '../researcher/types.js';
import type {
  EligibilityEvaluation,
  ReviewActionRecord,
  WorkflowApplicationRecord,
  WorkflowDocumentRecord,
  WorkflowDocumentVersionRecord,
  WorkflowStateRecord
} from './types.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(String(value)));

const parseDetails = (value: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(String(value));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
};

const pendingReviewerIterationExpr = 'COALESCE(ws.iteration_number, 0) + 1';
const reviewerAccessIterationExpr = `CASE WHEN a.status IN ('SUBMITTED_ON_TIME', 'SUBMITTED_LATE') THEN ${pendingReviewerIterationExpr} ELSE COALESCE(ws.iteration_number, 0) END`;

const backfillReviewerAssignments = async (client: PoolClient, applicationId?: string) => {
  await client.query(
    `
    WITH reviewer_roster AS (
      SELECT
        ur.user_id,
        ROW_NUMBER() OVER (ORDER BY ur.user_id) AS reviewer_slot,
        COUNT(*) OVER () AS reviewer_count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'reviewer'
    ),
    candidate_apps AS (
      SELECT
        a.id AS application_id,
        ${pendingReviewerIterationExpr} AS iteration_number
      FROM applications a
      LEFT JOIN application_workflow_state ws ON ws.application_id = a.id
      WHERE a.status IN ('SUBMITTED_ON_TIME', 'SUBMITTED_LATE')
        AND ($1::uuid IS NULL OR a.id = $1::uuid)
    ),
    target_assignments AS (
      SELECT
        candidate_apps.application_id,
        candidate_apps.iteration_number,
        reviewer_roster.user_id AS assigned_user_id
      FROM candidate_apps
      JOIN reviewer_roster
        ON reviewer_roster.reviewer_count > 0
       AND ((get_byte(uuid_send(candidate_apps.application_id), 15) % reviewer_roster.reviewer_count) + 1) = reviewer_roster.reviewer_slot
    )
    INSERT INTO application_assignments (
      application_id,
      iteration_number,
      actor_role,
      approval_level,
      assigned_user_id
    )
    SELECT
      target_assignments.application_id,
      target_assignments.iteration_number,
      'reviewer',
      0,
      target_assignments.assigned_user_id
    FROM target_assignments
    ON CONFLICT (application_id, iteration_number, actor_role, approval_level) DO NOTHING
    `,
    [applicationId ?? null]
  );
};

const assignApproversForIteration = async (client: PoolClient, input: {
  applicationId: string;
  iterationNumber: number;
  requiredApprovalLevels: number;
  assignedByUserId: string;
}) => {
  await client.query(
    `
    WITH approver_roster AS (
      SELECT
        ur.user_id,
        ROW_NUMBER() OVER (ORDER BY ur.user_id) AS approver_slot,
        COUNT(*) OVER () AS approver_count
      FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'approver'
    ),
    approval_levels AS (
      SELECT generate_series(1, $3::int) AS approval_level
    )
    INSERT INTO application_assignments (
      application_id,
      iteration_number,
      actor_role,
      approval_level,
      assigned_user_id,
      assigned_by_user_id
    )
    SELECT
      $1::uuid,
      $2::int,
      'approver',
      approval_levels.approval_level,
      approver_roster.user_id,
      $4::uuid
    FROM approval_levels
    JOIN approver_roster
      ON approver_roster.approver_count > 0
     AND (((get_byte(uuid_send($1::uuid), 15) + approval_levels.approval_level - 1) % approver_roster.approver_count) + 1) = approver_roster.approver_slot
    ON CONFLICT (application_id, iteration_number, actor_role, approval_level) DO NOTHING
    `,
    [input.applicationId, input.iterationNumber, input.requiredApprovalLevels, input.assignedByUserId]
  );
};

const mapWorkflowApplication = (row: Record<string, unknown>): WorkflowApplicationRecord => ({
  id: String(row.id),
  policyId: String(row.policy_id),
  policyTitle: String(row.policy_title),
  applicantUserId: String(row.applicant_user_id),
  applicantUsername: String(row.applicant_username),
  title: String(row.title),
  summary: row.summary ? String(row.summary) : null,
  requestedAmount: String(row.requested_amount),
  status: String(row.status) as ApplicationStatus,
  submittedAt: row.submitted_at ? toDate(row.submitted_at) : null,
  periodStart: String(row.period_start),
  periodEnd: String(row.period_end),
  annualCapAmount: String(row.annual_cap_amount),
  approvalLevelsRequired: Number(row.approval_levels_required ?? 1)
});

const mapWorkflowState = (row: Record<string, unknown>): WorkflowStateRecord => ({
  applicationId: String(row.application_id),
  iterationNumber: Number(row.iteration_number),
  requiredApprovalLevels: Number(row.required_approval_levels),
  nextApprovalLevel: row.next_approval_level ? Number(row.next_approval_level) : null,
  lastReviewerDecision: String(row.last_reviewer_decision) as WorkflowStateRecord['lastReviewerDecision'],
  lastReviewedAt: row.last_reviewed_at ? toDate(row.last_reviewed_at) : null,
  updatedAt: toDate(row.updated_at)
});

const mapAction = (row: Record<string, unknown>): ReviewActionRecord => ({
  id: Number(row.id),
  applicationId: String(row.application_id),
  iterationNumber: Number(row.iteration_number),
  actorUserId: String(row.actor_user_id),
  actorUsername: row.actor_username ? String(row.actor_username) : null,
  actorRole: String(row.actor_role) as ReviewActionRecord['actorRole'],
  decision: String(row.decision) as ReviewActionRecord['decision'],
  approvalLevel: Number(row.approval_level),
  comment: String(row.comment),
  details: parseDetails(row.details),
  createdAt: toDate(row.created_at)
});

const mapWorkflowDocument = (row: Record<string, unknown>): WorkflowDocumentRecord => ({
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
  latestSecurityFindings: Array.isArray(row.latest_security_findings) ? row.latest_security_findings.map((entry) => String(entry)) : [],
  latestAdminReviewRequired: Boolean(row.latest_admin_review_required)
});

const mapWorkflowDocumentVersion = (row: Record<string, unknown>): WorkflowDocumentVersionRecord => ({
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

export const createWorkflowRepository = (pool: Pool) => {
  return {
    async listReviewerQueue(actorUserId: string): Promise<WorkflowApplicationRecord[]> {
      await withTransaction(pool, async (client) => {
        await backfillReviewerAssignments(client);
      });

      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          p.title AS policy_title,
          p.period_start,
          p.period_end,
          p.annual_cap_amount,
          p.approval_levels_required,
          u.username::text AS applicant_username
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        JOIN users u ON u.id = a.applicant_user_id
        LEFT JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'reviewer'
         AND aa.approval_level = 0
         AND aa.iteration_number = ${pendingReviewerIterationExpr}
         AND aa.assigned_user_id = $1::uuid
        WHERE a.status IN ('SUBMITTED_ON_TIME', 'SUBMITTED_LATE')
        ORDER BY a.submitted_at ASC NULLS LAST, a.created_at ASC
        `,
        [actorUserId]
      );

      return result.rows.map(mapWorkflowApplication);
    },

    async listApproverQueue(actorUserId: string): Promise<Array<WorkflowApplicationRecord & { nextApprovalLevel: number; iterationNumber: number }>> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          p.title AS policy_title,
          p.period_start,
          p.period_end,
          p.annual_cap_amount,
          p.approval_levels_required,
          u.username::text AS applicant_username,
          ws.next_approval_level,
          ws.iteration_number
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        JOIN users u ON u.id = a.applicant_user_id
        JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'approver'
         AND aa.iteration_number = ws.iteration_number
         AND aa.approval_level = ws.next_approval_level
         AND aa.assigned_user_id = $1::uuid
        WHERE a.status = 'UNDER_REVIEW'
          AND ws.next_approval_level IS NOT NULL
        ORDER BY a.last_status_at ASC, a.created_at ASC
        `,
        [actorUserId]
      );

      return result.rows.map((row) => ({
        ...mapWorkflowApplication(row),
        nextApprovalLevel: Number(row.next_approval_level),
        iterationNumber: Number(row.iteration_number)
      }));
    },

    async getApplicationForWorkflow(applicationId: string): Promise<WorkflowApplicationRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          p.title AS policy_title,
          p.period_start,
          p.period_end,
          p.annual_cap_amount,
          p.approval_levels_required,
          u.username::text AS applicant_username
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        JOIN users u ON u.id = a.applicant_user_id
        WHERE a.id = $1
        `,
        [applicationId]
      );

      const row = result.rows[0];
      return row ? mapWorkflowApplication(row) : null;
    },

    async getReviewerApplicationForActor(applicationId: string, actorUserId: string): Promise<WorkflowApplicationRecord | null> {
      await withTransaction(pool, async (client) => {
        await backfillReviewerAssignments(client, applicationId);
      });

      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          p.title AS policy_title,
          p.period_start,
          p.period_end,
          p.annual_cap_amount,
          p.approval_levels_required,
          u.username::text AS applicant_username
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        JOIN users u ON u.id = a.applicant_user_id
        LEFT JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'reviewer'
         AND aa.approval_level = 0
         AND aa.iteration_number = ${reviewerAccessIterationExpr}
         AND aa.assigned_user_id = $1::uuid
        WHERE a.id = $2
        `,
        [actorUserId, applicationId]
      );

      const row = result.rows[0];
      return row ? mapWorkflowApplication(row) : null;
    },

    async getApproverApplicationForActor(applicationId: string, actorUserId: string): Promise<WorkflowApplicationRecord | null> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          p.title AS policy_title,
          p.period_start,
          p.period_end,
          p.annual_cap_amount,
          p.approval_levels_required,
          u.username::text AS applicant_username
        FROM applications a
        JOIN funding_policies p ON p.id = a.policy_id
        JOIN users u ON u.id = a.applicant_user_id
        JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'approver'
         AND aa.iteration_number = ws.iteration_number
         AND aa.approval_level = ws.next_approval_level
         AND aa.assigned_user_id = $1::uuid
        WHERE a.id = $2
        `,
        [actorUserId, applicationId]
      );

      const row = result.rows[0];
      return row ? mapWorkflowApplication(row) : null;
    },

    async getWorkflowState(applicationId: string): Promise<WorkflowStateRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM application_workflow_state WHERE application_id = $1', [applicationId]);
      const row = result.rows[0];
      return row ? mapWorkflowState(row) : null;
    },

    async listReviewActions(applicationId: string): Promise<ReviewActionRecord[]> {
      const result = await pool.query<Record<string, unknown>>(
        `
        SELECT
          a.*,
          u.username::text AS actor_username
        FROM application_review_actions a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.application_id = $1
        ORDER BY a.created_at ASC, a.id ASC
        `,
        [applicationId]
      );

      return result.rows.map(mapAction);
    },

    async getLatestEligibilityValidation(applicationId: string): Promise<EligibilityEvaluation | null> {
      const result = await pool.query<{ details: unknown; passed: boolean; created_at: Date }>(
        `
        SELECT details, passed, created_at
        FROM application_validations
        WHERE application_id = $1
          AND validation_type = 'review_eligibility'
        ORDER BY created_at DESC
        LIMIT 1
        `,
        [applicationId]
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const details = parseDetails(row.details);
      const checksRaw = Array.isArray(details.checks) ? details.checks : [];
      const checks = checksRaw
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          const rowValue = entry as Record<string, unknown>;
          return {
            key: String(rowValue.key ?? 'unknown'),
            passed: Boolean(rowValue.passed),
            reason: String(rowValue.reason ?? '')
          };
        })
        .filter((entry): entry is { key: string; passed: boolean; reason: string } => Boolean(entry));

      return {
        eligible: Boolean(row.passed),
        checks,
        evaluatedAt: toDate(row.created_at).toISOString()
      };
    },

    async listRequiredTemplateKeys(policyId: string): Promise<string[]> {
      const result = await pool.query<{ template_key: string }>(
        `
        SELECT template_key
        FROM policy_required_document_templates
        WHERE policy_id = $1
          AND is_required = TRUE
        ORDER BY created_at ASC
        `,
        [policyId]
      );

      return result.rows.map((row) => row.template_key);
    },

    async listSubmittedDocumentKeys(applicationId: string): Promise<string[]> {
      const result = await pool.query<{ document_key: string }>(
        `
        SELECT d.document_key
        FROM application_documents d
        JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.application_id = $1
          AND d.latest_version_id IS NOT NULL
          AND v.is_admin_review_required = FALSE
          AND v.security_scan_status <> 'HELD'
        ORDER BY d.created_at ASC
        `,
        [applicationId]
      );

      return result.rows.map((row) => row.document_key);
    },

    async listApplicationDocuments(applicationId: string): Promise<WorkflowDocumentRecord[]> {
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

      return result.rows.map(mapWorkflowDocument);
    },

    async findReviewerApplicationDocumentById(applicationId: string, documentId: string, actorUserId: string): Promise<WorkflowDocumentRecord | null> {
      await withTransaction(pool, async (client) => {
        await backfillReviewerAssignments(client, applicationId);
      });

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
        JOIN applications a ON a.id = d.application_id
        LEFT JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'reviewer'
         AND aa.approval_level = 0
         AND aa.iteration_number = ${reviewerAccessIterationExpr}
         AND aa.assigned_user_id = $1::uuid
        LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.application_id = $2
          AND d.id = $3
        `,
        [actorUserId, applicationId, documentId]
      );

      const row = result.rows[0];
      return row ? mapWorkflowDocument(row) : null;
    },

    async findApproverApplicationDocumentById(applicationId: string, documentId: string, actorUserId: string): Promise<WorkflowDocumentRecord | null> {
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
        JOIN applications a ON a.id = d.application_id
        JOIN application_workflow_state ws ON ws.application_id = a.id
        JOIN application_assignments aa
          ON aa.application_id = a.id
         AND aa.actor_role = 'approver'
         AND aa.iteration_number = ws.iteration_number
         AND aa.approval_level = ws.next_approval_level
         AND aa.assigned_user_id = $1::uuid
        LEFT JOIN application_document_versions v ON v.id = d.latest_version_id
        WHERE d.application_id = $2
          AND d.id = $3
        `,
        [actorUserId, applicationId, documentId]
      );

      const row = result.rows[0];
      return row ? mapWorkflowDocument(row) : null;
    },

    async findApplicationDocumentVersionById(versionId: string): Promise<WorkflowDocumentVersionRecord | null> {
      const result = await pool.query<Record<string, unknown>>('SELECT * FROM application_document_versions WHERE id = $1', [versionId]);
      const row = result.rows[0];
      return row ? mapWorkflowDocumentVersion(row) : null;
    },

    async insertValidation(input: {
      applicationId: string;
      validationType: string;
      passed: boolean;
      details: Record<string, unknown>;
    }): Promise<void> {
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

    async getNextWorkflowIteration(applicationId: string): Promise<number> {
      const result = await pool.query<{ next_iteration: string }>(
        `
        SELECT (COALESCE(MAX(iteration_number), 0) + 1)::text AS next_iteration
        FROM application_review_actions
        WHERE application_id = $1
        `,
        [applicationId]
      );

      return Number(result.rows[0]?.next_iteration ?? '1');
    },

    async applyReviewerDecision(input: {
      applicationId: string;
      actorUserId: string;
      iterationNumber: number;
      requiredApprovalLevels: number;
      comment: string;
      decision: 'REVIEW_FORWARD' | 'REVIEW_RETURN' | 'REVIEW_REJECT';
      nextStatus: ApplicationStatus;
      eligibility: EligibilityEvaluation;
    }): Promise<void> {
      await withTransaction(pool, async (client) => {
        const previous = await client.query<{ status: string }>('SELECT status FROM applications WHERE id = $1 FOR UPDATE', [input.applicationId]);
        const previousStatus = previous.rows[0]?.status ?? null;

        const nextApprovalLevel = input.decision === 'REVIEW_FORWARD' ? 1 : null;
        const lastReviewerDecision =
          input.decision === 'REVIEW_FORWARD' ? 'FORWARDED' : input.decision === 'REVIEW_RETURN' ? 'RETURNED' : 'REJECTED';

        await client.query(
          `
          INSERT INTO application_workflow_state (
            application_id,
            iteration_number,
            required_approval_levels,
            next_approval_level,
            last_reviewer_decision,
            last_reviewed_at,
            updated_at
          ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
          ON CONFLICT (application_id)
          DO UPDATE SET
            iteration_number = EXCLUDED.iteration_number,
            required_approval_levels = EXCLUDED.required_approval_levels,
            next_approval_level = EXCLUDED.next_approval_level,
            last_reviewer_decision = EXCLUDED.last_reviewer_decision,
            last_reviewed_at = NOW(),
            updated_at = NOW()
          `,
          [input.applicationId, input.iterationNumber, input.requiredApprovalLevels, nextApprovalLevel, lastReviewerDecision]
        );

        await client.query(
          `
          INSERT INTO application_review_actions (
            application_id,
            iteration_number,
            actor_user_id,
            actor_role,
            decision,
            approval_level,
            comment,
            details
          ) VALUES ($1,$2,$3,'reviewer',$4,0,$5,$6::jsonb)
          `,
          [
            input.applicationId,
            input.iterationNumber,
            input.actorUserId,
            input.decision,
            input.comment,
            JSON.stringify({ eligibility: input.eligibility })
          ]
        );

        if (input.decision === 'REVIEW_FORWARD') {
          await assignApproversForIteration(client, {
            applicationId: input.applicationId,
            iterationNumber: input.iterationNumber,
            requiredApprovalLevels: input.requiredApprovalLevels,
            assignedByUserId: input.actorUserId
          });
        }

        await client.query(
          `
          UPDATE applications
          SET status = $2,
              last_status_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
          `,
          [input.applicationId, input.nextStatus]
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
          [
            input.applicationId,
            previousStatus,
            input.nextStatus,
            input.actorUserId,
            input.decision === 'REVIEW_FORWARD'
              ? 'review_forward_to_approval'
              : input.decision === 'REVIEW_RETURN'
                ? 'review_return_for_revision'
                : 'review_reject'
          ]
        );
      });
    },

    async applyApproverDecision(input: {
      applicationId: string;
      actorUserId: string;
      iterationNumber: number;
      approvalLevel: number;
      requiredApprovalLevels: number;
      decision: 'APPROVE_LEVEL' | 'REJECT_LEVEL';
      comment: string;
      nextStatus: ApplicationStatus | null;
    }): Promise<void> {
      await withTransaction(pool, async (client) => {
        const previous = await client.query<{ status: string }>('SELECT status FROM applications WHERE id = $1 FOR UPDATE', [input.applicationId]);
        const previousStatus = previous.rows[0]?.status ?? null;

        await client.query(
          `
          INSERT INTO application_review_actions (
            application_id,
            iteration_number,
            actor_user_id,
            actor_role,
            decision,
            approval_level,
            comment,
            details
          ) VALUES ($1,$2,$3,'approver',$4,$5,$6,$7::jsonb)
          `,
          [
            input.applicationId,
            input.iterationNumber,
            input.actorUserId,
            input.decision,
            input.approvalLevel,
            input.comment,
            JSON.stringify({ requiredApprovalLevels: input.requiredApprovalLevels })
          ]
        );

        const nextApprovalLevel =
          input.decision === 'APPROVE_LEVEL' && input.approvalLevel < input.requiredApprovalLevels ? input.approvalLevel + 1 : null;

        await client.query(
          `
          UPDATE application_workflow_state
          SET next_approval_level = $2,
              updated_at = NOW()
          WHERE application_id = $1
          `,
          [input.applicationId, nextApprovalLevel]
        );

        if (input.nextStatus) {
          await client.query(
            `
            UPDATE applications
            SET status = $2,
                last_status_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            `,
            [input.applicationId, input.nextStatus]
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
            [
              input.applicationId,
              previousStatus,
              input.nextStatus,
              input.actorUserId,
              input.decision === 'REJECT_LEVEL' ? `approval_rejected_level_${input.approvalLevel}` : 'approval_finalized'
            ]
          );
        }
      });
    }
  };
};
