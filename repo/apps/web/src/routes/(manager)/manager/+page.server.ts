import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
  return payload.error?.message ?? payload.message ?? `Request failed (${response.status})`;
};

export const load: PageServerLoad = async (event) => {
  const response = await fetchApi(event, '/resource-booking/manager/resources?includeInactive=true');
  const resources = response.ok ? ((await response.json()) as { resources?: unknown[] }).resources ?? [] : [];

  return {
    resources
  };
};

export const actions: Actions = {
  createResource: async (event) => {
    const formData = await event.request.formData();

    const payload = {
      resourceType: String(formData.get('resourceType') ?? '').trim(),
      name: String(formData.get('name') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
      location: String(formData.get('location') ?? '').trim(),
      capacity: Number(formData.get('capacity') ?? '1'),
      timezone: String(formData.get('timezone') ?? 'UTC').trim(),
      isActive: String(formData.get('isActive') ?? '') === 'on'
    };

    const response = await fetchApi(event, '/resource-booking/manager/resources', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createResource',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'createResource',
      ok: true
    };
  }
};
