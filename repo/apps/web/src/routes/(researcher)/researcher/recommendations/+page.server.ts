import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';
import { parsePreferenceText } from '$lib/recommendations-ui';

const normalizeError = async (response: Response): Promise<string> => {
  const raw = await response.text().catch(() => '');

  if (raw) {
    try {
      const payload = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      return payload.error?.message ?? payload.message ?? `Request failed (${response.status})`;
    } catch {
      return `Request failed (${response.status})`;
    }
  }

  return `Request failed (${response.status})`;
};

const toPreferenceText = (values: string[]): string => values.join('\n');

export const load: PageServerLoad = async (event) => {
  const response = await fetchApi(event, '/recommendations/researcher');

  if (!response.ok) {
    return {
      recommendations: [],
      preferences: {
        preferredDisciplines: [],
        preferredKeywords: [],
        preferredPublishers: [],
        preferredResourceTypes: [],
        preferredLocations: []
      },
      feedback: []
    };
  }

  const payload = (await response.json()) as {
    recommendations: unknown[];
    preferences: {
      preferredDisciplines: string[];
      preferredKeywords: string[];
      preferredPublishers: string[];
      preferredResourceTypes: string[];
      preferredLocations: string[];
    };
    feedback: unknown[];
  };

  return {
    recommendations: payload.recommendations,
    preferences: payload.preferences,
    feedback: payload.feedback,
    preferenceText: {
      preferredDisciplines: toPreferenceText(payload.preferences.preferredDisciplines),
      preferredKeywords: toPreferenceText(payload.preferences.preferredKeywords),
      preferredPublishers: toPreferenceText(payload.preferences.preferredPublishers),
      preferredLocations: toPreferenceText(payload.preferences.preferredLocations)
    }
  };
};

export const actions: Actions = {
  updatePreferences: async (event) => {
    const formData = await event.request.formData();

    const payload = {
      preferredDisciplines: parsePreferenceText(String(formData.get('preferredDisciplines') ?? '')),
      preferredKeywords: parsePreferenceText(String(formData.get('preferredKeywords') ?? '')),
      preferredPublishers: parsePreferenceText(String(formData.get('preferredPublishers') ?? '')),
      preferredResourceTypes: formData.getAll('preferredResourceTypes').map((entry) => String(entry)),
      preferredLocations: parsePreferenceText(String(formData.get('preferredLocations') ?? ''))
    };

    const response = await fetchApi(event, '/recommendations/researcher/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'updatePreferences',
        message: await normalizeError(response)
      });
    }

    return {
      action: 'updatePreferences',
      ok: true
    };
  },

  setFeedback: async (event) => {
    const formData = await event.request.formData();

    const payload = {
      targetType: String(formData.get('targetType') ?? ''),
      targetId: String(formData.get('targetId') ?? ''),
      action: String(formData.get('action') ?? '')
    };

    const response = await fetchApi(event, '/recommendations/researcher/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'setFeedback',
        message: await normalizeError(response),
        targetType: payload.targetType,
        targetId: payload.targetId,
        feedbackAction: payload.action
      });
    }

    return {
      action: 'setFeedback',
      ok: true,
      targetType: payload.targetType,
      targetId: payload.targetId,
      feedbackAction: payload.action
    };
  }
};
