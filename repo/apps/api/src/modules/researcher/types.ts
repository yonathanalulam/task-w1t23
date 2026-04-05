export const applicationStatuses = [
  'DRAFT',
  'SUBMITTED_ON_TIME',
  'SUBMITTED_LATE',
  'UNDER_REVIEW',
  'BLOCKED_LATE',
  'RETURNED_FOR_REVISION',
  'APPROVED',
  'REJECTED'
] as const;

export type ApplicationStatus = (typeof applicationStatuses)[number];

export interface DeadlineEvaluation {
  mode: 'on_time' | 'late_grace' | 'blocked' | 'extension_allowed';
  statusOnSuccess: 'SUBMITTED_ON_TIME' | 'SUBMITTED_LATE';
  deadlineAt: Date;
  graceDeadlineAt: Date;
  evaluatedAt: Date;
  message: string;
}
