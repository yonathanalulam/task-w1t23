import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

const fetchActiveCustomFields = async (event: Parameters<Actions['createJournal']>[0]): Promise<Array<{ fieldKey: string; fieldType: string }>> => {
  const response = await fetchApi(event, '/journal-governance/custom-fields');
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as { fields?: Array<{ fieldKey: string; fieldType: string }> };
  return payload.fields ?? [];
};

const buildCustomFieldValues = async (
  event: Parameters<Actions['createJournal']>[0],
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
  const [fieldsResponse, journalsResponse] = await Promise.all([
    fetchApi(event, '/journal-governance/custom-fields?includeInactive=true'),
    fetchApi(event, '/journal-governance/journals?includeDeleted=true')
  ]);

  const fields = fieldsResponse.ok ? ((await fieldsResponse.json()) as { fields?: unknown[] }).fields ?? [] : [];
  const journals = journalsResponse.ok ? ((await journalsResponse.json()) as { journals?: unknown[] }).journals ?? [] : [];

  return {
    fields,
    journals
  };
};

export const actions: Actions = {
  createCustomField: async (event) => {
    const formData = await event.request.formData();
    const optionsRaw = String(formData.get('options') ?? '');
    const options = optionsRaw
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const payload = {
      fieldKey: String(formData.get('fieldKey') ?? '').trim(),
      label: String(formData.get('label') ?? '').trim(),
      fieldType: String(formData.get('fieldType') ?? '').trim(),
      isRequired: String(formData.get('isRequired') ?? '') === 'on',
      options,
      helpText: String(formData.get('helpText') ?? '').trim()
    };

    const response = await fetchApi(event, '/journal-governance/custom-fields', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createCustomField',
        message: await normalizeError(response)
      });
    }

    return { action: 'createCustomField', ok: true };
  },

  updateCustomField: async (event) => {
    const formData = await event.request.formData();
    const fieldId = String(formData.get('fieldId') ?? '').trim();
    const optionsRaw = String(formData.get('options') ?? '');
    const options = optionsRaw
      .split('\n')
      .map((entry) => entry.trim())
      .filter(Boolean);

    const payload = {
      label: String(formData.get('label') ?? '').trim(),
      fieldType: String(formData.get('fieldType') ?? '').trim(),
      isRequired: String(formData.get('isRequired') ?? '') === 'on',
      isActive: String(formData.get('isActive') ?? '') === 'on',
      options,
      helpText: String(formData.get('helpText') ?? '').trim()
    };

    const response = await fetchApi(event, `/journal-governance/custom-fields/${fieldId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'updateCustomField',
        message: await normalizeError(response),
        fieldId
      });
    }

    return {
      action: 'updateCustomField',
      ok: true,
      fieldId
    };
  },

  createJournal: async (event) => {
    const formData = await event.request.formData();
    const customFieldValues = await buildCustomFieldValues(event, formData);

    const payload = {
      title: String(formData.get('title') ?? '').trim(),
      issn: String(formData.get('issn') ?? '').trim(),
      publisher: String(formData.get('publisher') ?? '').trim(),
      customFieldValues,
      changeComment: String(formData.get('changeComment') ?? '').trim()
    };

    const response = await fetchApi(event, '/journal-governance/journals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createJournal',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'createJournal',
      ok: true
    };
  }
};
