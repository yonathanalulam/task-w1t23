import { describe, expect, it, vi } from 'vitest';
import { createJournalGovernanceService } from '../src/modules/journals/service.js';

const makeRepository = () => {
  const fieldDefs = [
    {
      id: 'f-1',
      fieldKey: 'discipline',
      label: 'Discipline',
      fieldType: 'TEXT',
      isRequired: true,
      options: [],
      helpText: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'f-2',
      fieldKey: 'tier',
      label: 'Tier',
      fieldType: 'SELECT',
      isRequired: false,
      options: ['A', 'B'],
      helpText: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const journals = new Map<string, any>();
  const history = new Map<string, any[]>();

  const repository = {
    listCustomFieldDefinitions: vi.fn(async () => fieldDefs),
    createCustomFieldDefinition: vi.fn(async (input) => ({
      id: 'f-new',
      fieldKey: input.fieldKey,
      label: input.label,
      fieldType: input.fieldType,
      isRequired: input.isRequired,
      options: input.options,
      helpText: input.helpText ?? null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    updateCustomFieldDefinition: vi.fn(async (input) => ({
      id: input.fieldId,
      fieldKey: 'discipline',
      label: input.label,
      fieldType: input.fieldType,
      isRequired: input.isRequired,
      options: input.options,
      helpText: input.helpText ?? null,
      isActive: input.isActive,
      createdAt: new Date(),
      updatedAt: new Date()
    })),
    listJournals: vi.fn(async () => [...journals.values()]),
    getJournalById: vi.fn(async (journalId: string) => journals.get(journalId) ?? null),
    createJournal: vi.fn(async (input) => {
      const created = {
        id: 'j-1',
        title: input.title,
        issn: input.issn ?? null,
        publisher: input.publisher ?? null,
        isDeleted: false,
        customFieldValues: input.customFieldValues,
        currentVersionNumber: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      journals.set(created.id, created);
      history.set(created.id, [{ changeType: 'CREATED', versionNumber: 1 }]);
      return created;
    }),
    updateJournal: vi.fn(async (input) => {
      const existing = journals.get(input.journalId);
      if (!existing) return null;
      existing.title = input.title;
      existing.customFieldValues = input.customFieldValues;
      existing.currentVersionNumber += 1;
      const list = history.get(input.journalId) ?? [];
      list.push({ changeType: 'UPDATED', versionNumber: existing.currentVersionNumber });
      history.set(input.journalId, list);
      return existing;
    }),
    softDeleteJournal: vi.fn(async (input) => {
      const existing = journals.get(input.journalId);
      if (!existing) return null;
      existing.isDeleted = true;
      existing.currentVersionNumber += 1;
      const list = history.get(input.journalId) ?? [];
      list.push({ changeType: 'DELETED', versionNumber: existing.currentVersionNumber });
      history.set(input.journalId, list);
      return existing;
    }),
    listJournalVersions: vi.fn(async (journalId: string) => [...(history.get(journalId) ?? [])]),
    listAttachments: vi.fn(async () => []),
    addLinkAttachmentVersion: vi.fn(async () => ({
      attachment: {
        id: 'a-1',
        journalId: 'j-1',
        attachmentKey: 'contract_2026',
        label: 'Contract',
        category: 'CONTRACT',
        currentVersionId: 'av-1',
        currentVersionNumber: 1,
        currentStorageType: 'LINK',
        currentFileName: null,
        currentMimeType: null,
        currentExternalUrl: 'https://example.org/contract',
        currentNotes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      version: {
        id: 'av-1',
        attachmentId: 'a-1',
        versionNumber: 1,
        storageType: 'LINK',
        filePath: null,
        fileName: null,
        mimeType: null,
        sizeBytes: null,
        externalUrl: 'https://example.org/contract',
        notes: null,
        createdAt: new Date()
      }
    })),
    addFileAttachmentVersion: vi.fn(async () => ({
      attachment: {
        id: 'a-file-1',
        journalId: 'j-1',
        attachmentKey: 'sample_issue',
        label: 'Sample',
        category: 'SAMPLE_ISSUE',
        currentVersionId: 'av-file-1',
        currentVersionNumber: 1,
        currentStorageType: 'FILE',
        currentFileName: 'issue.pdf',
        currentMimeType: 'application/pdf',
        currentExternalUrl: null,
        currentNotes: null,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      version: {
        id: 'av-file-1',
        attachmentId: 'a-file-1',
        versionNumber: 1,
        storageType: 'FILE',
        filePath: '/tmp/issue.pdf',
        fileName: 'issue.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        externalUrl: null,
        detectedMimeType: 'application/pdf',
        securityScanStatus: 'CLEAN',
        securityFindings: [],
        isAdminReviewRequired: false,
        notes: null,
        createdAt: new Date()
      }
    }))
  };

  return { repository, journals, history };
};

describe('journal governance service', () => {
  it('validates required custom fields and rejects unknown keys', async () => {
    const { repository } = makeRepository();
    const service = createJournalGovernanceService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createJournal({
        actorUserId: 'admin-1',
        title: 'Journal A',
        customFieldValues: { tier: 'A' },
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'CUSTOM_FIELD_REQUIRED');

    await expect(
      service.createJournal({
        actorUserId: 'admin-1',
        title: 'Journal A',
        customFieldValues: { discipline: 'Biology', unknown_key: 'value' },
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'UNKNOWN_CUSTOM_FIELD');
  });

  it('enforces select option validation and accepts valid journal payload', async () => {
    const { repository } = makeRepository();
    const service = createJournalGovernanceService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.createJournal({
        actorUserId: 'admin-1',
        title: 'Journal A',
        customFieldValues: { discipline: 'Biology', tier: 'Z' },
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'CUSTOM_FIELD_INVALID');

    const created = await service.createJournal({
      actorUserId: 'admin-1',
      title: 'Journal A',
      customFieldValues: { discipline: 'Biology', tier: 'A' },
      meta: {}
    });

    expect(created.currentVersionNumber).toBe(1);
    expect(repository.createJournal).toHaveBeenCalled();
  });

  it('creates journal version progression via create, update, and delete operations', async () => {
    const { repository } = makeRepository();
    const service = createJournalGovernanceService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.createJournal({
      actorUserId: 'admin-1',
      title: 'Journal B',
      customFieldValues: { discipline: 'Physics' },
      meta: {}
    });

    await service.updateJournal({
      actorUserId: 'admin-1',
      journalId: 'j-1',
      title: 'Journal B Updated',
      customFieldValues: { discipline: 'Physics', tier: 'B' },
      meta: {}
    });

    await service.deleteJournal({
      actorUserId: 'admin-1',
      journalId: 'j-1',
      meta: {}
    });

    const detail = await service.getJournalDetail('j-1');
    expect(detail.history).toHaveLength(3);
    expect(detail.history.map((entry: any) => entry.changeType)).toEqual(['CREATED', 'UPDATED', 'DELETED']);
  });

  it('enforces attachment validation boundaries for links and executable file uploads', async () => {
    const { repository } = makeRepository();
    await repository.createJournal({
      title: 'Journal C',
      customFieldValues: { discipline: 'Chemistry' },
      actorUserId: 'admin-1'
    });

    const service = createJournalGovernanceService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await expect(
      service.addLinkAttachment({
        actorUserId: 'admin-1',
        journalId: 'j-1',
        attachmentKey: 'contract_1',
        label: 'Contract',
        category: 'CONTRACT',
        externalUrl: 'ftp://example.org/contract',
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'INVALID_ATTACHMENT_URL');

    await expect(
      service.addFileAttachment({
        actorUserId: 'admin-1',
        journalId: 'j-1',
        attachmentKey: 'sample_issue',
        label: 'Sample Issue',
        category: 'SAMPLE_ISSUE',
        file: {
          filename: 'payload.exe',
          mimetype: 'application/octet-stream',
          file: { bytesRead: 10 },
          toBuffer: async () => Buffer.from('x')
        } as never,
        meta: {}
      })
    ).rejects.toHaveProperty('code', 'UNSAFE_UPLOAD_BLOCKED');
  });

  it('marks attachment uploads for admin review when sensitive material patterns are detected', async () => {
    const { repository } = makeRepository();
    await repository.createJournal({
      title: 'Journal D',
      customFieldValues: { discipline: 'Mathematics' },
      actorUserId: 'admin-1'
    });

    const service = createJournalGovernanceService({ repository: repository as never, audit: { write: vi.fn(async () => undefined) } });

    await service.addFileAttachment({
      actorUserId: 'admin-1',
      journalId: 'j-1',
      attachmentKey: 'contract_sensitive',
      label: 'Contract',
      category: 'CONTRACT',
      file: {
        filename: 'contract.txt',
        mimetype: 'text/plain',
        file: { bytesRead: 0 },
        toBuffer: async () => Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----')
      } as never,
      meta: {}
    });

    expect(repository.addFileAttachmentVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        securityScanStatus: 'HELD',
        isAdminReviewRequired: true,
        securityScanFindings: expect.arrayContaining(['private_key_material_detected'])
      })
    );
  });
});
