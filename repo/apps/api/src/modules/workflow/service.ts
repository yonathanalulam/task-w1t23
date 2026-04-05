import { HttpError } from '../../lib/http-error.js';
import type { AuditWriteInput } from '../audit/types.js';
import type { createWorkflowRepository } from './repository.js';
import type { ApproverDecision, EligibilityCheck, EligibilityEvaluation, ReviewerDecision } from './types.js';

type WorkflowRepository = ReturnType<typeof createWorkflowRepository>;

interface AuditWriter {
  write(input: AuditWriteInput): Promise<void>;
}

const reviewerEligibleStatuses = new Set(['SUBMITTED_ON_TIME', 'SUBMITTED_LATE']);
const reviewerVisibleStatuses = new Set(['SUBMITTED_ON_TIME', 'SUBMITTED_LATE', 'UNDER_REVIEW', 'RETURNED_FOR_REVISION', 'APPROVED', 'REJECTED']);

const withMeta = (meta: { requestId?: string; ip?: string; userAgent?: string }) => ({
  ...(meta.requestId ? { requestId: meta.requestId } : {}),
  ...(meta.ip ? { ip: meta.ip } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
});

const normalizeComment = (raw: string, code: string, message: string): string => {
  const comment = raw.trim();
  if (comment.length < 3) {
    throw new HttpError(400, code, message);
  }
  return comment;
};

const buildEligibilityChecks = (input: {
  status: string;
  requiredTemplateKeys: string[];
  submittedDocumentKeys: string[];
  requestedAmount: string;
  annualCapAmount: string;
}): EligibilityCheck[] => {
  const submittedSet = new Set(input.submittedDocumentKeys);
  const missingTemplates = input.requiredTemplateKeys.filter((key) => !submittedSet.has(key));
  const requestedAmount = Number(input.requestedAmount);
  const annualCapAmount = Number(input.annualCapAmount);

  const checks: EligibilityCheck[] = [
    {
      key: 'submitted_status',
      passed: reviewerEligibleStatuses.has(input.status),
      reason: reviewerEligibleStatuses.has(input.status)
        ? 'Application is in a submitted status and can enter review.'
        : `Application status ${input.status} is not eligible for review intake.`
    },
    {
      key: 'required_documents_present',
      passed: missingTemplates.length === 0,
      reason:
        missingTemplates.length === 0
          ? 'All required policy templates currently have an active submission.'
          : `Missing required template submissions: ${missingTemplates.join(', ')}`
    },
    {
      key: 'requested_amount_within_policy_cap',
      passed: requestedAmount <= annualCapAmount,
      reason:
        requestedAmount <= annualCapAmount
          ? `Requested amount ${requestedAmount.toFixed(2)} is within policy cap ${annualCapAmount.toFixed(2)}.`
          : `Requested amount ${requestedAmount.toFixed(2)} exceeds policy cap ${annualCapAmount.toFixed(2)}.`
    }
  ];

  return checks;
};

const evaluateEligibility = (checks: EligibilityCheck[]): EligibilityEvaluation => {
  return {
    eligible: checks.every((entry) => entry.passed),
    checks,
    evaluatedAt: new Date().toISOString()
  };
};

export const createWorkflowService = (deps: { repository: WorkflowRepository; audit: AuditWriter }) => {
  const { repository, audit } = deps;

  const ensureReviewerVisibleApplication = async (applicationId: string, actorUserId: string) => {
    const application = await repository.getApplicationForWorkflow(applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    if (!reviewerVisibleStatuses.has(application.status)) {
      throw new HttpError(403, 'FORBIDDEN', 'Application is not visible in reviewer workflow surfaces.');
    }

    const assignedApplication = await repository.getReviewerApplicationForActor(applicationId, actorUserId);
    if (!assignedApplication) {
      throw new HttpError(403, 'FORBIDDEN', 'Application is not assigned to the current reviewer.');
    }

    return assignedApplication;
  };

  const ensureApproverVisibleApplication = async (applicationId: string, actorUserId: string) => {
    const application = await repository.getApplicationForWorkflow(applicationId);
    if (!application) {
      throw new HttpError(404, 'APPLICATION_NOT_FOUND', 'Application was not found.');
    }

    const workflowState = await repository.getWorkflowState(applicationId);
    if (application.status !== 'UNDER_REVIEW' || !workflowState?.nextApprovalLevel) {
      throw new HttpError(403, 'FORBIDDEN', 'Application is not in an approver-signoff state.');
    }

    const assignedApplication = await repository.getApproverApplicationForActor(applicationId, actorUserId);
    if (!assignedApplication) {
      throw new HttpError(403, 'FORBIDDEN', 'Application is not assigned to the current approver.');
    }

    return { application: assignedApplication, workflowState };
  };

  const resolveDocumentAccess = async (input: {
    applicationId: string;
    documentId: string;
    actorUserId: string;
    role: 'reviewer' | 'approver';
  }) => {
    if (input.role === 'reviewer') {
      await ensureReviewerVisibleApplication(input.applicationId, input.actorUserId);
    } else {
      await ensureApproverVisibleApplication(input.applicationId, input.actorUserId);
    }

    const document =
      input.role === 'reviewer'
        ? await repository.findReviewerApplicationDocumentById(input.applicationId, input.documentId, input.actorUserId)
        : await repository.findApproverApplicationDocumentById(input.applicationId, input.documentId, input.actorUserId);

    if (!document || document.applicationId !== input.applicationId) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', 'Document was not found.');
    }

    if (!document.latestVersionId) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'No active version found for this document.');
    }

    const version = await repository.findApplicationDocumentVersionById(document.latestVersionId);
    if (!version || version.documentId !== document.id) {
      throw new HttpError(404, 'DOCUMENT_VERSION_NOT_FOUND', 'Document version was not found.');
    }

    if (version.isAdminReviewRequired || version.securityScanStatus === 'HELD') {
      throw new HttpError(423, 'DOCUMENT_HELD_FOR_ADMIN_REVIEW', 'Document is currently held for administrator review and is not accessible.');
    }

    return { document, version };
  };

  return {
    async reviewerQueue(actorUserId: string) {
      return repository.listReviewerQueue(actorUserId);
    },

    async approverQueue(actorUserId: string) {
      return repository.listApproverQueue(actorUserId);
    },

    async reviewerDetail(applicationId: string, actorUserId: string) {
      const application = await ensureReviewerVisibleApplication(applicationId, actorUserId);

      const [workflowState, reviewActions, latestEligibility, documents] = await Promise.all([
        repository.getWorkflowState(applicationId),
        repository.listReviewActions(applicationId),
        repository.getLatestEligibilityValidation(applicationId),
        repository.listApplicationDocuments(applicationId)
      ]);

      return {
        application,
        workflowState,
        reviewActions,
        latestEligibility,
        documents
      };
    },

    async approverDetail(applicationId: string, actorUserId: string) {
      const { application, workflowState } = await ensureApproverVisibleApplication(applicationId, actorUserId);

      const [reviewActions, latestEligibility, documents] = await Promise.all([
        repository.listReviewActions(applicationId),
        repository.getLatestEligibilityValidation(applicationId),
        repository.listApplicationDocuments(applicationId)
      ]);

      return {
        application,
        workflowState,
        reviewActions,
        latestEligibility,
        documents
      };
    },

    async reviewerDocumentAccess(applicationId: string, documentId: string, actorUserId: string) {
      return resolveDocumentAccess({ applicationId, documentId, actorUserId, role: 'reviewer' });
    },

    async approverDocumentAccess(applicationId: string, documentId: string, actorUserId: string) {
      return resolveDocumentAccess({ applicationId, documentId, actorUserId, role: 'approver' });
    },

    async reviewerDecision(input: {
      applicationId: string;
      actorUserId: string;
      decision: ReviewerDecision;
      comment: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const comment = normalizeComment(
        input.comment,
        'REVIEW_COMMENT_REQUIRED',
        'Reviewer decision requires a comment with at least 3 characters.'
      );

      const application = await ensureReviewerVisibleApplication(input.applicationId, input.actorUserId);

      if (!reviewerEligibleStatuses.has(application.status)) {
        throw new HttpError(409, 'REVIEW_NOT_ALLOWED', `Cannot review application while status is ${application.status}.`);
      }

      const [requiredTemplateKeys, submittedDocumentKeys] = await Promise.all([
        repository.listRequiredTemplateKeys(application.policyId),
        repository.listSubmittedDocumentKeys(application.id)
      ]);

      const checks = buildEligibilityChecks({
        status: application.status,
        requiredTemplateKeys,
        submittedDocumentKeys,
        requestedAmount: application.requestedAmount,
        annualCapAmount: application.annualCapAmount
      });

      const eligibility = evaluateEligibility(checks);
      const iterationNumber = await repository.getNextWorkflowIteration(application.id);

      await repository.insertValidation({
        applicationId: application.id,
        validationType: 'review_eligibility',
        passed: eligibility.eligible,
        details: {
          iterationNumber,
          checks: eligibility.checks,
          evaluatedAt: eligibility.evaluatedAt
        }
      });

      if (input.decision === 'forward_to_approval' && !eligibility.eligible) {
        throw new HttpError(409, 'ELIGIBILITY_FAILED', 'Eligibility checks failed; cannot forward to approval.', {
          checks: eligibility.checks
        });
      }

      const nextStatus =
        input.decision === 'forward_to_approval'
          ? 'UNDER_REVIEW'
          : input.decision === 'return_for_revision'
            ? 'RETURNED_FOR_REVISION'
            : 'REJECTED';

      const repositoryDecision =
        input.decision === 'forward_to_approval'
          ? 'REVIEW_FORWARD'
          : input.decision === 'return_for_revision'
            ? 'REVIEW_RETURN'
            : 'REVIEW_REJECT';

      await repository.applyReviewerDecision({
        applicationId: application.id,
        actorUserId: input.actorUserId,
        iterationNumber,
        requiredApprovalLevels: application.approvalLevelsRequired,
        comment,
        decision: repositoryDecision,
        nextStatus,
        eligibility
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_REVIEW_DECISION',
        entityType: 'application',
        entityId: application.id,
        outcome: 'success',
        details: {
          decision: input.decision,
          iterationNumber,
          nextStatus,
          eligibilityPassed: eligibility.eligible
        },
        ...withMeta(input.meta)
      });

      const [workflowState, reviewActions, latestEligibility] = await Promise.all([
        repository.getWorkflowState(application.id),
        repository.listReviewActions(application.id),
        repository.getLatestEligibilityValidation(application.id)
      ]);

      const refreshedApplication = await repository.getApplicationForWorkflow(application.id);

      return {
        application: refreshedApplication,
        workflowState,
        reviewActions,
        latestEligibility
      };
    },

    async approverSignOff(input: {
      applicationId: string;
      actorUserId: string;
      decision: ApproverDecision;
      comment: string;
      meta: { requestId?: string; ip?: string; userAgent?: string };
    }) {
      const comment = normalizeComment(
        input.comment,
        'APPROVAL_COMMENT_REQUIRED',
        'Approval sign-off requires a comment with at least 3 characters.'
      );

      const { application, workflowState } = await ensureApproverVisibleApplication(input.applicationId, input.actorUserId);

      const approvalLevel = workflowState.nextApprovalLevel;
      if (!approvalLevel) {
        throw new HttpError(409, 'APPROVAL_NOT_ALLOWED', 'No pending approval level is available for sign-off.');
      }

      const finalApproval = input.decision === 'approve' && approvalLevel >= workflowState.requiredApprovalLevels;
      const nextStatus = input.decision === 'reject' ? 'REJECTED' : finalApproval ? 'APPROVED' : null;

      await repository.applyApproverDecision({
        applicationId: application.id,
        actorUserId: input.actorUserId,
        iterationNumber: workflowState.iterationNumber,
        approvalLevel,
        requiredApprovalLevels: workflowState.requiredApprovalLevels,
        decision: input.decision === 'approve' ? 'APPROVE_LEVEL' : 'REJECT_LEVEL',
        comment,
        nextStatus
      });

      await audit.write({
        actorUserId: input.actorUserId,
        eventType: 'APPLICATION_APPROVAL_SIGNOFF',
        entityType: 'application',
        entityId: application.id,
        outcome: 'success',
        details: {
          decision: input.decision,
          approvalLevel,
          requiredApprovalLevels: workflowState.requiredApprovalLevels,
          finalApproval
        },
        ...withMeta(input.meta)
      });

      const updated = await repository.getApplicationForWorkflow(application.id);
      const updatedState = await repository.getWorkflowState(application.id);
      const [reviewActions, latestEligibility] = await Promise.all([
        repository.listReviewActions(application.id),
        repository.getLatestEligibilityValidation(application.id)
      ]);

      return {
        application: updated,
        workflowState: updatedState,
        reviewActions,
        latestEligibility
      };
    }
  };
};
