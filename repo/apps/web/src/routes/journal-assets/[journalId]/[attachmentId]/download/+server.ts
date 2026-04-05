import { fetchApi } from '$lib/server/api';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
  const { journalId, attachmentId } = event.params;
  const upstreamPath = `/journal-governance/journals/${journalId}/attachments/${attachmentId}/download${event.url.search}`;
  const upstream = await fetchApi(event, upstreamPath);

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json'
      }
    });
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
  if (contentType.includes('application/json')) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'content-type': contentType
      }
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': contentType,
      ...(upstream.headers.get('content-disposition') ? { 'content-disposition': upstream.headers.get('content-disposition') as string } : {}),
      ...(upstream.headers.get('x-rrga-watermark') ? { 'x-rrga-watermark': upstream.headers.get('x-rrga-watermark') as string } : {}),
      ...(upstream.headers.get('x-rrga-watermark-mode') ? { 'x-rrga-watermark-mode': upstream.headers.get('x-rrga-watermark-mode') as string } : {})
    }
  });
};
