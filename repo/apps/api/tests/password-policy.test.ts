import { describe, expect, it } from 'vitest';
import { validatePasswordPolicy } from '../src/modules/auth/password-policy.js';

describe('password policy', () => {
  it('accepts valid passwords', () => {
    const result = validatePasswordPolicy('StrongPass1!');
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects weak passwords with actionable errors', () => {
    const result = validatePasswordPolicy('weak');
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});
