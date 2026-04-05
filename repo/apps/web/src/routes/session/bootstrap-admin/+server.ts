import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const payload = await event.request.json();

  const upstream = await fetchApi(event, '/auth/bootstrap-admin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json'
    }
  });
};
