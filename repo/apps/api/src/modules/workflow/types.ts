import type { ApplicationStatus } from '../researcher/types.js';

export interface WorkflowApplicationRecord {
  id: string;
  policyId: string;
  policyTitle: string;
  applicantUserId: string;
  applicantUsername: string;
  title: string;
  summary: string | null;
  requestedAmount: string;
  status: ApplicationStatus;
  submittedAt: Date | null;
  periodStart: string;
  periodEnd: string;
  annualCapAmount: string;
  approvalLevelsRequired: number;
}

export interface WorkflowStateRecord {
  applicationId: string;
  iterationNumber: number;
  requiredApprovalLevels: number;
  nextApprovalLevel: number | null;
  lastReviewerDecision: 'NONE' | 'FORWARDED' | 'RETURNED' | 'REJECTED';
  lastReviewedAt: Date | null;
  updatedAt: Date;
}

export interface ReviewActionRecord {
  id: number;
  applicationId: string;
  iterationNumber: number;
  actorUserId: string;
  actorUsername: string | null;
  actorRole: 'reviewer' | 'approver';
  decision: 'REVIEW_FORWARD' | 'REVIEW_RETURN' | 'REVIEW_REJECT' | 'APPROVE_LEVEL' | 'REJECT_LEVEL';
  approvalLevel: number;
  comment: string;
  details: Record<string, unknown>;
  createdAt: Date;
}

export interface EligibilityCheck {
  key: string;
  passed: boolean;
  reason: string;
}

export interface EligibilityEvaluation {
  eligible: boolean;
  checks: EligibilityCheck[];
  evaluatedAt: string;
}

export interface WorkflowDocumentRecord {
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

export interface WorkflowDocumentVersionRecord {
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

export type ReviewerDecision = 'forward_to_approval' | 'return_for_revision' | 'reject';
export type ApproverDecision = 'approve' | 'reject';
