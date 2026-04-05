import { describe, expect, it } from 'vitest';
import { actionAvailability, deadlineWindowLabel, statusTone } from '../src/lib/researcher-ui';

describe('researcher UI helpers', () => {
  it('labels deadline windows with explicit state text', () => {
    const onTime = deadlineWindowLabel({
      state: 'on_time',
      submissionAllowed: true,
      message: 'On time',
      deadlineAt: '2026-01-01T00:00:00.000Z',
      graceDeadlineAt: '2026-01-02T00:00:00.000Z',
      extensionUntil: null,
      extensionUsedAt: null
    });

    const blocked = deadlineWindowLabel({
      state: 'blocked_extension_consumed',
      submissionAllowed: false,
      message: 'Consumed',
      deadlineAt: '2026-01-01T00:00:00.000Z',
      graceDeadlineAt: '2026-01-02T00:00:00.000Z',
      extensionUntil: '2026-01-03T00:00:00.000Z',
      extensionUsedAt: '2026-01-02T12:00:00.000Z'
    });

    expect(onTime).toContain('On time window');
    expect(blocked).toContain('extension already consumed');
  });

  it('maps status tones for tracker rendering', () => {
    expect(statusTone('SUBMITTED_ON_TIME')).toBe('ok');
    expect(statusTone('UNDER_REVIEW')).toBe('warn');
    expect(statusTone('RETURNED_FOR_REVISION')).toBe('warn');
    expect(statusTone('BLOCKED_LATE')).toBe('bad');
    expect(statusTone('DRAFT')).toBe('neutral');
  });

  it('disables submit when window is blocked and enables under extension-open state', () => {
    const blocked = actionAvailability('DRAFT', {
      state: 'blocked_no_extension',
      submissionAllowed: false,
      message: 'blocked',
      deadlineAt: '2026-01-01T00:00:00.000Z',
      graceDeadlineAt: '2026-01-02T00:00:00.000Z',
      extensionUntil: null,
      extensionUsedAt: null
    });

    const extensionOpen = actionAvailability('DRAFT', {
      state: 'late_extension_open',
      submissionAllowed: true,
      message: 'extension',
      deadlineAt: '2026-01-01T00:00:00.000Z',
      graceDeadlineAt: '2026-01-02T00:00:00.000Z',
      extensionUntil: '2026-01-03T00:00:00.000Z',
      extensionUsedAt: null
    });

    expect(blocked.canSubmit).toBe(false);
    expect(extensionOpen.canSubmit).toBe(true);
  });
});
