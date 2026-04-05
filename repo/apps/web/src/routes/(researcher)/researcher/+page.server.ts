import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const asJson = async <T>(response: Response): Promise<T> => {
  return (await response.json()) as T;
};

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

export const load: PageServerLoad = async (event) => {
  const [policiesResponse, applicationsResponse] = await Promise.all([
    fetchApi(event, '/policies'),
    fetchApi(event, '/researcher/applications')
  ]);

  const policiesPayload = policiesResponse.ok ? await asJson<{ policies: unknown[] }>(policiesResponse) : { policies: [] };
  const applicationsPayload = applicationsResponse.ok ? await asJson<{ applications: unknown[] }>(applicationsResponse) : { applications: [] };

  return {
    policies: policiesPayload.policies,
    applications: applicationsPayload.applications
  };
};

export const actions: Actions = {
  createDraft: async (event) => {
    const formData = await event.request.formData();
    const payload = {
      policyId: String(formData.get('policyId') ?? ''),
      title: String(formData.get('title') ?? ''),
      summary: String(formData.get('summary') ?? ''),
      requestedAmount: String(formData.get('requestedAmount') ?? '')
    };

    const response = await fetchApi(event, '/researcher/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createDraft',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'createDraft',
      ok: true
    };
  },

  submit: async (event) => {
    const formData = await event.request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/submit`, {
      method: 'POST'
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'submit',
        message: await normalizeError(response),
        applicationId
      });
    }

    return {
      action: 'submit',
      ok: true,
      applicationId
    };
  },

  resubmit: async (event) => {
    const formData = await event.request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/resubmit`, {
      method: 'POST'
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'resubmit',
        message: await normalizeError(response),
        applicationId
      });
    }

    return {
      action: 'resubmit',
      ok: true,
      applicationId
    };
  }
};
