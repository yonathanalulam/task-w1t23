import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

export const load: PageServerLoad = async (event) => {
  const applicationId = event.params.applicationId;
  const response = await fetchApi(event, `/workflow/approver/applications/${applicationId}`);

  if (!response.ok) {
    return {
      notFound: true,
      application: null,
      workflowState: null,
      reviewActions: [],
      latestEligibility: null,
      documents: []
    };
  }

  return {
    notFound: false,
    ...((await response.json()) as Record<string, unknown>)
  };
};

export const actions: Actions = {
  signOff: async (event) => {
    const applicationId = event.params.applicationId;
    const formData = await event.request.formData();

    const response = await fetchApi(event, `/workflow/approver/applications/${applicationId}/sign-off`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: String(formData.get('decision') ?? ''),
        comment: String(formData.get('comment') ?? '')
      })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'signOff',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'signOff',
      ok: true
    };
  }
};
