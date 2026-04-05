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
    throw new Error(`${label} failed: ${status}. payload: ${payload.slice(0, 240)}`);
  }
};

const formBody = (entries) => new URLSearchParams(entries).toString();

const main = async () => {
  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code = 'researcher' WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
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
      title: 'Retro Policy',
      description: 'Backdated for extension scenario',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: '2026-01-01T00:00',
      graceHours: '24',
      annualCapAmount: '5000',
      templates: 'Budget Sheet'
    })
  });
  console.log('create policy action:', response.status);
  assertStatus(response.status, [200, 303], 'create policy', response.text);

  response = await request('/researcher');
  assertStatus(response.status, [200], 'researcher list', response.text);

  const policyMatch = response.text.match(/<option[^>]*value="([0-9a-f-]{36})"[^>]*>[^<]*Retro Policy/i);
  if (!policyMatch) {
    throw new Error('policy id not found on researcher page');
  }
  const policyId = policyMatch[1];
  console.log('policy id:', policyId);

  response = await request('/researcher?/createDraft', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      policyId,
      title: 'Extension Window Submission',
      requestedAmount: '1200',
      summary: 'Draft for extension-state verification'
    })
  });
  console.log('create draft action:', response.status);
  assertStatus(response.status, [200, 303], 'create draft', response.text);

  response = await request('/researcher');
  const appMatch = response.text.match(/\/researcher\/applications\/([0-9a-f-]{36})/);
  if (!appMatch) {
    throw new Error('application id not found on researcher page');
  }
  const applicationId = appMatch[1];
  console.log('application id:', applicationId);

  response = await request(`/researcher/applications/${applicationId}`);
  assertStatus(response.status, [200], 'application detail (pre-extension)', response.text);
  const preBlocked = response.text.includes('Blocked late') || response.text.includes('blocked after the grace window');
  const preSubmitDisabled = /<button[^>]*disabled[^>]*>Submit<\/button>/.test(response.text);
  console.log('pre-extension blocked visible:', preBlocked);
  console.log('pre-extension submit disabled:', preSubmitDisabled);

  if (!preBlocked || !preSubmitDisabled) {
    throw new Error('pre-extension UI did not show blocked state with disabled submit control');
  }

  response = await request('/admin?/grantExtension', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      applicationId,
      extendedUntil: '2099-01-01T00:00',
      reason: 'Manual extension for delayed materials'
    })
  });
  console.log('grant extension action:', response.status);
  assertStatus(response.status, [200, 303], 'grant extension', response.text);

  response = await request(`/researcher/applications/${applicationId}`);
  assertStatus(response.status, [200], 'application detail (post-extension)', response.text);
  const extensionOpen = response.text.includes('Extension open');
  const submitDisabledAfter = /<button[^>]*disabled[^>]*>Submit<\/button>/.test(response.text);
  console.log('post-extension extension-open visible:', extensionOpen);
  console.log('post-extension submit disabled:', submitDisabledAfter);

  if (!extensionOpen || submitDisabledAfter) {
    throw new Error('post-extension UI did not show extension-open with enabled submit control');
  }

  console.log('UI extension scenario verification passed');
};

await main();
