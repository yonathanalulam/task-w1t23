export interface DeadlineState {
  state:
    | 'on_time'
    | 'late_grace'
    | 'late_extension_open'
    | 'blocked_no_extension'
    | 'blocked_extension_consumed'
    | 'blocked_extension_expired';
  submissionAllowed: boolean;
  message: string;
  deadlineAt: string;
  graceDeadlineAt: string;
  extensionUntil: string | null;
  extensionUsedAt: string | null;
}

export const deadlineWindowLabel = (deadline: DeadlineState | null): string => {
  if (!deadline) {
    return 'Deadline unknown';
  }

  const deadlineText = new Date(deadline.deadlineAt).toLocaleString();
  const graceText = new Date(deadline.graceDeadlineAt).toLocaleString();

  if (deadline.state === 'on_time') {
    return `On time window (deadline: ${deadlineText})`;
  }

  if (deadline.state === 'late_grace') {
    return `Late grace window (deadline: ${deadlineText}, grace ends: ${graceText})`;
  }

  if (deadline.state === 'late_extension_open') {
    const extensionText = deadline.extensionUntil ? new Date(deadline.extensionUntil).toLocaleString() : 'unknown';
    return `Extension open (late submission allowed until ${extensionText})`;
  }

  if (deadline.state === 'blocked_extension_consumed') {
    const usedText = deadline.extensionUsedAt ? new Date(deadline.extensionUsedAt).toLocaleString() : 'unknown';
    return `Blocked: extension already consumed at ${usedText}`;
  }

  if (deadline.state === 'blocked_extension_expired') {
    const extensionText = deadline.extensionUntil ? new Date(deadline.extensionUntil).toLocaleString() : 'unknown';
    return `Blocked: extension expired at ${extensionText}`;
  }

  return `Blocked late (grace ended: ${graceText})`;
};

export const actionAvailability = (status: string, deadline: DeadlineState | null): { canSubmit: boolean; canResubmit: boolean; reason: string | null } => {
  const windowOpen = deadline?.submissionAllowed ?? false;
  const reason = windowOpen ? null : deadline?.message ?? 'Submission window is closed.';

  if (status === 'DRAFT' || status === 'BLOCKED_LATE') {
    return {
      canSubmit: windowOpen,
      canResubmit: false,
      reason
    };
  }

  if (status === 'RETURNED_FOR_REVISION') {
    return {
      canSubmit: false,
      canResubmit: windowOpen,
      reason
    };
  }

  return {
    canSubmit: false,
    canResubmit: false,
    reason: null
  };
};

export const statusTone = (status: string): 'ok' | 'warn' | 'bad' | 'neutral' => {
  switch (status) {
    case 'SUBMITTED_ON_TIME':
    case 'APPROVED':
      return 'ok';
    case 'SUBMITTED_LATE':
    case 'UNDER_REVIEW':
    case 'RETURNED_FOR_REVISION':
      return 'warn';
    case 'BLOCKED_LATE':
    case 'REJECTED':
      return 'bad';
    default:
      return 'neutral';
  }
};
