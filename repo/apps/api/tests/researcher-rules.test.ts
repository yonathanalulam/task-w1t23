import { describe, expect, it } from 'vitest';
import { evaluateDeadlineSurface, evaluateDeadlineWindow } from '../src/modules/researcher/rules.js';

describe('researcher deadline rules', () => {
  it('classifies on-time submissions', () => {
    const now = new Date('2026-03-01T09:00:00.000Z');
    const deadline = new Date('2026-03-01T10:00:00.000Z');

    const result = evaluateDeadlineWindow({
      submissionDeadlineAt: deadline,
      graceHours: 24,
      now
    });

    expect(result.mode).toBe('on_time');
    expect(result.statusOnSuccess).toBe('SUBMITTED_ON_TIME');
  });

  it('classifies late grace submissions', () => {
    const result = evaluateDeadlineWindow({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-01T18:00:00.000Z')
    });

    expect(result.mode).toBe('late_grace');
    expect(result.statusOnSuccess).toBe('SUBMITTED_LATE');
  });

  it('blocks submissions after grace when no extension applies', () => {
    const result = evaluateDeadlineWindow({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-03T10:00:00.000Z')
    });

    expect(result.mode).toBe('blocked');
  });

  it('allows one-time extension window when available and unused', () => {
    const result = evaluateDeadlineWindow({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-03T08:00:00.000Z'),
      extensionUntil: new Date('2026-03-04T08:00:00.000Z'),
      extensionUsedAt: null
    });

    expect(result.mode).toBe('extension_allowed');
  });

  it('surfaces blocked-no-extension distinctly from extension-open and consumed states', () => {
    const blockedNoExtension = evaluateDeadlineSurface({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-03T10:00:00.000Z')
    });

    const extensionOpen = evaluateDeadlineSurface({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-03T09:00:00.000Z'),
      extensionUntil: new Date('2026-03-04T10:00:00.000Z')
    });

    const extensionConsumed = evaluateDeadlineSurface({
      submissionDeadlineAt: new Date('2026-03-01T10:00:00.000Z'),
      graceHours: 24,
      now: new Date('2026-03-03T09:00:00.000Z'),
      extensionUntil: new Date('2026-03-04T10:00:00.000Z'),
      extensionUsedAt: new Date('2026-03-03T08:00:00.000Z')
    });

    expect(blockedNoExtension.state).toBe('blocked_no_extension');
    expect(blockedNoExtension.submissionAllowed).toBe(false);

    expect(extensionOpen.state).toBe('late_extension_open');
    expect(extensionOpen.submissionAllowed).toBe(true);

    expect(extensionConsumed.state).toBe('blocked_extension_consumed');
    expect(extensionConsumed.submissionAllowed).toBe(false);
  });
});
