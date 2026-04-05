import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string }; message?: string };
  return payload.error?.message ?? payload.message ?? `Request failed (${response.status})`;
};

const localDateTimeToIso = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

const parseBusinessHours = (raw: string): Array<{ dayOfWeek: number; opensAt: string; closesAt: string }> => {
  const entries = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return entries.map((line) => {
    const [day, opensAt, closesAt] = line.split(/\s+/);
    return {
      dayOfWeek: Number(day),
      opensAt: String(opensAt ?? ''),
      closesAt: String(closesAt ?? '')
    };
  });
};

export const load: PageServerLoad = async (event) => {
  const resourceId = event.params.resourceId;
  const response = await fetchApi(event, `/resource-booking/manager/resources/${resourceId}`);

  if (!response.ok) {
    return {
      notFound: true,
      resource: null,
      businessHours: [],
      blackouts: []
    };
  }

  const payload = (await response.json()) as {
    resource: unknown;
    businessHours: unknown[];
    blackouts: unknown[];
  };

  return {
    notFound: false,
    resource: payload.resource,
    businessHours: payload.businessHours,
    blackouts: payload.blackouts
  };
};

export const actions: Actions = {
  updateResource: async (event) => {
    const resourceId = event.params.resourceId;
    const formData = await event.request.formData();

    const payload = {
      name: String(formData.get('name') ?? '').trim(),
      description: String(formData.get('description') ?? '').trim(),
      location: String(formData.get('location') ?? '').trim(),
      capacity: Number(formData.get('capacity') ?? '1'),
      timezone: String(formData.get('timezone') ?? 'UTC').trim(),
      isActive: String(formData.get('isActive') ?? '') === 'on'
    };

    const response = await fetchApi(event, `/resource-booking/manager/resources/${resourceId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'updateResource',
        message: await normalizeError(response)
      });
    }

    return { action: 'updateResource', ok: true };
  },

  setBusinessHours: async (event) => {
    const resourceId = event.params.resourceId;
    const formData = await event.request.formData();
    const payload = {
      hours: parseBusinessHours(String(formData.get('hours') ?? ''))
    };

    const response = await fetchApi(event, `/resource-booking/manager/resources/${resourceId}/business-hours`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'setBusinessHours',
        message: await normalizeError(response)
      });
    }

    return { action: 'setBusinessHours', ok: true };
  },

  addBlackout: async (event) => {
    const resourceId = event.params.resourceId;
    const formData = await event.request.formData();

    const payload = {
      startsAt: localDateTimeToIso(String(formData.get('startsAt') ?? '')),
      endsAt: localDateTimeToIso(String(formData.get('endsAt') ?? '')),
      reason: String(formData.get('reason') ?? '').trim()
    };

    const response = await fetchApi(event, `/resource-booking/manager/resources/${resourceId}/blackouts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'addBlackout',
        message: await normalizeError(response)
      });
    }

    return { action: 'addBlackout', ok: true };
  }
};
