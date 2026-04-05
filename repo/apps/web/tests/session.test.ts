import { afterEach, describe, expect, it } from 'vitest';
import { getSessionCookieName } from '../src/lib/server/session';

describe('session cookie config', () => {
  afterEach(() => {
    delete process.env.APP_SESSION_COOKIE_NAME;
  });

  it('uses the default cookie name when unset', () => {
    expect(getSessionCookieName()).toBe('rrga_session');
  });

  it('uses the configured cookie name when provided', () => {
    process.env.APP_SESSION_COOKIE_NAME = 'custom_session';
    expect(getSessionCookieName()).toBe('custom_session');
  });
});
