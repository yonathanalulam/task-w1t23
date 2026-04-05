import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const payload = await event.request.json();

  const upstream = await fetchApi(event, '/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await upstream.text();
  const setCookie = upstream.headers.get('set-cookie');

  const response = new Response(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json'
    }
  });

  if (setCookie) {
    response.headers.set('set-cookie', setCookie);
  }

  return response;
};
