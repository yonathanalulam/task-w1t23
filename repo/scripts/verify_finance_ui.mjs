import { execSync } from 'node:child_process';

const base = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:4173';
const dbUser = process.env.RRGA_DB_USER;
const dbName = process.env.RRGA_DB_NAME;

if (!dbUser || !dbName) {
  throw new Error('RRGA_DB_USER and RRGA_DB_NAME are required in environment for verification script.');
}

let cookie = '';

const request = async (path, options = {}) => {
  const headers = { ...(options.headers ?? {}) };
  if (cookie) {
    headers.cookie = cookie;
  }

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
    redirect: 'manual'
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie && setCookie.includes('rrga_session=')) {
    cookie = setCookie.split(';', 1)[0];
  }

  const text = await response.text();
  return {
    status: response.status,
    text
  };
};

const assertStatus = (status, allowed, label, payload) => {
  if (!allowed.includes(status)) {
    throw new Error(`${label} failed: ${status}. payload: ${payload.slice(0, 260)}`);
  }
};

const assertActionSuccessPayload = (payload, label) => {
  if (payload.includes('"type":"failure"')) {
    throw new Error(`${label} returned failure action payload: ${payload.slice(0, 260)}`);
  }
};

const formBody = (entries) => new URLSearchParams(entries).toString();

const nowLocalInput = (offsetMinutes = 0) => {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const main = async () => {
  const suffix = Date.now().toString(36);
  const wechatRef1 = `wx-${suffix}-1`;
  const wechatRef2 = `wx-${suffix}-2`;
  const wechatRefundRef = `wxr-${suffix}`;
  const invoiceDescription = `Offline finance invoice ${suffix}`;

  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'finance_clerk' WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
    { stdio: 'ignore' }
  );

  response = await request('/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('login:', response.status);
  assertStatus(response.status, [200], 'login', response.text);

  response = await request('/finance?/createInvoice', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      serviceType: 'OTHER',
      description: invoiceDescription,
      totalAmount: '160.00',
      customerUserId: '',
      serviceReferenceId: '',
      dueAt: ''
    })
  });
  console.log('create invoice action:', response.status);
  assertStatus(response.status, [200, 303], 'create invoice', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'create invoice');
  }

  response = await request('/finance');
  assertStatus(response.status, [200], 'finance page list', response.text);
  const escapedDescription = invoiceDescription.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const invoiceRegex = new RegExp(`${escapedDescription}[\\s\\S]*?/finance/invoices/([0-9a-f-]{36})`, 'i');
  const invoiceMatch = response.text.match(invoiceRegex);
  const invoiceId = invoiceMatch?.[1];
  if (!invoiceId) {
    throw new Error('invoice id not found on finance page');
  }
  console.log('invoice id:', invoiceId);

  response = await request(`/finance/invoices/${invoiceId}?/recordPayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      amount: '100.00',
      wechatTransactionRef: wechatRef1,
      receivedAt: nowLocalInput(1),
      note: 'first payment'
    })
  });
  console.log('record payment 1 action:', response.status);
  assertStatus(response.status, [200, 303], 'record payment 1', response.text);
  if (response.status === 200) assertActionSuccessPayload(response.text, 'record payment 1');

  response = await request(`/finance/invoices/${invoiceId}?/recordPayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      amount: '60.00',
      wechatTransactionRef: wechatRef2,
      receivedAt: nowLocalInput(2),
      note: 'second payment'
    })
  });
  console.log('record payment 2 action:', response.status);
  assertStatus(response.status, [200, 303], 'record payment 2', response.text);
  if (response.status === 200) assertActionSuccessPayload(response.text, 'record payment 2');

  const csvText = [
    'wechatTransactionRef,amount,settledAt',
    `${wechatRef1},100.00,2026-05-01T10:00:00.000Z`,
    `${wechatRef2},55.00,2026-05-01T10:05:00.000Z`,
    `wx-unknown-${suffix},20.00,2026-05-01T10:10:00.000Z`
  ].join('\n');

  response = await request('/finance?/importSettlementCsv', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      sourceLabel: `settlement-${suffix}.csv`,
      csvText
    })
  });
  console.log('import settlement action:', response.status);
  assertStatus(response.status, [200, 303], 'import settlement', response.text);
  if (response.status === 200) assertActionSuccessPayload(response.text, 'import settlement');

  response = await request('/finance');
  assertStatus(response.status, [200], 'finance queue page', response.text);
  const hasMismatch = response.text.includes('Amount mismatch');
  const hasUnmatched = response.text.includes('Unmatched reference');
  console.log('queue mismatch visible:', hasMismatch);
  console.log('queue unmatched visible:', hasUnmatched);
  if (!hasMismatch || !hasUnmatched) {
    throw new Error('finance queue did not show expected mismatch/unmatched exception states');
  }

  response = await request(`/finance/invoices/${invoiceId}?/recordRefund`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      paymentId: '',
      amount: '30.00',
      refundMethod: 'BANK_TRANSFER',
      reason: 'Partial correction',
      refundedAt: nowLocalInput(5),
      wechatRefundReference: '',
      bankAccountName: 'Researcher Refund',
      bankRoutingNumber: '110000111',
      bankAccountNumber: '6222000012345678'
    })
  });
  console.log('record bank refund action:', response.status);
  assertStatus(response.status, [200, 303], 'record bank refund', response.text);
  if (response.status === 200) assertActionSuccessPayload(response.text, 'record bank refund');

  response = await request(`/finance/invoices/${invoiceId}`);
  assertStatus(response.status, [200], 'invoice detail post-refund', response.text);
  const hasLedgerRefund = response.text.includes('REFUND_RECORDED');
  console.log('ledger refund entry visible:', hasLedgerRefund);
  if (!hasLedgerRefund) {
    throw new Error('invoice detail did not show refund ledger entry');
  }

  const encryptedRouting = execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -tAc "SELECT bank_routing_number_encrypted FROM finance_refunds WHERE invoice_id = '${invoiceId}' ORDER BY created_at DESC LIMIT 1;"`,
    { encoding: 'utf8' }
  ).trim();
  console.log('encrypted routing present:', Boolean(encryptedRouting));
  if (!encryptedRouting || encryptedRouting.includes('110000111')) {
    throw new Error('refund routing number does not appear encrypted at rest');
  }

  const maskedTail = execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -tAc "SELECT bank_account_last4 FROM finance_refunds WHERE invoice_id = '${invoiceId}' ORDER BY created_at DESC LIMIT 1;"`,
    { encoding: 'utf8' }
  ).trim();
  console.log('bank account last4:', maskedTail);
  if (maskedTail !== '5678') {
    throw new Error('bank account last4 was not persisted as expected for follow-up tracing');
  }

  console.log('UI finance workflow scenario verification passed');
};

await main();
