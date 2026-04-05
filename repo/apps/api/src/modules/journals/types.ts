export const customFieldTypes = ['TEXT', 'NUMBER', 'DATE', 'URL', 'BOOLEAN', 'SELECT'] as const;
export type CustomFieldType = (typeof customFieldTypes)[number];

export const attachmentCategories = ['CONTRACT', 'QUOTE', 'SAMPLE_ISSUE', 'OTHER'] as const;
export type AttachmentCategory = (typeof attachmentCategories)[number];

export interface CustomFieldDefinitionRecord {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  isRequired: boolean;
  options: string[];
  helpText: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalRecord {
  id: string;
  title: string;
  issn: string | null;
  publisher: string | null;
  isDeleted: boolean;
  customFieldValues: Record<string, unknown>;
  currentVersionNumber: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalVersionRecord {
  id: number;
  journalId: string;
  versionNumber: number;
  changeType: 'CREATED' | 'UPDATED' | 'DELETED';
  snapshot: Record<string, unknown>;
  changedByUserId: string;
  changeComment: string | null;
  createdAt: Date;
}

export interface JournalAttachmentRecord {
  id: string;
  journalId: string;
  attachmentKey: string;
  label: string;
  category: AttachmentCategory;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  currentStorageType: 'FILE' | 'LINK' | null;
  currentFileName: string | null;
  currentMimeType: string | null;
  currentExternalUrl: string | null;
  currentSecurityScanStatus: 'CLEAN' | 'WARNING' | 'HELD' | null;
  currentSecurityFindings: string[];
  currentAdminReviewRequired: boolean;
  currentNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalAttachmentVersionRecord {
  id: string;
  attachmentId: string;
  versionNumber: number;
  storageType: 'FILE' | 'LINK';
  filePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  externalUrl: string | null;
  detectedMimeType: string | null;
  securityScanStatus: 'CLEAN' | 'WARNING' | 'HELD';
  securityFindings: string[];
  isAdminReviewRequired: boolean;
  notes: string | null;
  createdAt: Date;
}
