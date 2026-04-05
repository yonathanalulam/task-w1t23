import { describe, expect, it } from 'vitest';
import { roleSurfaces } from '../src/lib/role-surfaces';

describe('role surface scaffold', () => {
  it('contains the six required role surface entries', () => {
    expect(roleSurfaces).toHaveLength(6);
    expect(roleSurfaces.map((surface) => surface.role)).toEqual([
      'researcher',
      'reviewer',
      'approver',
      'resource_manager',
      'finance_clerk',
      'administrator'
    ]);
  });
});
