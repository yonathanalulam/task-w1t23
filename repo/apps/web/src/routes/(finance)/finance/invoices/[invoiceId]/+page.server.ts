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

const nowLocalInput = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const load: PageServerLoad = async (event) => {
  const invoiceId = event.params.invoiceId;
  const response = await fetchApi(event, `/finance/invoices/${invoiceId}`);

  if (!response.ok) {
    return {
      notFound: true,
      invoice: null,
      payments: [],
      refunds: [],
      ledger: [],
      nowLocal: nowLocalInput()
    };
  }

  const payload = (await response.json()) as {
    invoice: unknown;
    payments: unknown[];
    refunds: unknown[];
    ledger: unknown[];
  };

  return {
    notFound: false,
    invoice: payload.invoice,
    payments: payload.payments,
    refunds: payload.refunds,
    ledger: payload.ledger,
    nowLocal: nowLocalInput()
  };
};

export const actions: Actions = {
  recordPayment: async (event) => {
    const invoiceId = event.params.invoiceId;
    const formData = await event.request.formData();

    const payload = {
      amount: String(formData.get('amount') ?? '').trim(),
      wechatTransactionRef: String(formData.get('wechatTransactionRef') ?? '').trim(),
      receivedAt: localDateTimeToIso(String(formData.get('receivedAt') ?? '').trim()),
      note: String(formData.get('note') ?? '').trim()
    };

    const response = await fetchApi(event, `/finance/invoices/${invoiceId}/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'recordPayment',
        message: await normalizeError(response)
      });
    }

    return { action: 'recordPayment', ok: true };
  },

  recordRefund: async (event) => {
    const invoiceId = event.params.invoiceId;
    const formData = await event.request.formData();

    const payload = {
      paymentId: String(formData.get('paymentId') ?? '').trim() || undefined,
      amount: String(formData.get('amount') ?? '').trim(),
      refundMethod: String(formData.get('refundMethod') ?? '').trim(),
      reason: String(formData.get('reason') ?? '').trim(),
      refundedAt: localDateTimeToIso(String(formData.get('refundedAt') ?? '').trim()),
      wechatRefundReference: String(formData.get('wechatRefundReference') ?? '').trim() || undefined,
      bankAccountName: String(formData.get('bankAccountName') ?? '').trim() || undefined,
      bankRoutingNumber: String(formData.get('bankRoutingNumber') ?? '').trim() || undefined,
      bankAccountNumber: String(formData.get('bankAccountNumber') ?? '').trim() || undefined
    };

    const response = await fetchApi(event, `/finance/invoices/${invoiceId}/refunds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return fail(response.status, {
        action: 'recordRefund',
        message: await normalizeError(response)
      });
    }

    return { action: 'recordRefund', ok: true };
  }
};
