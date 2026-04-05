import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const GET: RequestHandler = async (event) => {
  const { applicationId, documentId } = event.params;
  const upstream = await fetchApi(
    event,
    `/workflow/approver/applications/${applicationId}/documents/${documentId}/preview${event.url.search}`
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream'
    }
  });
};
