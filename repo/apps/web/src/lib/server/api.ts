import type { RequestEvent } from '@sveltejs/kit';

const apiBaseUrl =
  process.env.API_INTERNAL_BASE_URL ?? process.env.PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

const makeAbsolute = (path: string): string => {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
};

export const fetchApi = async (
  event: RequestEvent,
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers ?? {});
  const cookieHeader = event.request.headers.get('cookie');

  if (cookieHeader && !headers.has('cookie')) {
    headers.set('cookie', cookieHeader);
  }

  return event.fetch(makeAbsolute(path), {
    ...init,
    headers
  });
};
