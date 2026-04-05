import type { MultipartFile } from '@fastify/multipart';
import { HttpError } from '../../lib/http-error.js';
import { analyzeUploadedFile } from '../../lib/upload-security.js';
import type { PoolClient } from 'pg';
import type { AuditWriteInput } from '../audit/types.js';
import { MAX_DOCUMENT_VERSIONS, DEFAULT_MAX_UPLOAD_BYTES, evaluateDeadlineWindow } from './rules.js';
import type { createResearcherRepository } from './repository.js';

type ResearcherRepository = ReturnType<typeof createResearcherRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const withMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const editableStatuses = new Set(['DRAFT', 'RETURNED_FOR_REVISION', 'BLOCKED_LATE']);

export const createResearcherService = (deps: {
  repository: ResearcherRepository;
  audit: AuditWriter;
  maxUploadBytes?: number;
}) => {
  const { repository, audit } = deps;
  const maxUploadBytes = deps.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES;

  const ensureOwnApplication = async (applicationId: string, actorUserId: string) => {
    const application = await repository.getApplicationById(applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    if (application.applicantUserId !== actorUserId) {
      throw new HttpError(403, 'FORBIDDEN', 'Application does not belong to the current user.');
    }

    return application;
  };

  const validateRequiredDocuments = async (applicationId: string, policyId: string): Promise<string[]> => {
    const policy = await repository.getPolicyById(policyId);
    if (!policy) {
      throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
    }

    const requiredTemplateKeys = policy.templates.filter((template) => template.isRequired).map((template) => template.templateKey);
    const documents = await repository.listDocuments(applicationId);
    const submittedKeys = new Set(
      documents
        .filter((document) => document.latestVersionId && !document.latestAdminReviewRequired && document.latestSecurityScanStatus !== 'HELD')
        .map((document) => document.documentKey)
    );

    return requiredTemplateKeys.filter((templateKey) => !submittedKeys.has(templateKey));
  };

  const validateRequiredDocumentsInTransaction = async (client: PoolClient, applicationId: string, policyId: string): Promise<string[]> => {
    const policy = await repository.getPolicyByIdInTransaction(client, policyId);
    if (!policy) {
      throw new HttpError(404, 'POLICY_NOT_FOUND', 'Funding policy was not found.');
    }

    const requiredTemplateKeys = policy.templates.filter((template) => template.isRequired).map((template) => template.templateKey);
    const documents = await repository.listDocumentsInTransaction(client, applicationId);
    const submittedKeys = new Set(
      documents
        .filter((document) => document.latestVersionId && !document.latestAdminReviewRequired && document.latestSecurityScanStatus !== 'HELD')
        .map((document) => document.documentKey)
    );

    return requiredTemplateKeys.filter((templateKey) => !submittedKeys.has(templateKey));
  };

  const computeFiscalYearRange = (periodStartDate: string): { fiscalYearStart: string; fiscalYearEndExclusive: string } => {
    const fiscalYear = new Date(`${periodStartDate}T00:00:00.000Z`).getUTCFullYear();
    return {
      fiscalYearStart: `${fiscalYear}-01-01`,
      fiscalYearEndExclusive: `${fiscalYear + 1}-01-01`
    };
  };

  return {
    async submitApplication(input: {
      applicationId: string;
      actorUserId: string;
      mode: 'submit' | 'resubmit';
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const application = await repository.withTransaction(async (client) => {
        const application = await repository.getApplicationByIdForUpdate(client, input.applicationId);
        if (!application) {
          throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
        }

        if (application.applicantUserId !== input.actorUserId) {
          throw new HttpError(403, 'FORBIDDEN', 'Application does not belong to the current user.');
        }

        await repository.lockApplicantForSubmission(client, application.applicantUserId);

        if (input.mode === 'resubmit' && application.status !== 'RETURNED_FOR_REVISION') {
          throw new HttpError(409, 'RESUBMIT_NOT_ALLOWED', 'Resubmission is only allowed for returned applications.');
        }

        if (!editableStatuses.has(application.status)) {
          throw new HttpError(409, 'SUBMIT_NOT_ALLOWED', `Cannot submit while application is in status ${application.status}.`);
        }

        const duplicateCount = await repository.countOtherApplicationsInOverlappingPeriodInTransaction(client, {
          applicantUserId: application.applicantUserId,
          periodStart: application.periodStart,
          periodEnd: application.periodEnd,
          excludeApplicationId: application.id
        });

        const duplicatePass = duplicateCount === 0;
        await repository.insertValidationInTransaction(client, {
          applicationId: application.id,
          validationType: 'duplicate_policy_period',
          passed: duplicatePass,
          details: {
            duplicateCount
          }
        });

        if (!duplicatePass) {
          throw new HttpError(409, 'DUPLICATE_APPLICATION', 'Duplicate application in the same policy period is not allowed.');
        }

        const missingRequiredDocs = await validateRequiredDocumentsInTransaction(client, application.id, application.policyId);
        const requiredPass = missingRequiredDocs.length === 0;
        await repository.insertValidationInTransaction(client, {
          applicationId: application.id,
          validationType: 'required_documents',
          passed: requiredPass,
          details: { missingTemplateKeys: missingRequiredDocs }
        });

        if (!requiredPass) {
          throw new HttpError(400, 'MISSING_REQUIRED_DOCUMENTS', 'Required documents are missing.', {
            missingTemplateKeys: missingRequiredDocs
          });
        }

        const fiscalRange = computeFiscalYearRange(application.periodStart);
        const yearlySum = await repository.sumYearlySubmittedAmountsInTransaction(client, {
          applicantUserId: application.applicantUserId,
          fiscalYearStart: fiscalRange.fiscalYearStart,
          fiscalYearEndExclusive: fiscalRange.fiscalYearEndExclusive,
          excludeApplicationId: application.id
        });
        const capAmount = Number(application.annualCapAmount);
        const requestedAmount = Number(application.requestedAmount);
        const capPass = yearlySum + requestedAmount <= capAmount;

        await repository.insertValidationInTransaction(client, {
          applicationId: application.id,
          validationType: 'annual_cap',
          passed: capPass,
          details: {
            requestedAmount,
            alreadyCommittedAmount: yearlySum,
            annualCapAmount: capAmount
          }
        });

        if (!capPass) {
          throw new HttpError(409, 'FUNDING_CAP_EXCEEDED', 'Annual policy funding cap would be exceeded by this submission.', {
            requestedAmount,
            alreadyCommittedAmount: yearlySum,
            annualCapAmount: capAmount
          });
        }

        const deadlineEvaluation = evaluateDeadlineWindow({
          submissionDeadlineAt: application.submissionDeadlineAt,
          graceHours: application.graceHours,
          now: new Date(),
          extensionUntil: application.extensionUntil,
          extensionUsedAt: application.extensionUsedAt
        });

        await repository.insertValidationInTransaction(client, {
          applicationId: application.id,
          validationType: 'deadline_window',
          passed: deadlineEvaluation.mode !== 'blocked',
          details: {
            mode: deadlineEvaluation.mode,
            deadlineAt: deadlineEvaluation.deadlineAt.toISOString(),
            graceDeadlineAt: deadlineEvaluation.graceDeadlineAt.toISOString(),
            evaluatedAt: deadlineEvaluation.evaluatedAt.toISOString(),
            message: deadlineEvaluation.message
          }
        });

        if (deadlineEvaluation.mode === 'blocked') {
          await repository.updateApplicationStatusInTransaction(client, {
            applicationId: application.id,
            nextStatus: 'BLOCKED_LATE',
            changedByUserId: input.actorUserId,
            reason: 'submission_blocked_after_grace',
            markSubmittedAt: false
          });

          throw new HttpError(409, 'SUBMISSION_BLOCKED_LATE', 'Submission is blocked because grace period has passed.');
        }

        if (deadlineEvaluation.mode === 'extension_allowed') {
          await repository.markExtensionUsedInTransaction(client, application.id);
        }

        await repository.updateApplicationStatusInTransaction(client, {
          applicationId: application.id,
          nextStatus: deadlineEvaluation.statusOnSuccess,
          changedByUserId: input.actorUserId,
          reason: input.mode === 'submit' ? 'submitted' : 'resubmitted',
          markSubmittedAt: true
        });

        return application.id;
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: input.mode === 'submit' ? 'APPLICATION_SUBMITTED' : 'APPLICATION_RESUBMITTED',
        entityType: 'application',
        entityId: application,
        outcome: 'success',
        details: {
          mode: input.mode
        },
        ...withMeta(input.meta)
      });

      return repository.getApplicationById(application);
    },

    async addFileVersion(input: {
      applicationId: string;
      actorUserId: string;
      documentKey: string;
      label: string;
      file: MultipartFile;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const application = await ensureOwnApplication(input.applicationId, input.actorUserId);
      if (!editableStatuses.has(application.status)) {
        throw new HttpError(409, 'DOCUMENT_EDIT_NOT_ALLOWED', 'Document versions can only be edited on editable applications.');
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

      let saved;
      try {
        saved = await repository.addFileDocumentVersion({
          applicationId: application.id,
          documentKey: input.documentKey,
          label: input.label,
          file: input.file,
          createdByUserId: input.actorUserId,
          fileBuffer,
          normalizedMimeType: security.normalizedMimeType,
          detectedMimeType: security.detectedMimeType,
          isPreviewable: security.isPreviewable,
          securityScanStatus: security.status,
          securityScanFindings: security.findings,
          isAdminReviewRequired: security.holdForAdminReview
        });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code ?? '') : '';
        if (code === 'DOCUMENT_VERSION_LIMIT_REACHED') {
          throw new HttpError(409, 'DOCUMENT_VERSION_LIMIT_REACHED', 'This file has reached the maximum of 20 versions.');
        }
        if (code === 'INVALID_DOCUMENT_KEY' || code === 'UNSAFE_UPLOAD_PATH') {
          throw new HttpError(400, 'INVALID_DOCUMENT_KEY', 'documentKey must use only letters, numbers, dots, underscores, and hyphens.');
        }
        throw error;
      }

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_DOCUMENT_VERSION_ADDED',
        entityType: 'application_document',
        entityId: saved.document.id,
        outcome: 'success',
        details: {
          storageType: 'FILE',
          versionNumber: saved.version.versionNumber,
          documentKey: saved.document.documentKey,
          securityScanStatus: saved.version.securityScanStatus,
          isAdminReviewRequired: saved.version.isAdminReviewRequired,
          securityFindings: saved.version.securityFindings
        },
        ...withMeta(input.meta)
      });

      return saved;
    },

    async addLinkVersion(input: {
      applicationId: string;
      actorUserId: string;
      documentKey: string;
      label: string;
      externalUrl: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const application = await ensureOwnApplication(input.applicationId, input.actorUserId);
      if (!editableStatuses.has(application.status)) {
        throw new HttpError(409, 'DOCUMENT_EDIT_NOT_ALLOWED', 'Document versions can only be edited on editable applications.');
      }

      let parsed: URL;
      try {
        parsed = new URL(input.externalUrl);
      } catch {
        throw new HttpError(400, 'INVALID_EXTERNAL_URL', 'Invalid URL format.');
      }

      if (!['https:', 'http:'].includes(parsed.protocol)) {
        throw new HttpError(400, 'UNSAFE_LINK_PROTOCOL', 'Only HTTP and HTTPS links are allowed.');
      }

      let saved;
      try {
        saved = await repository.addLinkDocumentVersion({
          applicationId: application.id,
          documentKey: input.documentKey,
          label: input.label,
          externalUrl: input.externalUrl,
          createdByUserId: input.actorUserId
        });
      } catch (error) {
        const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code ?? '') : '';
        if (code === 'DOCUMENT_VERSION_LIMIT_REACHED') {
          throw new HttpError(409, 'DOCUMENT_VERSION_LIMIT_REACHED', 'This link has reached the maximum of 20 versions.');
        }
        if (code === 'INVALID_DOCUMENT_KEY' || code === 'UNSAFE_UPLOAD_PATH') {
          throw new HttpError(400, 'INVALID_DOCUMENT_KEY', 'documentKey must use only letters, numbers, dots, underscores, and hyphens.');
        }
        throw error;
      }

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_DOCUMENT_VERSION_ADDED',
        entityType: 'application_document',
        entityId: saved.document.id,
        outcome: 'success',
        details: {
          storageType: 'LINK',
          versionNumber: saved.version.versionNumber,
          documentKey: saved.document.documentKey
        },
        ...withMeta(input.meta)
      });

      return saved;
    },

    async rollbackVersion(input: {
      applicationId: string;
      actorUserId: string;
      documentId: string;
      targetVersionId: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const application = await ensureOwnApplication(input.applicationId, input.actorUserId);
      if (!editableStatuses.has(application.status)) {
        throw new HttpError(409, 'DOCUMENT_EDIT_NOT_ALLOWED', 'Rollback is only allowed on editable applications.');
      }

      const document = await repository.findDocumentById(input.documentId);
      if (!document || document.applicationId !== application.id) {
        throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
      }

      const version = await repository.findDocumentVersionById(input.targetVersionId);
      if (!version || version.documentId !== document.id) {
        throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Target document version was not found.');
      }

      await repository.rollbackDocumentVersion({
        documentId: document.id,
        targetVersionId: version.id,
        actorUserId: input.actorUserId
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_DOCUMENT_ROLLBACK',
        entityType: 'application_document',
        entityId: document.id,
        outcome: 'success',
        details: {
          targetVersionId: version.id,
          targetVersionNumber: version.versionNumber
        },
        ...withMeta(input.meta)
      });
    },

    async grantExtension(input: {
      applicationId: string;
      actorUserId: string;
      reason: string;
      extendedUntil: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const application = await repository.getApplicationById(input.applicationId);
      if (!application) {
        throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
      }

      if (!editableStatuses.has(application.status)) {
        throw new HttpError(409, 'EXTENSION_NOT_ALLOWED', 'Extension can only be granted for editable applications.');
      }

      if (application.extensionUntil) {
        throw new HttpError(409, 'EXTENSION_ALREADY_GRANTED', 'A one-time extension has already been granted.');
      }

      const extendedUntilDate = new Date(input.extendedUntil);
      if (Number.isNaN(extendedUntilDate.getTime())) {
        throw new HttpError(400, 'INVALID_EXTENSION_TIME', 'Extended-until value must be a valid date-time.');
      }

      await repository.createExtension({
        applicationId: input.applicationId,
        grantedByUserId: input.actorUserId,
        reason: input.reason,
        extendedUntil: extendedUntilDate.toISOString()
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_EXTENSION_GRANTED',
        entityType: 'application',
        entityId: input.applicationId,
        outcome: 'success',
        details: {
          reason: input.reason,
          extendedUntil: extendedUntilDate.toISOString()
        },
        ...withMeta(input.meta)
      });

      return repository.getApplicationById(input.applicationId);
    }
  };
};
