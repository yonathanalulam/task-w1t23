import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return payload.error?.message ?? `Request failed (${response.status})`;
};

const localDateTimeToIso = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const load: PageServerLoad = async (event) => {
  const [policiesResponse, holdsResponse] = await Promise.all([fetchApi(event, '/policies'), fetchApi(event, '/admin/upload-holds')]);
  const policies = policiesResponse.ok ? ((await policiesResponse.json()) as { policies: unknown[] }).policies : [];

  let researcherDocumentHolds: unknown[] = [];
  let journalAttachmentHolds: unknown[] = [];
  let adminHoldsError: string | null = null;

  if (holdsResponse.ok) {
    const payload = (await holdsResponse.json()) as {
      researcherDocumentHolds?: unknown[];
      journalAttachmentHolds?: unknown[];
    };

    researcherDocumentHolds = payload.researcherDocumentHolds ?? [];
    journalAttachmentHolds = payload.journalAttachmentHolds ?? [];
  } else {
    adminHoldsError = await normalizeError(holdsResponse);
  }

  return {
    policies,
    researcherDocumentHolds,
    journalAttachmentHolds,
    adminHoldsError
  };
};

export const actions: Actions = {
  createPolicy: async (event) => {
    const formData = await event.request.formData();

    const templatesRaw = String(formData.get('templates') ?? '').trim();
    const templates = templatesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({
        templateKey: `template_${index + 1}`,
        label: line,
        instructions: '',
        isRequired: true
      }));

    const payload = {
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? ''),
      periodStart: String(formData.get('periodStart') ?? ''),
      periodEnd: String(formData.get('periodEnd') ?? ''),
      submissionDeadlineAt: localDateTimeToIso(String(formData.get('submissionDeadlineAt') ?? '')),
      graceHours: Number(formData.get('graceHours') ?? '24'),
      annualCapAmount: String(formData.get('annualCapAmount') ?? '5000'),
      approvalLevelsRequired: Number(formData.get('approvalLevelsRequired') ?? '1'),
      isActive: true,
      templates
    };

    const response = await fetchApi(event, '/policies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createPolicy',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'createPolicy',
      ok: true
    };
  },

  grantExtension: async (event) => {
    const formData = await event.request.formData();
    const applicationId = String(formData.get('applicationId') ?? '');

    const response = await fetchApi(event, `/researcher/applications/${applicationId}/extensions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: String(formData.get('reason') ?? ''),
        extendedUntil: localDateTimeToIso(String(formData.get('extendedUntil') ?? ''))
      })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'grantExtension',
        message: await normalizeError(response)
      });
    }

    const payload = (await response.json()) as {
      application?: { id: string; status: string };
      deadline?: {
        state: string;
        message: string;
        extensionUntil: string | null;
        extensionUsedAt: string | null;
      };
    };

    return {
      action: 'grantExtension',
      ok: true,
      extensionResult: payload
    };
  },

  releaseResearcherHold: async (event) => {
    const formData = await event.request.formData();
    const versionId = String(formData.get('versionId') ?? '');
    const note = String(formData.get('note') ?? '').trim();

    const response = await fetchApi(event, `/admin/upload-holds/researcher-documents/${versionId}/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'releaseResearcherHold',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'releaseResearcherHold',
      ok: true,
      releasedVersionId: versionId
    };
  },

  releaseJournalHold: async (event) => {
    const formData = await event.request.formData();
    const versionId = String(formData.get('versionId') ?? '');
    const note = String(formData.get('note') ?? '').trim();

    const response = await fetchApi(event, `/admin/upload-holds/journal-attachments/${versionId}/release`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'releaseJournalHold',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'releaseJournalHold',
      ok: true,
      releasedVersionId: versionId
    };
  }
};
