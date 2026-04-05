import { describe, expect, it, vi } from 'vitest';
import { createWorkflowService } from '../src/modules/workflow/service.js';

const makeRepository = (input?: { requiredApprovalLevels?: number; missingRequiredDocs?: boolean }) => {
  const state = {
    application: {
      id: 'app-1',
      policyId: 'policy-1',
      policyTitle: 'Policy A',
      applicantUserId: 'researcher-1',
      applicantUsername: 'researcher',
      title: 'Cancer Biomarker Study',
      summary: 'Summary',
      requestedAmount: '1200.00',
      status: 'SUBMITTED_ON_TIME',
      submittedAt: new Date('2026-03-01T10:00:00.000Z'),
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      annualCapAmount: '5000.00',
      approvalLevelsRequired: input?.requiredApprovalLevels ?? 2
    },
    workflowState: null as null | {
      applicationId: string;
      iterationNumber: number;
      requiredApprovalLevels: number;
      nextApprovalLevel: number | null;
      lastReviewerDecision: 'NONE' | 'FORWARDED' | 'RETURNED' | 'REJECTED';
      lastReviewedAt: Date | null;
      updatedAt: Date;
    },
    reviewActions: [] as any[],
    validations: [] as any[],
    documents: [
      {
        id: 'doc-1',
        applicationId: 'app-1',
        documentKey: 'budget',
        label: 'Budget worksheet',
        latestVersionId: 'ver-1',
        latestVersionNumber: 1,
        latestStorageType: 'FILE',
        latestMimeType: 'application/pdf',
        latestFileName: 'budget.pdf',
        latestExternalUrl: null,
        latestIsPreviewable: true,
        latestSecurityScanStatus: 'CLEAN',
        latestSecurityFindings: [],
        latestAdminReviewRequired: false
      }
    ] as any[],
    versions: [
      {
        id: 'ver-1',
        documentId: 'doc-1',
        versionNumber: 1,
        storageType: 'FILE',
        filePath: '/tmp/budget.pdf',
        fileName: 'budget.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1200,
        externalUrl: null,
        isPreviewable: true,
        detectedMimeType: 'application/pdf',
        securityScanStatus: 'CLEAN',
        securityFindings: [],
        isAdminReviewRequired: false,
        createdAt: new Date('2026-03-01T10:00:00.000Z')
      }
    ] as any[],
    reviewerAssignments: new Map<string, string>([['app-1', 'reviewer-1']]),
    approverAssignments: new Map<string, string>([
      ['app-1:1', 'approver-1'],
      ['app-1:2', 'approver-2']
    ])
  };

  const isAssignedReviewer = (applicationId: string, actorUserId: string) => state.reviewerAssignments.get(applicationId) === actorUserId;
  const isAssignedApprover = (applicationId: string, actorUserId: string) => {
    const level = state.workflowState?.nextApprovalLevel;
    if (!level) {
      return false;
    }

    return state.approverAssignments.get(`${applicationId}:${level}`) === actorUserId;
  };

  const repository = {
    listReviewerQueue: vi.fn(async (actorUserId: string) =>
      state.application.status.startsWith('SUBMITTED') && isAssignedReviewer(state.application.id, actorUserId) ? [{ ...state.application }] : []
    ),
    listApproverQueue: vi.fn(async (actorUserId: string) =>
      state.application.status === 'UNDER_REVIEW' && state.workflowState?.nextApprovalLevel && isAssignedApprover(state.application.id, actorUserId)
        ? [
            {
              ...state.application,
              nextApprovalLevel: state.workflowState.nextApprovalLevel,
              iterationNumber: state.workflowState.iterationNumber
            }
          ]
        : []
    ),
    getApplicationForWorkflow: vi.fn(async () => ({ ...state.application })),
    getReviewerApplicationForActor: vi.fn(async (applicationId: string, actorUserId: string) =>
      applicationId === state.application.id && isAssignedReviewer(applicationId, actorUserId) ? { ...state.application } : null
    ),
    getApproverApplicationForActor: vi.fn(async (applicationId: string, actorUserId: string) =>
      applicationId === state.application.id && isAssignedApprover(applicationId, actorUserId) ? { ...state.application } : null
    ),
    getWorkflowState: vi.fn(async () => (state.workflowState ? { ...state.workflowState } : null)),
    listReviewActions: vi.fn(async () => state.reviewActions.map((entry) => ({ ...entry }))),
    getLatestEligibilityValidation: vi.fn(async () => {
      const latest = state.validations.at(-1);
      return latest
        ? {
            eligible: latest.passed,
            checks: latest.details.checks,
            evaluatedAt: latest.details.evaluatedAt
          }
        : null;
    }),
    listRequiredTemplateKeys: vi.fn(async () => ['budget']),
    listSubmittedDocumentKeys: vi.fn(async () => (input?.missingRequiredDocs ? [] : ['budget'])),
    listApplicationDocuments: vi.fn(async (applicationId: string) =>
      state.documents.filter((entry) => entry.applicationId === applicationId).map((entry) => ({ ...entry }))
    ),
    findReviewerApplicationDocumentById: vi.fn(async (applicationId: string, documentId: string, actorUserId: string) => {
      if (!isAssignedReviewer(applicationId, actorUserId)) {
        return null;
      }

      const row = state.documents.find((entry) => entry.id === documentId && entry.applicationId === applicationId);
      return row ? { ...row } : null;
    }),
    findApproverApplicationDocumentById: vi.fn(async (applicationId: string, documentId: string, actorUserId: string) => {
      if (!isAssignedApprover(applicationId, actorUserId)) {
        return null;
      }

      const row = state.documents.find((entry) => entry.id === documentId && entry.applicationId === applicationId);
      return row ? { ...row } : null;
    }),
    findApplicationDocumentVersionById: vi.fn(async (versionId: string) => {
      const row = state.versions.find((entry) => entry.id === versionId);
      return row ? { ...row } : null;
    }),
    insertValidation: vi.fn(async (entry) => {
      state.validations.push(entry);
    }),
    getNextWorkflowIteration: vi.fn(async () => state.reviewActions.filter((entry) => entry.actorRole === 'reviewer').length + 1),
    applyReviewerDecision: vi.fn(async (entry) => {
      state.workflowState = {
        applicationId: entry.applicationId,
        iterationNumber: entry.iterationNumber,
        requiredApprovalLevels: entry.requiredApprovalLevels,
        nextApprovalLevel: entry.decision === 'REVIEW_FORWARD' ? 1 : null,
        lastReviewerDecision: entry.decision === 'REVIEW_FORWARD' ? 'FORWARDED' : entry.decision === 'REVIEW_RETURN' ? 'RETURNED' : 'REJECTED',
        lastReviewedAt: new Date(),
        updatedAt: new Date()
      };
      state.reviewActions.push({
        id: state.reviewActions.length + 1,
        applicationId: entry.applicationId,
        iterationNumber: entry.iterationNumber,
        actorUserId: entry.actorUserId,
        actorUsername: 'reviewer-user',
        actorRole: 'reviewer',
        decision: entry.decision,
        approvalLevel: 0,
        comment: entry.comment,
        details: { eligibility: entry.eligibility },
        createdAt: new Date()
      });
      state.application.status = entry.nextStatus;
    }),
    applyApproverDecision: vi.fn(async (entry) => {
      state.reviewActions.push({
        id: state.reviewActions.length + 1,
        applicationId: entry.applicationId,
        iterationNumber: entry.iterationNumber,
        actorUserId: entry.actorUserId,
        actorUsername: 'approver-user',
        actorRole: 'approver',
        decision: entry.decision,
        approvalLevel: entry.approvalLevel,
        comment: entry.comment,
        details: {},
        createdAt: new Date()
      });

      if (!state.workflowState) {
        return;
      }

      if (entry.decision === 'REJECT_LEVEL') {
        state.workflowState.nextApprovalLevel = null;
        state.application.status = 'REJECTED';
        return;
      }

      if (entry.nextStatus === 'APPROVED') {
        state.workflowState.nextApprovalLevel = null;
        state.application.status = 'APPROVED';
        return;
      }

      state.workflowState.nextApprovalLevel = (state.workflowState.nextApprovalLevel ?? 0) + 1;
    })
  };

  return { repository, state };
};

describe('workflow service', () => {
  it('enforces required comments for reviewer and approver actions', async () => {
    const { repository } = makeRepository();
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.reviewerDecision({
        applicationId: 'app-1',
        actorUserId: 'reviewer-1',
        decision: 'forward_to_approval',
        comment: ' ',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'REVIEW_COMMENT_REQUIRED');

    await expect(
      service.approverSignOff({
        applicationId: 'app-1',
        actorUserId: 'approver-1',
        decision: 'approve',
        comment: ' ',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'APPROVAL_COMMENT_REQUIRED');
  });

  it('filters reviewer and approver queues by actor assignment', async () => {
    const { repository } = makeRepository({ requiredApprovalLevels: 1 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    expect(await service.reviewerQueue('reviewer-1')).toHaveLength(1);
    expect(await service.reviewerQueue('reviewer-2')).toHaveLength(0);

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Forward to approval',
      meta: {}
    });

    expect(await service.approverQueue('approver-1')).toHaveLength(1);
    expect(await service.approverQueue('approver-2')).toHaveLength(0);
  });

  it('blocks unassigned reviewers from detail, document, and decision access', async () => {
    const { repository } = makeRepository();
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(service.reviewerDetail('app-1', 'reviewer-2')).rejects.toHaveProperty('code', 'FORBIDDEN');
    await expect(service.reviewerDocumentAccess('app-1', 'doc-1', 'reviewer-2')).rejects.toHaveProperty('code', 'FORBIDDEN');
    await expect(
      service.reviewerDecision({
        applicationId: 'app-1',
        actorUserId: 'reviewer-2',
        decision: 'forward_to_approval',
        comment: 'Trying to review someone else assignment',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'FORBIDDEN');
  });

  it('blocks unassigned approvers from detail, document, and sign-off access', async () => {
    const { repository } = makeRepository({ requiredApprovalLevels: 2 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Eligible and ready for approval',
      meta: {}
    });

    await expect(service.approverDetail('app-1', 'approver-2')).rejects.toHaveProperty('code', 'FORBIDDEN');
    await expect(service.approverDocumentAccess('app-1', 'doc-1', 'approver-2')).rejects.toHaveProperty('code', 'FORBIDDEN');
    await expect(
      service.approverSignOff({
        applicationId: 'app-1',
        actorUserId: 'approver-2',
        decision: 'approve',
        comment: 'Trying to sign off another approver level',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'FORBIDDEN');
  });

  it('blocks forwarding when eligibility checks fail and records reasons', async () => {
    const { repository, state } = makeRepository({ missingRequiredDocs: true });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.reviewerDecision({
        applicationId: 'app-1',
        actorUserId: 'reviewer-1',
        decision: 'forward_to_approval',
        comment: 'Need to move forward',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'ELIGIBILITY_FAILED');

    expect(state.validations).toHaveLength(1);
    expect(state.validations[0].validationType).toBe('review_eligibility');
    expect(state.validations[0].passed).toBe(false);
    expect(state.validations[0].details.checks.some((check: any) => check.key === 'required_documents_present' && !check.passed)).toBe(true);
  });

  it('progresses approval levels and finalizes approved status', async () => {
    const { repository, state } = makeRepository({ requiredApprovalLevels: 2 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Eligible and ready for approval',
      meta: {}
    });

    expect(state.application.status).toBe('UNDER_REVIEW');
    expect(state.workflowState?.nextApprovalLevel).toBe(1);

    await service.approverSignOff({
      applicationId: 'app-1',
      actorUserId: 'approver-1',
      decision: 'approve',
      comment: 'Level one approved',
      meta: {}
    });

    expect(state.application.status).toBe('UNDER_REVIEW');
    expect(state.workflowState?.nextApprovalLevel).toBe(2);

    await service.approverSignOff({
      applicationId: 'app-1',
      actorUserId: 'approver-2',
      decision: 'approve',
      comment: 'Final approval',
      meta: {}
    });

    expect(state.application.status).toBe('APPROVED');
    expect(state.workflowState?.nextApprovalLevel).toBeNull();
  });

  it('supports return-for-revision and subsequent re-review progression', async () => {
    const { repository, state } = makeRepository({ requiredApprovalLevels: 1 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'return_for_revision',
      comment: 'Please correct budget narrative',
      meta: {}
    });

    expect(state.application.status).toBe('RETURNED_FOR_REVISION');
    expect(state.workflowState?.iterationNumber).toBe(1);

    state.application.status = 'SUBMITTED_LATE';

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Revisions addressed; forwarding',
      meta: {}
    });

    expect(state.application.status).toBe('UNDER_REVIEW');
    expect(state.workflowState?.iterationNumber).toBe(2);
  });

  it('keeps an append-only action trail across reviewer and approver steps', async () => {
    const { repository, state } = makeRepository({ requiredApprovalLevels: 1 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Forwarding',
      meta: {}
    });

    const firstActionSnapshot = {
      id: state.reviewActions[0].id,
      decision: state.reviewActions[0].decision,
      comment: state.reviewActions[0].comment,
      approvalLevel: state.reviewActions[0].approvalLevel,
      actorRole: state.reviewActions[0].actorRole
    };

    await service.approverSignOff({
      applicationId: 'app-1',
      actorUserId: 'approver-1',
      decision: 'reject',
      comment: 'Rejecting on risk concerns',
      meta: {}
    });

    expect(state.reviewActions).toHaveLength(2);
    expect({
      id: state.reviewActions[0].id,
      decision: state.reviewActions[0].decision,
      comment: state.reviewActions[0].comment,
      approvalLevel: state.reviewActions[0].approvalLevel,
      actorRole: state.reviewActions[0].actorRole
    }).toEqual(firstActionSnapshot);
    expect(state.reviewActions[1]?.decision).toBe('REJECT_LEVEL');
  });

  it('includes submitted materials in reviewer/approver detail payloads', async () => {
    const { repository } = makeRepository({ requiredApprovalLevels: 1 });
    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    const reviewer = await service.reviewerDetail('app-1', 'reviewer-1');
    expect(reviewer.documents).toHaveLength(1);
    expect(reviewer.documents[0]?.documentKey).toBe('budget');

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Forwarding for approval',
      meta: {}
    });

    const approver = await service.approverDetail('app-1', 'approver-1');
    expect(approver.documents).toHaveLength(1);
    expect(approver.documents[0]?.label).toBe('Budget worksheet');
  });

  it('blocks workflow document access when latest version is held for admin review', async () => {
    const { repository, state } = makeRepository({ requiredApprovalLevels: 1 });
    state.versions[0].securityScanStatus = 'HELD';
    state.versions[0].isAdminReviewRequired = true;

    const service = createWorkflowService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(service.reviewerDocumentAccess('app-1', 'doc-1', 'reviewer-1')).rejects.toHaveProperty('code', 'DOCUMENT_HELD_FOR_ADMIN_REVIEW');

    await service.reviewerDecision({
      applicationId: 'app-1',
      actorUserId: 'reviewer-1',
      decision: 'forward_to_approval',
      comment: 'Forwarding for approval',
      meta: {}
    });

    await expect(service.approverDocumentAccess('app-1', 'doc-1', 'approver-1')).rejects.toHaveProperty('code', 'DOCUMENT_HELD_FOR_ADMIN_REVIEW');
  });
});
