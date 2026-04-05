import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fetchApi } from '$lib/server/api';

const normalizeError = async (response: Response): Promise<string> => {
  const raw = await response.text().catch(() => '');
  if (!raw) {
    return `Request failed (${response.status})`;
  }

  try {
    const payload = JSON.parse(raw) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

const localDateTimeToIso = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
};

export const load: PageServerLoad = async (event) => {
  const [invoicesResponse, queueResponse] = await Promise.all([
    fetchApi(event, '/finance/invoices'),
    fetchApi(event, '/finance/reconciliation/queue')
  ]);

  const invoices = invoicesResponse.ok ? ((await invoicesResponse.json()) as { invoices?: unknown[] }).invoices ?? [] : [];
  const queue = queueResponse.ok
    ? ((await queueResponse.json()) as {
      unsettledInvoices?: unknown[];
      exceptionInvoices?: unknown[];
      unsettledPayments?: unknown[];
      exceptionRows?: unknown[];
      resolvedExceptionRows?: unknown[];
      })
    : { unsettledInvoices: [], exceptionInvoices: [], unsettledPayments: [], exceptionRows: [], resolvedExceptionRows: [] };

  return {
    invoices,
    unsettledInvoices: queue.unsettledInvoices ?? [],
    exceptionInvoices: queue.exceptionInvoices ?? [],
    unsettledPayments: queue.unsettledPayments ?? [],
    exceptionRows: queue.exceptionRows ?? [],
    resolvedExceptionRows: queue.resolvedExceptionRows ?? []
  };
};

export const actions: Actions = {
  createInvoice: async (event) => {
    const formData = await event.request.formData();

    const payload = {
      customerUserId: String(formData.get('customerUserId') ?? '').trim() || undefined,
      serviceType: String(formData.get('serviceType') ?? '').trim(),
      serviceReferenceId: String(formData.get('serviceReferenceId') ?? '').trim() || undefined,
      description: String(formData.get('description') ?? '').trim(),
      totalAmount: String(formData.get('totalAmount') ?? '').trim(),
      dueAt: String(formData.get('dueAt') ?? '').trim() ? localDateTimeToIso(String(formData.get('dueAt'))) : undefined
    };

    const response = await fetchApi(event, '/finance/invoices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'createInvoice',
        message: await normalizeError(response)
      });
    }

    return { action: 'createInvoice', ok: true };
  },

  importSettlementCsv: async (event) => {
    const formData = await event.request.formData();

    const payload = {
      sourceLabel: String(formData.get('sourceLabel') ?? '').trim() || 'manual_csv_import',
      csvText: String(formData.get('csvText') ?? '')
    };

    const response = await fetchApi(event, '/finance/reconciliation/import-csv', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'importSettlementCsv',
        message: await normalizeError(response)
      });
    }

    const result = (await response.json()) as {
      import?: {
        id?: string;
        rowCount?: number;
        matchedCount?: number;
        exceptionCount?: number;
      };
    };

    return {
      action: 'importSettlementCsv',
      ok: true,
      importSummary: result.import ?? null
    };
  },

  resolveException: async (event) => {
    const formData = await event.request.formData();
    const rowId = String(formData.get('rowId') ?? '').trim();
    const resolutionNote = String(formData.get('resolutionNote') ?? '').trim();

    const response = await fetchApi(event, `/finance/reconciliation/exceptions/${rowId}/resolve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolutionNote })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'resolveException',
        rowId,
        message: await normalizeError(response)
      });
    }

    return { action: 'resolveException', rowId, ok: true };
  },

  closeException: async (event) => {
    const formData = await event.request.formData();
    const rowId = String(formData.get('rowId') ?? '').trim();
    const resolutionNote = String(formData.get('resolutionNote') ?? '').trim();

    const response = await fetchApi(event, `/finance/reconciliation/exceptions/${rowId}/close`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolutionNote })
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'closeException',
        rowId,
        message: await normalizeError(response)
      });
    }

    return { action: 'closeException', rowId, ok: true };
  }
};
