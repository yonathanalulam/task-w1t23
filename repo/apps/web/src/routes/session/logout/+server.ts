import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const upstream = await fetchApi(event, '/auth/logout', {
    method: 'POST'
  });

  const response = new Response(null, {
    status: upstream.status
  });

  const setCookie = upstream.headers.get('set-cookie');
  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
};
