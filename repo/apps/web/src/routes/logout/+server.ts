import { redirect, type RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  await fetchApi(event, '/auth/logout', {
    method: 'POST'
  });

  event.cookies.delete('rrga_session', { path: '/' });
  throw redirect(303, '/login');
};
