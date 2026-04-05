import { redirect, type RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';
import { getSessionCookieName } from '$lib/server/session';

export const POST: RequestHandler = async (event) => {
  await fetchApi(event, '/auth/logout', {
    method: 'POST'
  });

  event.cookies.delete(getSessionCookieName(), { path: '/' });
  throw redirect(303, '/login');
};
