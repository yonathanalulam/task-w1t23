import { describe, expect, it, vi } from 'vitest';
import { requireAuthenticated, requireRoles } from '../src/modules/access-control/guards.js';

const makeApp = () => {
  return {
    audit: {
      write: vi.fn(async () => undefined)
    }
  } as unknown as Parameters<typeof requireAuthenticated>[0];
};

describe('access control guards', () => {
  it('returns 401 when authentication is missing', async () => {
    const app = makeApp();
    const guard = requireAuthenticated(app);

    await expect(
      guard(
        {
          auth: null,
          id: 'req-1',
          ip: '127.0.0.1',
          method: 'GET',
          url: '/api/v1/admin/ping',
          headers: {},
          routeOptions: { url: '/api/v1/admin/ping' }
        } as never,
        {} as never
      )
    ).rejects.toHaveProperty('statusCode', 401);
  });

  it('returns 403 when role requirement is not met', async () => {
    const app = makeApp();
    const guard = requireRoles(app, ['administrator']);

    await expect(
      guard(
        {
          auth: {
            userId: 'user-1',
            username: 'owner',
            roles: ['researcher'],
            sessionId: 'session-1'
          },
          id: 'req-2',
          ip: '127.0.0.1',
          method: 'GET',
          url: '/api/v1/admin/ping',
          headers: {},
          routeOptions: { url: '/api/v1/admin/ping' }
        } as never,
        {} as never
      )
    ).rejects.toHaveProperty('statusCode', 403);
  });
});
