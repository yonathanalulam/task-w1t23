import { execSync } from 'node:child_process';

const base = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:4173';
const dbUser = process.env.RRGA_DB_USER;
const dbName = process.env.RRGA_DB_NAME;

if (!dbUser || !dbName) {
  throw new Error('RRGA_DB_USER and RRGA_DB_NAME are required in environment for verification script.');
}

let cookie = '';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  return { status: response.status, text };
};

const requestWithRetry = async (path, options = {}, retries = 20, delayMs = 1500) => {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await request(path, options);
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const assertStatus = (status, allowed, label, payload) => {
  if (!allowed.includes(status)) {
    throw new Error(`${label} failed: ${status}. payload: ${payload.slice(0, 320)}`);
  }
};

const assertActionSuccessPayload = (payload, label) => {
  if (payload.includes('"type":"failure"')) {
    throw new Error(`${label} returned failure action payload: ${payload.slice(0, 320)}`);
  }
};

const formBody = (entries) => new URLSearchParams(entries).toString();

const nowLocalInput = (offsetMinutes = 0) => {
  const date = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const ensureAdminRole = (roleCode) => {
  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code = '${roleCode}' WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
    { stdio: 'ignore' }
  );
};

const extractIdAfterText = (html, text, pathPrefix) => {
  const regex = new RegExp(`${escapeRegex(text)}[\\s\\S]*?${escapeRegex(pathPrefix)}([0-9a-f-]{36})`, 'i');
  return html.match(regex)?.[1] ?? null;
};

const extractExceptionRowIdByReference = (html, wechatReference) => {
  const regex = new RegExp(`Ref:\\s*${escapeRegex(wechatReference)}[\\s\\S]{0,1600}?name="rowId" value="(\\d+)"`, 'i');
  const match = html.match(regex);
  return match ? Number(match[1]) : null;
};

const extractJournalIds = (html) => {
  const ids = [];
  const regex = /href="\/admin\/journals\/([0-9a-f-]{36})"/gi;
  for (const match of html.matchAll(regex)) {
    const id = match[1];
    if (id) {
      ids.push(id);
    }
  }

  return [...new Set(ids)];
};

const buildJournalCustomFieldEntriesFromPage = (html) => {
  const entries = {};

  const checkboxRegex = /<input[^>]*type="checkbox"[^>]*name="(cf_[^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(checkboxRegex)) {
    const key = match[1];
    if (key) entries[key] = 'true';
  }

  const dateRegex = /<input[^>]*type="date"[^>]*name="(cf_[^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(dateRegex)) {
    const key = match[1];
    if (key) entries[key] = '2026-01-01';
  }

  const numberRegex = /<input[^>]*type="number"[^>]*name="(cf_[^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(numberRegex)) {
    const key = match[1];
    if (key) entries[key] = '1';
  }

  const urlRegex = /<input[^>]*type="url"[^>]*name="(cf_[^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(urlRegex)) {
    const key = match[1];
    if (key) entries[key] = 'https://example.org/hardening';
  }

  const selectRegex = /<select[^>]*name="(cf_[^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  for (const match of html.matchAll(selectRegex)) {
    const key = match[1];
    const selectHtml = match[2] ?? '';
    const optionMatch = selectHtml.match(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/i);
    if (key) {
      entries[key] = optionMatch?.[1] ? String(optionMatch[1]) : 'A';
    }
  }

  const textRegex = /<input(?![^>]*type=)[^>]*name="(cf_[^"]+)"[^>]*>/gi;
  for (const match of html.matchAll(textRegex)) {
    const key = match[1];
    if (key && !entries[key]) {
      entries[key] = 'hardening-value';
    }
  }

  return entries;
};

const main = async () => {
  const suffix = Date.now().toString(36);
  const policyTitle = `Hardening Policy ${suffix}`;
  const researcherDraftTitle = `Hardening Draft ${suffix}`;
  const researcherDocumentKey = 'template_1';
  const researcherHoldContent = '-----BEGIN RSA PRIVATE KEY-----\nabc123\n-----END RSA PRIVATE KEY-----';

  const journalTitle = `Hardening Journal ${suffix}`;
  const journalAttachmentKey = `contract_${suffix}`.slice(0, 40);

  const invoiceDescription = `Hardening Invoice ${suffix}`;
  const wechatRefMatch = `wx-hardening-match-${suffix}`;
  const wechatRefMismatch = `wx-hardening-mismatch-${suffix}`;
  const wechatRefUnknown = `wx-hardening-unknown-${suffix}`;
  const resolveNote = `Resolved after hardening verify ${suffix}`;
  const closeNote = `Closed non-actionable row ${suffix}`;

  let response = await requestWithRetry('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  ensureAdminRole('researcher');
  ensureAdminRole('finance_clerk');

  response = await request('/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('login:', response.status);
  assertStatus(response.status, [200], 'login', response.text);

  response = await request('/admin?/createPolicy', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      title: policyTitle,
      description: 'Hardening-specific policy for upload visibility checks',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: '2099-01-01T00:00',
      graceHours: '24',
      annualCapAmount: '500000',
      approvalLevelsRequired: '1',
      templates: 'Budget Sheet'
    })
  });
  console.log('create policy action:', response.status);
  assertStatus(response.status, [200, 303], 'create policy', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'create policy');
  }

  response = await request('/researcher');
  assertStatus(response.status, [200], 'researcher page', response.text);
  const policyIdMatch = response.text.match(new RegExp(`<option[^>]*value="([0-9a-f-]{36})"[^>]*>${escapeRegex(policyTitle)}\\s*\\(`, 'i'));
  const policyId = policyIdMatch?.[1] ?? null;
  if (!policyId) {
    throw new Error('policy id not found on researcher page for hardening policy');
  }

  response = await request('/researcher?/createDraft', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      policyId,
      title: researcherDraftTitle,
      requestedAmount: '1000',
      summary: 'Hardening upload visibility verification'
    })
  });
  console.log('create draft action:', response.status);
  assertStatus(response.status, [200, 303], 'create draft', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'create draft');
  }

  response = await request('/researcher');
  assertStatus(response.status, [200], 'researcher page after draft', response.text);
  const applicationId = extractIdAfterText(response.text, researcherDraftTitle, '/researcher/applications/');
  if (!applicationId) {
    throw new Error('application id not found for hardening researcher draft');
  }
  console.log('researcher application id:', applicationId);

  const researcherUpload = new FormData();
  researcherUpload.set('documentKey', researcherDocumentKey);
  researcherUpload.set('label', 'Sensitive Draft Document');
  researcherUpload.set('file', new File([researcherHoldContent], `hardening-researcher-${suffix}.txt`, { type: 'text/plain' }));

  response = await request(`/researcher/applications/${applicationId}?/uploadFile`, {
    method: 'POST',
    body: researcherUpload
  });
  console.log('researcher upload action:', response.status);
  assertStatus(response.status, [200, 303], 'researcher upload', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'researcher upload');
  }

  response = await request(`/researcher/applications/${applicationId}`);
  assertStatus(response.status, [200], 'researcher application detail', response.text);
  const researcherHeldVisible =
    response.text.includes(`Key: ${researcherDocumentKey}`) &&
    response.text.includes('scan=HELD') &&
    (/Held for admin review/i.test(response.text) || />\s*·\s*held\s*</i.test(response.text));
  const researcherVersionHeldVisible = /scan=HELD/i.test(response.text);
  console.log('researcher held status visible:', researcherHeldVisible);
  console.log('researcher version held marker visible:', researcherVersionHeldVisible);
  if (!researcherHeldVisible || !researcherVersionHeldVisible) {
    throw new Error('researcher document hardening visibility not shown as expected (HELD + held-for-review markers).');
  }

  response = await request('/admin/journals');
  assertStatus(response.status, [200], 'admin journals page', response.text);
  let journalsPageHtml = response.text;

  let journalIds = extractJournalIds(journalsPageHtml);

  if (journalIds.length === 0) {
    response = await request('/admin/journals?/createJournal', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({
        title: journalTitle,
        issn: '9876-5432',
        publisher: 'Hardening Press',
        changeComment: 'Journal for hardening upload visibility checks'
      })
    });
    console.log('create fallback journal action:', response.status);
    assertStatus(response.status, [200, 303], 'create fallback journal', response.text);
    if (response.status === 200 && response.text.includes('"type":"failure"')) {
      throw new Error(`create fallback journal failed: ${response.text.slice(0, 320)}`);
    }

    response = await request('/admin/journals');
    assertStatus(response.status, [200], 'admin journals list after fallback create', response.text);
    journalsPageHtml = response.text;
    journalIds = extractJournalIds(journalsPageHtml);
  }

  if (journalIds.length === 0) {
    throw new Error('journal id not found for hardening journal');
  }

  const journalUploadAttempt = async (targetJournalId) => {
    const journalUpload = new FormData();
    journalUpload.set('attachmentKey', journalAttachmentKey);
    journalUpload.set('label', 'Sensitive Contract');
    journalUpload.set('category', 'CONTRACT');
    journalUpload.set('notes', 'Hardening held visibility proof');
    journalUpload.set('file', new File([researcherHoldContent], `hardening-journal-${suffix}.txt`, { type: 'text/plain' }));

    const uploadResponse = await request(`/admin/journals/${targetJournalId}?/uploadFileAttachment`, {
      method: 'POST',
      body: journalUpload
    });

    return uploadResponse;
  };

  let journalId = null;
  let lastJournalUploadResponse = null;
  for (const candidateJournalId of journalIds) {
    const attempt = await journalUploadAttempt(candidateJournalId);
    lastJournalUploadResponse = attempt;

    const successfulStatus = [200, 303].includes(attempt.status);
    const actionFailedPayload = attempt.status === 200 && attempt.text.includes('"type":"failure"');

    if (successfulStatus && !actionFailedPayload) {
      journalId = candidateJournalId;
      response = attempt;
      break;
    }
  }

  if (!journalId || !response) {
    const customFieldEntries = buildJournalCustomFieldEntriesFromPage(journalsPageHtml);
    const fallbackCreate = await request('/admin/journals?/createJournal', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formBody({
        title: journalTitle,
        issn: '9876-5432',
        publisher: 'Hardening Press',
        ...customFieldEntries,
        changeComment: 'Fallback journal creation for hardening verification'
      })
    });

    if (![200, 303].includes(fallbackCreate.status) || (fallbackCreate.status === 200 && fallbackCreate.text.includes('"type":"failure"'))) {
      throw new Error(
        `journal file upload failed across candidate journals and fallback journal creation failed: ${(lastJournalUploadResponse?.text ?? '').slice(0, 220)} :: ${fallbackCreate.text.slice(0, 220)}`
      );
    }

    response = await request('/admin/journals');
    assertStatus(response.status, [200], 'admin journals list after fallback create+upload', response.text);
    const createdJournalId = extractIdAfterText(response.text, journalTitle, '/admin/journals/');
    if (!createdJournalId) {
      throw new Error('fallback journal created but id was not discoverable on journals list page.');
    }

    const retryUpload = await journalUploadAttempt(createdJournalId);
    const retrySuccess = [200, 303].includes(retryUpload.status) && !(retryUpload.status === 200 && retryUpload.text.includes('"type":"failure"'));
    if (!retrySuccess) {
      throw new Error(`journal fallback upload still failed: ${retryUpload.text.slice(0, 320)}`);
    }

    journalId = createdJournalId;
    response = retryUpload;
  }

  console.log('journal id:', journalId);
  console.log('journal file attachment upload action:', response.status);
  assertStatus(response.status, [200, 303], 'journal file upload', response.text);
  if (response.status === 200 && response.text.includes('"type":"failure"')) {
    throw new Error(`journal file upload returned failure payload: ${response.text.slice(0, 320)}`);
  }

  response = await request(`/admin/journals/${journalId}`);
  assertStatus(response.status, [200], 'journal detail hardening check', response.text);
  const journalHeldVisible =
    response.text.includes(journalAttachmentKey) &&
    response.text.includes('scan=HELD') &&
    response.text.includes('held for review');
  console.log('journal held status visible:', journalHeldVisible);
  if (!journalHeldVisible) {
    throw new Error('journal attachment hardening visibility not shown as expected (scan=HELD + held-for-review).');
  }

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
  console.log('finance create invoice action:', response.status);
  assertStatus(response.status, [200, 303], 'finance create invoice', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'finance create invoice');
  }

  response = await request('/finance');
  assertStatus(response.status, [200], 'finance page after create', response.text);
  const invoiceId = extractIdAfterText(response.text, invoiceDescription, '/finance/invoices/');
  if (!invoiceId) {
    throw new Error('invoice id not found on finance page for hardening invoice');
  }
  console.log('finance invoice id:', invoiceId);

  response = await request(`/finance/invoices/${invoiceId}?/recordPayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      amount: '100.00',
      wechatTransactionRef: wechatRefMatch,
      receivedAt: nowLocalInput(1),
      note: 'match payment'
    })
  });
  assertStatus(response.status, [200, 303], 'record match payment', response.text);

  response = await request(`/finance/invoices/${invoiceId}?/recordPayment`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      amount: '60.00',
      wechatTransactionRef: wechatRefMismatch,
      receivedAt: nowLocalInput(2),
      note: 'mismatch payment'
    })
  });
  assertStatus(response.status, [200, 303], 'record mismatch payment', response.text);

  const csvText = [
    'wechatTransactionRef,amount,settledAt',
    `${wechatRefMatch},100.00,2026-05-01T10:00:00.000Z`,
    `${wechatRefMismatch},55.00,2026-05-01T10:05:00.000Z`,
    `${wechatRefUnknown},20.00,2026-05-01T10:10:00.000Z`
  ].join('\n');

  response = await request('/finance?/importSettlementCsv', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      sourceLabel: `hardening-${suffix}.csv`,
      csvText
    })
  });
  console.log('finance import settlement action:', response.status);
  assertStatus(response.status, [200, 303], 'finance settlement import', response.text);

  response = await request('/finance');
  assertStatus(response.status, [200], 'finance page before resolve/close', response.text);
  const controlsVisible = response.text.includes('Close (no remediation)') && response.text.includes('Resolve');
  console.log('finance resolve/close controls visible:', controlsVisible);
  if (!controlsVisible) {
    throw new Error('finance exception resolve/close controls were not visible on finance page.');
  }

  const resolveRowId = extractExceptionRowIdByReference(response.text, wechatRefMismatch);
  const closeRowId = extractExceptionRowIdByReference(response.text, wechatRefUnknown);
  if (!resolveRowId || !closeRowId) {
    throw new Error('failed to locate exception row ids for resolve/close hardening verification.');
  }
  console.log('resolve row id:', resolveRowId);
  console.log('close row id:', closeRowId);

  response = await request('/finance?/resolveException', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ rowId: String(resolveRowId), resolutionNote: resolveNote })
  });
  console.log('resolve exception action:', response.status);
  assertStatus(response.status, [200, 303], 'resolve exception action', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'resolve exception action');
  }

  response = await request('/finance?/closeException', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ rowId: String(closeRowId), resolutionNote: closeNote })
  });
  console.log('close exception action:', response.status);
  assertStatus(response.status, [200, 303], 'close exception action', response.text);
  if (response.status === 200) {
    assertActionSuccessPayload(response.text, 'close exception action');
  }

  response = await request('/finance');
  assertStatus(response.status, [200], 'finance page after resolve/close', response.text);
  const resolvedHistoryVisible =
    response.text.includes('Recently resolved/closed exceptions') &&
    response.text.includes(resolveNote) &&
    response.text.includes(closeNote) &&
    response.text.includes('RESOLVED') &&
    response.text.includes('CLOSED');
  const openRowsCleared =
    !response.text.includes(`name="rowId" value="${resolveRowId}"`) &&
    !response.text.includes(`name="rowId" value="${closeRowId}"`);
  console.log('finance resolved history visible:', resolvedHistoryVisible);
  console.log('finance resolved rows removed from open queue:', openRowsCleared);

  if (!resolvedHistoryVisible || !openRowsCleared) {
    throw new Error('finance resolve/close hardening visibility checks failed (history/open queue state mismatch).');
  }

  console.log('UI hardening verification passed: researcher upload, journal attachment, finance resolve/close surfaces');
};

await main();
