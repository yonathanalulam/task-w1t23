import { describe, expect, it } from 'vitest';
import { approvalProgressLabel, approverSignOffAllowed, reviewerDecisionAllowed } from '../src/lib/workflow-ui';

describe('workflow UI state helpers', () => {
  it('allows reviewer decision only for submitted statuses', () => {
    expect(reviewerDecisionAllowed('SUBMITTED_ON_TIME')).toBe(true);
    expect(reviewerDecisionAllowed('SUBMITTED_LATE')).toBe(true);
    expect(reviewerDecisionAllowed('UNDER_REVIEW')).toBe(false);
    expect(reviewerDecisionAllowed('RETURNED_FOR_REVISION')).toBe(false);
  });

  it('allows approver sign-off only when under review and a level is pending', () => {
    expect(approverSignOffAllowed('UNDER_REVIEW', 1)).toBe(true);
    expect(approverSignOffAllowed('UNDER_REVIEW', null)).toBe(false);
    expect(approverSignOffAllowed('APPROVED', 1)).toBe(false);
  });

  it('formats approval progress labels for queue/detail pages', () => {
    expect(approvalProgressLabel(2, 3)).toContain('2 of 3');
    expect(approvalProgressLabel(null, 2)).toContain('No pending approval level');
  });
});
