import type { RequestHandler } from '@sveltejs/kit';
import { fetchApi } from '$lib/server/api';

export const GET: RequestHandler = async (event) => {
  const { applicationId, documentId } = event.params;
  const upstreamPath = `/researcher/applications/${applicationId}/documents/${documentId}/download${event.url.search}`;
  const upstream = await fetchApi(event, upstreamPath);

  const contentType = upstream.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = await upstream.text();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        'content-type': contentType || 'application/json'
      }
    });
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': contentType || 'application/octet-stream'
    }
  });

  const disposition = upstream.headers.get('content-disposition');
  if (disposition) {
    response.headers.set('content-disposition', disposition);
  }

  const watermark = upstream.headers.get('x-rrga-watermark');
  if (watermark) {
    response.headers.set('x-rrga-watermark', watermark);
  }

  const watermarkMode = upstream.headers.get('x-rrga-watermark-mode');
  if (watermarkMode) {
    response.headers.set('x-rrga-watermark-mode', watermarkMode);
  }

  return response;
};
