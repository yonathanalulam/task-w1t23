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
  const appState = { ...baseApplication };

  const repository = {
    getApplicationById: vi.fn(async (_applicationId: string) => ({ ...appState })),
    countOtherApplicationsByPolicy: vi.fn(async () => 0),
    insertValidation: vi.fn(async () => undefined),
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
    sumYearlySubmittedAmounts: vi.fn(async () => 1000),
    updateApplicationStatus: vi.fn(async (_input) => {
      appState.status = _input.nextStatus;
      if (_input.markSubmittedAt) {
        appState.submittedAt = new Date();
      }
    }),
    markExtensionUsed: vi.fn(async () => undefined),
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
    countDocumentVersions: vi.fn(async () => 1),
    addLinkDocumentVersion: vi.fn(async () => ({
      document: {
        id: 'doc-2',
        applicationId: 'app-1',
        documentKey: 'supporting-link',
        label: 'Supplement Link',
        latestVersionId: 'v-2',
        latestVersionNumber: 1,
        latestStorageType: 'LINK',
        latestMimeType: null,
        latestFileName: null,
        latestExternalUrl: 'https://example.org/resource',
        latestIsPreviewable: false
      },
      version: {
        id: 'v-2',
        documentId: 'doc-2',
        versionNumber: 1,
        storageType: 'LINK',
        filePath: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        externalUrl: 'https://example.org/resource',
        isPreviewable: false,
        detectedMimeType: null,
        securityScanStatus: 'CLEAN',
        securityFindings: [],
        isAdminReviewRequired: false,
        createdAt: new Date()
      }
    })),
    addFileDocumentVersion: vi.fn(async () => ({
      document: {
        id: 'doc-file-1',
        applicationId: 'app-1',
        documentKey: 'budget',
        label: 'Budget Sheet',
        latestVersionId: 'v-file-1',
        latestVersionNumber: 2,
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
        id: 'v-file-1',
        documentId: 'doc-file-1',
        versionNumber: 2,
        storageType: 'FILE',
        filePath: '/tmp/budget.pdf',
        fileName: 'budget.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 150,
        externalUrl: null,
        isPreviewable: true,
        detectedMimeType: 'application/pdf',
        securityScanStatus: 'WARNING',
        securityFindings: ['credential_pattern_detected'],
        isAdminReviewRequired: false,
        createdAt: new Date()
      }
    }))
  };

  return { repository, appState };
};

describe('researcher service submission rules', () => {
  it('rejects duplicate applications in same policy period', async () => {
    const { repository } = makeRepository();
    repository.countOtherApplicationsByPolicy.mockResolvedValueOnce(1);

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
    repository.sumYearlySubmittedAmounts.mockResolvedValueOnce(4500);

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

    expect(repository.updateApplicationStatus).toHaveBeenCalledWith(
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

    expect(repository.markExtensionUsed).toHaveBeenCalledWith('app-1');
    expect(submitted?.status).toBe('SUBMITTED_LATE');
  });
});

describe('researcher service document version controls', () => {
  it('enforces max 20 versions for link document', async () => {
    const { repository } = makeRepository();
    repository.listDocuments.mockResolvedValueOnce([
      {
        id: 'doc-cap',
        applicationId: 'app-1',
        documentKey: 'supporting-link',
        label: 'Support Link',
        latestVersionId: 'v-cap',
        latestVersionNumber: 20,
        latestStorageType: 'LINK',
        latestMimeType: null,
        latestFileName: null,
        latestExternalUrl: 'https://example.org',
        latestIsPreviewable: false
      }
    ]);
    repository.countDocumentVersions.mockResolvedValueOnce(20);

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
