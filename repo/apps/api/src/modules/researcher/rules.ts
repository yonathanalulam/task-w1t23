import type { DeadlineEvaluation } from './types.js';

export const MAX_DOCUMENT_VERSIONS = 20;
export const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

const formatGraceHours = (graceHours: number) => `${graceHours}-hour`;

export const isPreviewableMime = (mimeType: string | null): boolean => {
  if (!mimeType) {
    return false;
  }

  return mimeType === 'application/pdf' || mimeType.startsWith('image/');
};

export const isBlockedExecutableName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return ['.exe', '.dll', '.msi', '.bat', '.cmd', '.com', '.ps1', '.sh', '.scr'].some((suffix) => lower.endsWith(suffix));
};

export type DeadlineSurfaceState =
  | 'on_time'
  | 'late_grace'
  | 'late_extension_open'
  | 'blocked_no_extension'
  | 'blocked_extension_consumed'
  | 'blocked_extension_expired';

export interface DeadlineSurface {
  state: DeadlineSurfaceState;
  submissionAllowed: boolean;
  message: string;
  deadlineAt: Date;
  graceDeadlineAt: Date;
  extensionUntil: Date | null;
  extensionUsedAt: Date | null;
}

export const evaluateDeadlineSurface = (input: {
  submissionDeadlineAt: Date;
  graceHours: number;
  now: Date;
  extensionUntil?: Date | null;
  extensionUsedAt?: Date | null;
}): DeadlineSurface => {
  const extensionUntil = input.extensionUntil ?? null;
  const extensionUsedAt = input.extensionUsedAt ?? null;
  const graceDeadlineAt = new Date(input.submissionDeadlineAt.getTime() + input.graceHours * 60 * 60 * 1000);

  if (input.now <= input.submissionDeadlineAt) {
    return {
      state: 'on_time',
      submissionAllowed: true,
      message: 'Submission is currently on time.',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      extensionUntil,
      extensionUsedAt
    };
  }

  if (input.now <= graceDeadlineAt) {
    return {
      state: 'late_grace',
      submissionAllowed: true,
      message: `Submission is currently in the ${formatGraceHours(input.graceHours)} late grace window.`,
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      extensionUntil,
      extensionUsedAt
    };
  }

  if (extensionUntil && !extensionUsedAt && input.now <= extensionUntil) {
    return {
      state: 'late_extension_open',
      submissionAllowed: true,
      message: 'Submission is open under a one-time administrator extension.',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      extensionUntil,
      extensionUsedAt
    };
  }

  if (extensionUntil && extensionUsedAt) {
    return {
      state: 'blocked_extension_consumed',
      submissionAllowed: false,
      message: 'Submission is blocked. The one-time extension has already been consumed.',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      extensionUntil,
      extensionUsedAt
    };
  }

  if (extensionUntil && input.now > extensionUntil) {
    return {
      state: 'blocked_extension_expired',
      submissionAllowed: false,
      message: 'Submission is blocked. The one-time extension window has expired.',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      extensionUntil,
      extensionUsedAt
    };
  }

  return {
    state: 'blocked_no_extension',
    submissionAllowed: false,
    message: `Submission is blocked after the ${formatGraceHours(input.graceHours)} grace window and no extension is active.`,
    deadlineAt: input.submissionDeadlineAt,
    graceDeadlineAt,
    extensionUntil,
    extensionUsedAt
  };
};

export const evaluateDeadlineWindow = (input: {
  submissionDeadlineAt: Date;
  graceHours: number;
  now: Date;
  extensionUntil?: Date | null;
  extensionUsedAt?: Date | null;
}): DeadlineEvaluation => {
  const graceDeadlineAt = new Date(input.submissionDeadlineAt.getTime() + input.graceHours * 60 * 60 * 1000);

  if (input.now <= input.submissionDeadlineAt) {
    return {
      mode: 'on_time',
      statusOnSuccess: 'SUBMITTED_ON_TIME',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      evaluatedAt: input.now,
      message: 'Submission is on time.'
    };
  }

  if (input.now <= graceDeadlineAt) {
    return {
      mode: 'late_grace',
      statusOnSuccess: 'SUBMITTED_LATE',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      evaluatedAt: input.now,
      message: `Submission is in the ${formatGraceHours(input.graceHours)} late grace window.`
    };
  }

  if (input.extensionUntil && !input.extensionUsedAt && input.now <= input.extensionUntil) {
    return {
      mode: 'extension_allowed',
      statusOnSuccess: 'SUBMITTED_LATE',
      deadlineAt: input.submissionDeadlineAt,
      graceDeadlineAt,
      evaluatedAt: input.now,
      message: 'Submission is accepted under one-time administrator extension.'
    };
  }

  return {
    mode: 'blocked',
    statusOnSuccess: 'SUBMITTED_LATE',
    deadlineAt: input.submissionDeadlineAt,
    graceDeadlineAt,
    evaluatedAt: input.now,
    message: `Submission is blocked because the ${formatGraceHours(input.graceHours)} grace period has passed.`
  };
};
