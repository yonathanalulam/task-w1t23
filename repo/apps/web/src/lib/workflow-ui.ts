export const reviewerDecisionAllowed = (status: string): boolean => {
  return status === 'SUBMITTED_ON_TIME' || status === 'SUBMITTED_LATE';
};

export const approverSignOffAllowed = (status: string, nextApprovalLevel: number | null): boolean => {
  return status === 'UNDER_REVIEW' && typeof nextApprovalLevel === 'number' && nextApprovalLevel >= 1;
};

export const approvalProgressLabel = (nextApprovalLevel: number | null, requiredLevels: number): string => {
  if (!nextApprovalLevel) {
    return `No pending approval level (required levels: ${requiredLevels})`;
  }

  return `Approval level ${nextApprovalLevel} of ${requiredLevels}`;
};
