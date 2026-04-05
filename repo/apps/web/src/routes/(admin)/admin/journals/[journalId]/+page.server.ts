import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

const fetchActiveCustomFields = async (event: Parameters<Actions['updateJournal']>[0]): Promise<Array<{ fieldKey: string; fieldType: string }>> => {
  const response = await fetchApi(event, '/journal-governance/custom-fields');
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { fields?: Array<{ fieldKey: string; fieldType: string }> };
  return payload.fields ?? [];
};

const buildCustomFieldValues = async (
  event: Parameters<Actions['updateJournal']>[0],
  formData: FormData
): Promise<Record<string, unknown>> => {
  const fields = await fetchActiveCustomFields(event);
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const formKey = `cf_${field.fieldKey}`;

    if (field.fieldType === 'BOOLEAN') {
      const raw = formData.get(formKey);
      if (raw !== null) {
        values[field.fieldKey] = raw === 'true' || raw === 'on';
      }
      continue;
    }

    const raw = String(formData.get(formKey) ?? '').trim();
    if (raw) {
      values[field.fieldKey] = raw;
    }
  }

  return values;
};

export const load: PageServerLoad = async (event) => {
  const journalId = event.params.journalId;
  const detailResponse = await fetchApi(event, `/journal-governance/journals/${journalId}`);
  if (!detailResponse.ok) {
    return {
      notFound: true,
      journal: null,
      customFields: [],
      history: [],
      attachments: [],
      versionsByAttachment: {}
    };
  }

  const detail = (await detailResponse.json()) as {
    journal: any;
    customFields: any[];
    history: any[];
    attachments: Array<{ id: string }>;
  };

  const versionsEntries = await Promise.all(
    detail.attachments.map(async (attachment) => {
      const versionsResponse = await fetchApi(event, `/journal-governance/journals/${journalId}/attachments/${attachment.id}/versions`);
      if (!versionsResponse.ok) {
        return [attachment.id, []] as const;
      }
      const payload = (await versionsResponse.json()) as { versions?: unknown[] };
      return [attachment.id, payload.versions ?? []] as const;
    })
  );

  return {
    notFound: false,
    journal: detail.journal,
    customFields: detail.customFields,
    history: detail.history,
    attachments: detail.attachments,
    versionsByAttachment: Object.fromEntries(versionsEntries)
  };
};

export const actions: Actions = {
  updateJournal: async (event) => {
    const journalId = event.params.journalId;
    const formData = await event.request.formData();
    const customFieldValues = await buildCustomFieldValues(event, formData);

    const payload = {
      title: String(formData.get('title') ?? '').trim(),
      issn: String(formData.get('issn') ?? '').trim(),
      publisher: String(formData.get('publisher') ?? '').trim(),
      customFieldValues,
      changeComment: String(formData.get('changeComment') ?? '').trim()
    };

    const response = await fetchApi(event, `/journal-governance/journals/${journalId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'updateJournal',
        message: await normalizeError(response)
      });
    }

    return { action: 'updateJournal', ok: true };
  },

  deleteJournal: async (event) => {
    const journalId = event.params.journalId;
    const formData = await event.request.formData();
    const payload = {
      changeComment: String(formData.get('changeComment') ?? '').trim()
    };

    const response = await fetchApi(event, `/journal-governance/journals/${journalId}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'deleteJournal',
        message: await normalizeError(response)
      });
    }

    return { action: 'deleteJournal', ok: true };
  },

  addLinkAttachment: async (event) => {
    const journalId = event.params.journalId;
    const formData = await event.request.formData();

    const payload = {
      attachmentKey: String(formData.get('attachmentKey') ?? '').trim(),
      label: String(formData.get('label') ?? '').trim(),
      category: String(formData.get('category') ?? '').trim(),
      externalUrl: String(formData.get('externalUrl') ?? '').trim(),
      notes: String(formData.get('notes') ?? '').trim()
    };

    const response = await fetchApi(event, `/journal-governance/journals/${journalId}/attachments/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'addLinkAttachment',
        message: await normalizeError(response)
      });
    }

    return { action: 'addLinkAttachment', ok: true };
  },

  uploadFileAttachment: async (event) => {
    const journalId = event.params.journalId;
    const formData = await event.request.formData();

    const response = await fetchApi(event, `/journal-governance/journals/${journalId}/attachments/file`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'uploadFileAttachment',
        message: await normalizeError(response)
      });
    }

    return { action: 'uploadFileAttachment', ok: true };
  }
};
