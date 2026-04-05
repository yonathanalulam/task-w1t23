import { describe, expect, it, vi } from 'vitest';
import { createResearcherService } from '../src/modules/researcher/service.js';

const baseApplication = {
  id: 'app-1',
  policyId: 'policy-1',
  applicantUserId: 'user-1',
  title: 'Seed Grant',
  summary: null,
  requestedAmount: '1200.00',
  status: 'DRAFT',
  submittedAt: null,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  updatedAt: new Date('2026-01-10T00:00:00.000Z'),
  periodStart: '2026-01-01',
  periodEnd: '2026-12-31',
  submissionDeadlineAt: new Date('2030-01-01T00:00:00.000Z'),
  graceHours: 24,
  annualCapAmount: '5000.00',
  extensionUntil: null,
  extensionUsedAt: null
};

const makeRepository = () => {
  const appState: any = { ...baseApplication };
  const versionCounts = new Map<string, number>([['app-1:budget', 1], ['app-1:supporting-link', 0], ['app-1:concurrent-link', 19]]);
  let linkVersionSeq = 2;
  let fileVersionSeq = 2;
  let transactionChain = Promise.resolve();

  const repository = {
    withTransaction: vi.fn(async (action: (client: object) => Promise<unknown>) => {
      const run = async () => action({});
      const next = transactionChain.then(run, run);
      transactionChain = next.then(() => undefined, () => undefined);
      return next;
    }),
    lockApplicantForSubmission: vi.fn(async () => undefined),
    getApplicationById: vi.fn(async (_applicationId: string) => ({ ...appState })),
    getApplicationByIdForUpdate: vi.fn(async (_client: object, _applicationId: string) => ({ ...appState })),
    countOtherApplicationsInOverlappingPeriod: vi.fn(async () => 0),
    countOtherApplicationsInOverlappingPeriodInTransaction: vi.fn(async (_client: object) => 0),
    insertValidation: vi.fn(async () => undefined),
    insertValidationInTransaction: vi.fn(async () => undefined),
    getPolicyById: vi.fn(async () => ({
      id: 'policy-1',
      title: 'Policy A',
      description: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: new Date('2030-01-01T00:00:00.000Z'),
      graceHours: 24,
      annualCapAmount: '5000.00',
      isActive: true,
      templates: [{ id: 'tpl-1', templateKey: 'budget', label: 'Budget Sheet', instructions: null, isRequired: true }]
    })),
    getPolicyByIdInTransaction: vi.fn(async () => ({
      id: 'policy-1',
      title: 'Policy A',
      description: null,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: new Date('2030-01-01T00:00:00.000Z'),
      graceHours: 24,
      annualCapAmount: '5000.00',
      isActive: true,
      templates: [{ id: 'tpl-1', templateKey: 'budget', label: 'Budget Sheet', instructions: null, isRequired: true }]
    })),
    listDocuments: vi.fn(async () => [
      {
        id: 'doc-1',
        applicationId: 'app-1',
        documentKey: 'budget',
        label: 'Budget Sheet',
        latestVersionId: 'v-1',
        latestVersionNumber: 1,
        latestStorageType: 'FILE',
        latestMimeType: 'application/pdf',
        latestFileName: 'budget.pdf',
        latestExternalUrl: null,
        latestIsPreviewable: true
      }
    ]),
    listDocumentsInTransaction: vi.fn(async () => [
      {
        id: 'doc-1',
        applicationId: 'app-1',
        documentKey: 'budget',
        label: 'Budget Sheet',
        latestVersionId: 'v-1',
        latestVersionNumber: 1,
        latestStorageType: 'FILE',
        latestMimeType: 'application/pdf',
        latestFileName: 'budget.pdf',
        latestExternalUrl: null,
        latestIsPreviewable: true
      }
    ]),
    sumYearlySubmittedAmounts: vi.fn(async () => 1000),
    sumYearlySubmittedAmountsInTransaction: vi.fn(async (_client: object) => 1000),
    updateApplicationStatus: vi.fn(async (_input) => {
      appState.status = _input.nextStatus;
      if (_input.markSubmittedAt) {
        appState.submittedAt = new Date();
      }
    }),
    updateApplicationStatusInTransaction: vi.fn(async (_client: object, _input: any) => {
      appState.status = _input.nextStatus;
      if (_input.markSubmittedAt) {
        appState.submittedAt = new Date();
      }
    }),
    markExtensionUsed: vi.fn(async () => undefined),
    markExtensionUsedInTransaction: vi.fn(async () => undefined),
    findDocumentById: vi.fn(async () => ({
      id: 'doc-1',
      applicationId: 'app-1',
      documentKey: 'budget',
      label: 'Budget Sheet',
      latestVersionId: 'v-1',
      latestVersionNumber: 1,
      latestStorageType: 'FILE',
      latestMimeType: 'application/pdf',
      latestFileName: 'budget.pdf',
      latestExternalUrl: null,
      latestIsPreviewable: true
    })),
    findDocumentVersionById: vi.fn(async () => ({
      id: 'v-1',
      documentId: 'doc-1',
      versionNumber: 1,
      storageType: 'FILE',
      filePath: '/tmp/demo.pdf',
      fileName: 'demo.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 10,
      externalUrl: null,
      isPreviewable: true,
      createdAt: new Date()
    })),
    rollbackDocumentVersion: vi.fn(async () => undefined),
    createExtension: vi.fn(async () => undefined),
    countDocumentVersions: vi.fn(async (documentId: string) => (documentId === 'doc-cap' ? 20 : 1)),
    addLinkDocumentVersion: vi.fn(async (input: any) => {
      const key = `${input.applicationId}:${input.documentKey}`;
      const current = versionCounts.get(key) ?? 0;
      if (current >= 20) {
        const error = new Error('limit reached');
        (error as Error & { code?: string }).code = 'DOCUMENT_VERSION_LIMIT_REACHED';
        throw error;
      }

      const nextVersion = current + 1;
      versionCounts.set(key, nextVersion);
      return {
        document: {
          id: 'doc-2',
          applicationId: input.applicationId,
          documentKey: input.documentKey,
          label: input.label,
          latestVersionId: `v-link-${linkVersionSeq}`,
          latestVersionNumber: nextVersion,
          latestStorageType: 'LINK',
          latestMimeType: null,
          latestFileName: null,
          latestExternalUrl: input.externalUrl,
          latestIsPreviewable: false
        },
        version: {
          id: `v-link-${linkVersionSeq++}`,
          documentId: 'doc-2',
          versionNumber: nextVersion,
          storageType: 'LINK',
          filePath: null,
          fileName: null,
          mimeType: null,
          sizeBytes: null,
          externalUrl: input.externalUrl,
          isPreviewable: false,
          detectedMimeType: null,
          securityScanStatus: 'CLEAN',
          securityFindings: [],
          isAdminReviewRequired: false,
          createdAt: new Date()
        }
      };
    }),
    addFileDocumentVersion: vi.fn(async (input: any) => {
      const key = `${input.applicationId}:${input.documentKey}`;
      const current = versionCounts.get(key) ?? 0;
      if (current >= 20) {
        const error = new Error('limit reached');
        (error as Error & { code?: string }).code = 'DOCUMENT_VERSION_LIMIT_REACHED';
        throw error;
      }

      const nextVersion = current + 1;
      versionCounts.set(key, nextVersion);
      return {
        document: {
          id: 'doc-file-1',
          applicationId: input.applicationId,
          documentKey: input.documentKey,
          label: input.label,
          latestVersionId: `v-file-${fileVersionSeq}`,
          latestVersionNumber: nextVersion,
          latestStorageType: 'FILE',
          latestMimeType: 'application/pdf',
          latestFileName: 'budget.pdf',
          latestExternalUrl: null,
          latestIsPreviewable: true,
          latestSecurityScanStatus: 'WARNING',
          latestSecurityFindings: ['credential_pattern_detected'],
          latestAdminReviewRequired: false
        },
        version: {
          id: `v-file-${fileVersionSeq++}`,
          documentId: 'doc-file-1',
          versionNumber: nextVersion,
          storageType: 'FILE',
          filePath: '/tmp/budget.pdf',
          fileName: 'budget.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 150,
          externalUrl: null,
          isPreviewable: true,
          detectedMimeType: 'application/pdf',
          securityScanStatus: 'WARNING',
          securityScanFindings: ['credential_pattern_detected'],
          isAdminReviewRequired: false,
          createdAt: new Date()
        }
      };
    })
  };

  return { repository, appState };
};

describe('researcher service submission rules', () => {
  it('rejects duplicate applications in same policy period', async () => {
    const { repository } = makeRepository();
    repository.countOtherApplicationsInOverlappingPeriodInTransaction.mockResolvedValueOnce(1);

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.submitApplication({ applicationId: 'app-1', actorUserId: 'user-1', mode: 'submit', meta: {} })
    ).rejects.toHaveProperty('code', 'DUPLICATE_APPLICATION');
  });

  it('rejects when annual cap is exceeded', async () => {
    const { repository } = makeRepository();
    repository.sumYearlySubmittedAmountsInTransaction.mockResolvedValueOnce(4500);

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.submitApplication({ applicationId: 'app-1', actorUserId: 'user-1', mode: 'submit', meta: {} })
    ).rejects.toHaveProperty('code', 'FUNDING_CAP_EXCEEDED');
  });

  it('marks blocked-late status when past grace and no extension', async () => {
    const { repository, appState } = makeRepository();
    appState.submissionDeadlineAt = new Date('2026-01-01T00:00:00.000Z');
    appState.graceHours = 24;

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.submitApplication({ applicationId: 'app-1', actorUserId: 'user-1', mode: 'submit', meta: {} })
    ).rejects.toHaveProperty('code', 'SUBMISSION_BLOCKED_LATE');

    expect(repository.updateApplicationStatusInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ nextStatus: 'BLOCKED_LATE' })
    );
  });

  it('uses one-time extension when after grace', async () => {
    const { repository, appState } = makeRepository();
    appState.submissionDeadlineAt = new Date('2026-01-01T00:00:00.000Z');
    appState.graceHours = 24;
    appState.extensionUntil = new Date('2099-01-01T00:00:00.000Z');

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    const submitted = await service.submitApplication({
      applicationId: 'app-1',
      actorUserId: 'user-1',
      mode: 'submit',
      meta: {}
    });

    expect(repository.markExtensionUsedInTransaction).toHaveBeenCalledWith(expect.anything(), 'app-1');
    expect(submitted?.status).toBe('SUBMITTED_LATE');
  });
});

describe('researcher service document version controls', () => {
  it('enforces max 20 versions for link document', async () => {
    const { repository } = makeRepository();
    repository.addLinkDocumentVersion.mockRejectedValueOnce(Object.assign(new Error('limit reached'), { code: 'DOCUMENT_VERSION_LIMIT_REACHED' }));

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.addLinkVersion({
        applicationId: 'app-1',
        actorUserId: 'user-1',
        documentKey: 'supporting-link',
        label: 'Support Link',
        externalUrl: 'https://example.org',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'DOCUMENT_VERSION_LIMIT_REACHED');
  });

  it('keeps the 20-version cap under concurrent uploads', async () => {
    const { repository } = makeRepository();
    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 2 }, (_, index) =>
        service.addLinkVersion({
          applicationId: 'app-1',
          actorUserId: 'user-1',
          documentKey: 'concurrent-link',
          label: `Concurrent Link ${index + 1}`,
          externalUrl: `https://example.org/${index + 1}`,
          meta: {}
        })
      )
    );

    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    const rejection = attempts.find((entry) => entry.status === 'rejected');
    expect((rejection as PromiseRejectedResult | undefined)?.reason?.code).toBe('DOCUMENT_VERSION_LIMIT_REACHED');
  });

  it('returns bad request for malformed external URLs', async () => {
    const { repository } = makeRepository();
    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.addLinkVersion({
        applicationId: 'app-1',
        actorUserId: 'user-1',
        documentKey: 'supporting-link',
        label: 'Support Link',
        externalUrl: 'not a url',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'INVALID_EXTERNAL_URL');
  });

  it('allows rollback for editable application state', async () => {
    const { repository } = makeRepository();
    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await service.rollbackVersion({
      applicationId: 'app-1',
      actorUserId: 'user-1',
      documentId: 'doc-1',
      targetVersionId: 'v-1',
      meta: {}
    });

    expect(repository.rollbackDocumentVersion).toHaveBeenCalled();
  });

  it('marks file upload with warning security status when sensitive patterns are detected', async () => {
    const { repository } = makeRepository();
    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    const result = await service.addFileVersion({
      applicationId: 'app-1',
      actorUserId: 'user-1',
      documentKey: 'budget',
      label: 'Budget Sheet',
      file: {
        filename: 'budget.txt',
        mimetype: 'text/plain',
        file: { bytesRead: 0 },
        toBuffer: async () => Buffer.from('api_key=secretvalue12345')
      } as never,
      meta: {}
    });

    expect(repository.addFileDocumentVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        securityScanStatus: 'WARNING',
        securityScanFindings: expect.arrayContaining(['credential_pattern_detected'])
      })
    );
    expect(result.version.securityScanStatus).toBe('WARNING');
  });
});

describe('researcher service extension rules', () => {
  it('prevents granting a second extension', async () => {
    const { repository, appState } = makeRepository();
    appState.extensionUntil = new Date('2026-01-03T00:00:00.000Z');

    const service = createResearcherService({
      repository: repository as never,
      audit: { write: vi.fn(async () => undefined) }
    });

    await expect(
      service.grantExtension({
        applicationId: 'app-1',
        actorUserId: 'admin-1',
        reason: 'Manual review delay',
        extendedUntil: '2026-01-05T00:00:00.000Z',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'EXTENSION_ALREADY_GRANTED');
  });
});
