import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const asJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

export const load: PageServerLoad = async (event) => {
  const applicationId = event.params.applicationId;

  const detailResponse = await fetchApi(event, `/researcher/applications/${applicationId}`);
  if (!detailResponse.ok) {
    return {
      notFound: true,
      application: null,
      policy: null,
      documents: [],
      versionsByDocument: {}
    };
  }

  const detailPayload = await asJson<{
    application: any;
    policy: any;
    documents: Array<{ id: string }>;
    deadline: any;
  }>(detailResponse);

  const versionsEntries = await Promise.all(
    detailPayload.documents.map(async (document) => {
      const versionsResponse = await fetchApi(event, `/researcher/applications/${applicationId}/documents/${document.id}/versions`);
      if (!versionsResponse.ok) {
        return [document.id, []] as const;
      }

      const payload = await asJson<{ versions: unknown[] }>(versionsResponse);
      return [document.id, payload.versions] as const;
    })
  );

  return {
    notFound: false,
    application: detailPayload.application,
    policy: detailPayload.policy,
    documents: detailPayload.documents,
    deadline: detailPayload.deadline,
    versionsByDocument: Object.fromEntries(versionsEntries)
  };
};

export const actions: Actions = {
  uploadFile: async (event) => {
    const applicationId = event.params.applicationId;
    const formData = await event.request.formData();

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/documents/file`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      return fail(response.status, { action: 'uploadFile', message: await normalizeError(response) });
    }

    return { action: 'uploadFile', ok: true };
  },

  addLink: async (event) => {
    const applicationId = event.params.applicationId;
    const formData = await event.request.formData();

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/documents/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentKey: String(formData.get('documentKey') ?? ''),
        label: String(formData.get('label') ?? ''),
        externalUrl: String(formData.get('externalUrl') ?? '')
      })
    });

    if (!response.ok) {
      return fail(response.status, { action: 'addLink', message: await normalizeError(response) });
    }

    return { action: 'addLink', ok: true };
  },

  rollback: async (event) => {
    const applicationId = event.params.applicationId;
    const formData = await event.request.formData();
    const documentId = String(formData.get('documentId') ?? '');
    const versionId = String(formData.get('versionId') ?? '');

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/documents/${documentId}/rollback/${versionId}`, {
      method: 'POST'
    });

    if (!response.ok) {
      return fail(response.status, { action: 'rollback', message: await normalizeError(response), documentId });
    }

    return { action: 'rollback', ok: true, documentId };
  },

  submit: async (event) => {
    const applicationId = event.params.applicationId;
    const response = await fetchApi(event, `/researcher/applications/${applicationId}/submit`, {
      method: 'POST'
    });

    if (!response.ok) {
      return fail(response.status, { action: 'submit', message: await normalizeError(response) });
    }

    return { action: 'submit', ok: true };
  },

  resubmit: async (event) => {
    const applicationId = event.params.applicationId;
    const response = await fetchApi(event, `/researcher/applications/${applicationId}/resubmit`, {
      method: 'POST'
    });

    if (!response.ok) {
      return fail(response.status, { action: 'resubmit', message: await normalizeError(response) });
    }

    return { action: 'resubmit', ok: true };
  }
};
