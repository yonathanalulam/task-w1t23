const base = process.env.VERIFY_BASE_URL ?? 'http://127.0.0.1:4173';

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

const formBody = (entries) => new URLSearchParams(entries).toString();

const main = async () => {
  const suffix = Date.now().toString(36);
  const fieldKey = `discipline_${suffix}`;
  const journalTitle = `Governance Journal ${suffix}`;

  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  response = await request('/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('login:', response.status);
  assertStatus(response.status, [200], 'login', response.text);

  response = await request('/admin/journals');
  console.log('journals page:', response.status);
  assertStatus(response.status, [200], 'journals page', response.text);

  response = await request('/admin/journals?/createCustomField', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      fieldKey,
      label: 'Discipline',
      fieldType: 'TEXT',
      isRequired: 'on',
      options: '',
      helpText: 'Academic discipline'
    })
  });
  console.log('create custom field action:', response.status);
  assertStatus(response.status, [200, 303], 'create custom field', response.text);

  response = await request('/admin/journals?/createJournal', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      title: journalTitle,
      issn: '1234-5678',
      publisher: 'Governance Press',
      [`cf_${fieldKey}`]: 'Biology',
      changeComment: 'Initial journal setup'
    })
  });
  console.log('create journal action:', response.status);
  assertStatus(response.status, [200, 303], 'create journal', response.text);

  response = await request('/admin/journals');
  assertStatus(response.status, [200], 'journals list post-create', response.text);
  const journalRegex = new RegExp(`/admin/journals/([0-9a-f-]{36})[\"']`, 'i');
  const journalMatch = response.text.match(journalRegex);
  if (!journalMatch) {
    throw new Error('journal id not found in journals list page');
  }
  const journalId = journalMatch[1];
  console.log('journal id:', journalId);

  response = await request(`/admin/journals/${journalId}?/addLinkAttachment`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      attachmentKey: 'contract_2026',
      label: 'Contract',
      category: 'CONTRACT',
      externalUrl: 'https://example.org/contracts/2026',
      notes: 'Negotiated annual contract'
    })
  });
  console.log('add link attachment action:', response.status);
  assertStatus(response.status, [200, 303], 'add link attachment', response.text);

  response = await request(`/admin/journals/${journalId}?/updateJournal`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      title: `${journalTitle} Updated`,
      issn: '1234-5678',
      publisher: 'Governance Press',
      [`cf_${fieldKey}`]: 'Biomedical Science',
      changeComment: 'Updated catalog metadata'
    })
  });
  console.log('update journal action:', response.status);
  assertStatus(response.status, [200, 303], 'update journal', response.text);

  response = await request(`/admin/journals/${journalId}`);
  assertStatus(response.status, [200], 'journal detail', response.text);
  const hasUpdatedTitle = response.text.includes(`${journalTitle} Updated`);
  const hasAttachment = response.text.includes('contract_2026');
  const hasUpdatedHistory = response.text.includes('UPDATED');
  console.log('detail updated title visible:', hasUpdatedTitle);
  console.log('detail attachment visible:', hasAttachment);
  console.log('detail updated history visible:', hasUpdatedHistory);

  if (!hasUpdatedTitle || !hasAttachment || !hasUpdatedHistory) {
    throw new Error('journal detail did not show expected updated title/attachment/history state');
  }

  response = await request(`/admin/journals/${journalId}?/deleteJournal`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ changeComment: 'Retired for governance testing' })
  });
  console.log('delete journal action:', response.status);
  assertStatus(response.status, [200, 303], 'delete journal', response.text);

  response = await request(`/admin/journals/${journalId}`);
  assertStatus(response.status, [200], 'journal detail post-delete', response.text);
  const statusMatch = response.text.match(/Status:\s*<strong[^>]*>([^<]+)<\/strong>/i);
  const deletedVisible = statusMatch?.[1] === 'DELETED';
  console.log('deleted state visible:', deletedVisible);
  if (!deletedVisible) {
    throw new Error('journal detail did not show deleted state after delete action');
  }

  console.log('UI journal governance scenario verification passed');
};

await main();
