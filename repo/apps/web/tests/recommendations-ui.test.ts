import { describe, expect, it } from 'vitest';
import { feedbackButtonDisabled, feedbackTone, parsePreferenceText, recommendationTypeLabel } from '../src/lib/recommendations-ui';

describe('recommendations UI helpers', () => {
  it('maps recommendation target labels', () => {
    expect(recommendationTypeLabel('JOURNAL')).toBe('Journal');
    expect(recommendationTypeLabel('FUNDING_PROGRAM')).toBe('Funding program');
    expect(recommendationTypeLabel('RESOURCE')).toBe('Resource');
  });

  it('normalizes preference text blocks into token arrays', () => {
    expect(parsePreferenceText('biology\nchemistry, physics')).toEqual(['biology', 'chemistry', 'physics']);
  });

  it('handles feedback button state and tone for controls', () => {
    expect(feedbackButtonDisabled('LIKE', 'LIKE')).toBe(true);
    expect(feedbackButtonDisabled('NOT_INTERESTED', 'LIKE')).toBe(false);
    expect(feedbackTone('LIKE')).toBe('liked');
    expect(feedbackTone('NOT_INTERESTED')).toBe('muted');
    expect(feedbackTone('BLOCK')).toBe('blocked');
    expect(feedbackTone(null)).toBe('none');
  });
});
