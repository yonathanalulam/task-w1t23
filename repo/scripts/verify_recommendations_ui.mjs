import { execFileSync, execSync } from 'node:child_process';

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

const formBody = (entries) => new URLSearchParams(entries).toString();

const assertActionNotFailure = (payload, label) => {
  if (payload.includes('"type":"failure"')) {
    throw new Error(`${label} returned Svelte action failure payload: ${payload.slice(0, 260)}`);
  }
};

const apiRequestFromWebContainer = (method, path, payload) => {
  const runtimeScript = `
const [method, url, cookieHeader, payloadText] = process.argv.slice(1);
const run = async () => {
  const init = {
    method,
    headers: { cookie: cookieHeader }
  };
  if (payloadText !== '__NO_BODY__') {
    init.headers['content-type'] = 'application/json';
    init.body = payloadText;
  }
  const response = await fetch(url, init);
  const text = await response.text();
  process.stdout.write(text + '\\n' + response.status);
};
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  const raw = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'web',
      'node',
      '-e',
      runtimeScript,
      method,
      `http://api:3000/api/v1${path}`,
      cookie,
      payload === undefined ? '__NO_BODY__' : JSON.stringify(payload)
    ],
    { encoding: 'utf8' }
  );

  const newline = raw.lastIndexOf('\n');
  const body = newline >= 0 ? raw.slice(0, newline) : raw;
  const status = Number((newline >= 0 ? raw.slice(newline + 1) : '').trim());

  let json = null;
  try {
    json = JSON.parse(body);
  } catch {
    json = null;
  }

  return { status, body, json };
};

const main = async () => {
  const suffix = Date.now().toString(36);
  const token = `recokey-${suffix}`;
  const journalTitle = `Journal ${token}`;
  const policyTitle = `Funding ${token}`;
  const resourceName = `Resource ${token}`;

  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('administrator','researcher','resource_manager') WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
    { stdio: 'ignore' }
  );

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
      description: `Policy for ${token}`,
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: '2099-01-01T00:00',
      graceHours: '24',
      annualCapAmount: '5000',
      approvalLevelsRequired: '1',
      templates: 'Research Plan'
    })
  });
  console.log('create policy action:', response.status);
  assertStatus(response.status, [200, 303], 'create policy', response.text);
  if (response.status === 200) {
    assertActionNotFailure(response.text, 'create policy action');
  }

  const fieldsApi = apiRequestFromWebContainer('GET', '/journal-governance/custom-fields');
  assertStatus(fieldsApi.status, [200], 'list custom fields api', fieldsApi.body);
  const fields = Array.isArray(fieldsApi.json?.fields) ? fieldsApi.json.fields : [];
  const customFieldValues = {};
  for (const field of fields) {
    if (!field?.isRequired) continue;
    const key = String(field.fieldKey ?? '');
    if (!key) continue;
    const fieldType = String(field.fieldType ?? 'TEXT');
    if (fieldType === 'NUMBER') customFieldValues[key] = 1;
    else if (fieldType === 'DATE') customFieldValues[key] = '2026-01-01';
    else if (fieldType === 'URL') customFieldValues[key] = 'https://example.org';
    else if (fieldType === 'BOOLEAN') customFieldValues[key] = true;
    else if (fieldType === 'SELECT') customFieldValues[key] = Array.isArray(field.options) && field.options.length > 0 ? String(field.options[0]) : 'default';
    else customFieldValues[key] = token;
  }

  const createJournalApi = apiRequestFromWebContainer('POST', '/journal-governance/journals', {
    title: journalTitle,
    publisher: 'Recommendation Press',
    customFieldValues,
    changeComment: 'recommendation verification seed'
  });
  console.log('create journal api:', createJournalApi.status);
  assertStatus(createJournalApi.status, [201], 'create journal api', createJournalApi.body);

  response = await request('/manager?/createResource', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      resourceType: 'ROOM',
      name: resourceName,
      description: `Resource for ${token}`,
      location: 'Recommendation Lab',
      capacity: '4',
      timezone: 'UTC',
      isActive: 'on'
    })
  });
  console.log('create resource action:', response.status);
  assertStatus(response.status, [200, 303], 'create resource', response.text);
  if (response.status === 200) {
    assertActionNotFailure(response.text, 'create resource action');
  }

  response = await request('/manager');
  assertStatus(response.status, [200], 'manager page', response.text);
  const escapedResourceName = resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const resourceRegex = new RegExp(`${escapedResourceName}[\\s\\S]*?/manager/resources/([0-9a-f-]{36})`, 'i');
  const resourceMatch = response.text.match(resourceRegex);
  const resourceId = resourceMatch?.[1];
  if (!resourceId) {
    throw new Error('resource id not found on manager page for recommendations verification');
  }

  response = await request('/researcher/recommendations');
  assertStatus(response.status, [200], 'recommendations page', response.text);
  const hasJournal = response.text.includes(journalTitle);
  const hasPolicy = response.text.includes(policyTitle);
  const hasResource = response.text.includes(resourceName);
  console.log('initial journal visible:', hasJournal);
  console.log('initial funding visible:', hasPolicy);
  console.log('initial resource visible:', hasResource);
  if (!hasJournal || !hasPolicy || !hasResource) {
    throw new Error('recommendations page did not show all seeded domain candidates');
  }

  response = await request('/researcher/recommendations?/updatePreferences', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      preferredDisciplines: '',
      preferredKeywords: token,
      preferredPublishers: '',
      preferredLocations: '',
      preferredResourceTypes: 'ROOM'
    })
  });
  console.log('update preferences action:', response.status);
  assertStatus(response.status, [200, 303], 'update preferences', response.text);

  response = await request('/researcher/recommendations');
  assertStatus(response.status, [200], 'recommendations page post-preference', response.text);
  const keywordReasonVisible = response.text.includes(`Contains your keyword "${token.toLowerCase()}"`) || response.text.includes('Contains your keyword');
  console.log('keyword reason visible:', keywordReasonVisible);
  if (!keywordReasonVisible) {
    throw new Error('recommendation explanation did not show keyword-based reason');
  }

  response = await request('/researcher/recommendations?/setFeedback', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      targetType: 'RESOURCE',
      targetId: resourceId,
      action: 'BLOCK'
    })
  });
  console.log('set feedback block action:', response.status);
  assertStatus(response.status, [200, 303], 'set feedback block', response.text);

  response = await request('/researcher/recommendations');
  assertStatus(response.status, [200], 'recommendations page post-block', response.text);
  const resourceStillVisible = response.text.includes(resourceName);
  console.log('resource hidden after block:', !resourceStillVisible);
  if (resourceStillVisible) {
    throw new Error('blocked resource still visible in recommendations');
  }

  console.log('UI recommendations scenario verification passed');
};

await main();
