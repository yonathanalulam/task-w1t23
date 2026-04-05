import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<{ message: string; code?: string }> => {
  const raw = await response.text().catch(() => '');
  let payload: {
    error?: { message?: string; code?: string };
    message?: string;
    code?: string;
  } = {};

  if (raw) {
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      payload = {};
    }
  }

  const code = payload.error?.code ?? payload.code;
  const message = payload.error?.message ?? payload.message;

  return {
    message: message ?? `Request failed (${response.status})`,
    ...(code ? { code } : {})
  };
};

const asLocalInputValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const defaultWindow = () => {
  const now = new Date();
  const start = new Date(now);
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  return {
    startsAtLocal: asLocalInputValue(start),
    endsAtLocal: asLocalInputValue(end)
  };
};

const localDateTimeToIso = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const load: PageServerLoad = async (event) => {
  const defaults = defaultWindow();
  const startsAtLocal = event.url.searchParams.get('startsAt') ?? defaults.startsAtLocal;
  const endsAtLocal = event.url.searchParams.get('endsAt') ?? defaults.endsAtLocal;

  const startsAtIso = localDateTimeToIso(startsAtLocal);
  const endsAtIso = localDateTimeToIso(endsAtLocal);

  const [availabilityResponse, bookingsResponse] = await Promise.all([
    fetchApi(event, `/resource-booking/researcher/availability?startsAt=${encodeURIComponent(startsAtIso)}&endsAt=${encodeURIComponent(endsAtIso)}`),
    fetchApi(event, '/resource-booking/researcher/bookings')
  ]);

  const resources = availabilityResponse.ok ? ((await availabilityResponse.json()) as { resources?: unknown[] }).resources ?? [] : [];
  const bookings = bookingsResponse.ok ? ((await bookingsResponse.json()) as { bookings?: unknown[] }).bookings ?? [] : [];

  return {
    startsAtLocal,
    endsAtLocal,
    resources,
    bookings
  };
};

export const actions: Actions = {
  queryAvailability: async (event) => {
    const formData = await event.request.formData();
    const startsAtLocal = String(formData.get('startsAt') ?? '').trim();
    const endsAtLocal = String(formData.get('endsAt') ?? '').trim();

    const startsAt = localDateTimeToIso(startsAtLocal);
    const endsAt = localDateTimeToIso(endsAtLocal);

    const response = await fetchApi(event, `/resource-booking/researcher/availability?startsAt=${encodeURIComponent(startsAt)}&endsAt=${encodeURIComponent(endsAt)}`);

    if (!response.ok) {
      const normalized = await normalizeError(response);
      return fail(response.status, {
        action: 'queryAvailability',
        message: normalized.message,
        startsAtLocal,
        endsAtLocal
      });
    }

    throw redirect(303, `/researcher/resources?startsAt=${encodeURIComponent(startsAtLocal)}&endsAt=${encodeURIComponent(endsAtLocal)}`);
  },

  createBooking: async (event) => {
    const formData = await event.request.formData();
    const startsAtLocal = String(formData.get('startsAt') ?? '').trim();
    const endsAtLocal = String(formData.get('endsAt') ?? '').trim();

    const payload = {
      resourceId: String(formData.get('resourceId') ?? '').trim(),
      startsAt: localDateTimeToIso(startsAtLocal),
      endsAt: localDateTimeToIso(endsAtLocal),
      seatsRequested: Number(formData.get('seatsRequested') ?? '1')
    };

    const response = await fetchApi(event, '/resource-booking/researcher/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const normalized = await normalizeError(response);
      return fail(response.status, {
        action: 'createBooking',
        message: normalized.message,
        errorCode: normalized.code,
        resourceId: payload.resourceId,
        startsAtLocal,
        endsAtLocal
      });
    }

    return {
      action: 'createBooking',
      ok: true,
      resourceId: payload.resourceId,
      startsAtLocal,
      endsAtLocal
    };
  }
};
