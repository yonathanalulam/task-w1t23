import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const POST: RequestHandler = async (event) => {
  const payload = await event.request.json();
  const bootstrapSecret = typeof payload?.bootstrapSecret === 'string' ? payload.bootstrapSecret : undefined;

  const upstream = await fetchApi(event, '/auth/bootstrap-admin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(bootstrapSecret ? { 'x-bootstrap-secret': bootstrapSecret } : {})
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
