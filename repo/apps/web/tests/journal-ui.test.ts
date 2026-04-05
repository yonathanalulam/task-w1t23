import { describe, expect, it } from 'vitest';
import { fieldTypeRequiresOptions, journalStateLabel, journalStateTone } from '../src/lib/journal-ui';

describe('journal UI helpers', () => {
  it('flags SELECT custom fields as option-required', () => {
    expect(fieldTypeRequiresOptions('SELECT')).toBe(true);
    expect(fieldTypeRequiresOptions('TEXT')).toBe(false);
  });

  it('maps deleted state to explicit label and tone', () => {
    expect(journalStateLabel(false)).toBe('ACTIVE');
    expect(journalStateTone(false)).toBe('active');
    expect(journalStateLabel(true)).toBe('DELETED');
    expect(journalStateTone(true)).toBe('deleted');
  });
});
