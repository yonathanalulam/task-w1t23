import { describe, expect, it } from 'vitest';
import { roleHomePath } from '../src/lib/auth';

describe('role home routing', () => {
  it('maps known roles to their workspace route', () => {
    expect(roleHomePath(['finance_clerk'])).toBe('/finance');
    expect(roleHomePath(['administrator'])).toBe('/admin');
  });

  it('falls back to root for unknown role sets', () => {
    expect(roleHomePath([])).toBe('/');
  });
});
