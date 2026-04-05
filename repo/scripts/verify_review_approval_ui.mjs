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

const apiRequestFromWebContainer = (method, path, payload) => {
const runtimeScript = `
const [method, url, cookieHeader, payloadText] = process.argv.slice(1);
const run = async () => {
  const init = {
    method,
    headers: {
      cookie: cookieHeader
    }
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

  return {
    status,
    body,
    json: (() => {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    })()
  };
};

const main = async () => {
  const suffix = Date.now().toString(36);
  const policyTitle = `Workflow Policy ${suffix}`;

  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('administrator','researcher','reviewer','approver') WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
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
      description: 'Policy for workflow UI verification',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      submissionDeadlineAt: '2099-01-01T00:00',
      graceHours: '24',
      annualCapAmount: '999999',
      approvalLevelsRequired: '2',
      templates: 'Budget Sheet'
    })
  });
  console.log('create policy action:', response.status);
  assertStatus(response.status, [200, 303], 'create policy', response.text);

  response = await request('/researcher');
  assertStatus(response.status, [200], 'researcher list', response.text);

  const escapedTitle = policyTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const policyRegex = new RegExp(`<option[^>]*value="([0-9a-f-]{36})"[^>]*>${escapedTitle}`);
  const policyMatch = response.text.match(policyRegex);
  if (!policyMatch) {
    throw new Error('policy id not found on researcher page');
  }
  const policyId = policyMatch[1];
  console.log('policy id:', policyId);

  const createAppApi = apiRequestFromWebContainer('POST', '/researcher/applications', {
    policyId,
    title: `Workflow App ${suffix}`,
    requestedAmount: '1200',
    summary: 'Draft for reviewer/approver verification'
  });
  console.log('api create draft:', createAppApi.status);
  assertStatus(createAppApi.status, [201], 'api create draft', createAppApi.body);

  const applicationId = createAppApi.json?.application?.id;
  if (!applicationId) {
    throw new Error('application id missing from API create draft response');
  }
  console.log('application id:', applicationId);

  const addLinkApi = apiRequestFromWebContainer('POST', `/researcher/applications/${applicationId}/documents/link`, {
    documentKey: 'template_1',
    label: 'Budget Sheet',
    externalUrl: 'https://example.org/budget-sheet'
  });
  console.log('api add link:', addLinkApi.status);
  assertStatus(addLinkApi.status, [201], 'api add required document link', addLinkApi.body);

  const submitApi = apiRequestFromWebContainer('POST', `/researcher/applications/${applicationId}/submit`);
  console.log('api submit:', submitApi.status);
  assertStatus(submitApi.status, [200], 'api submit', submitApi.body);

  response = await request(`/researcher/applications/${applicationId}`);
  assertStatus(response.status, [200], 'researcher detail post-submit', response.text);
  const statusMatch = response.text.match(/Status:\s*<strong[^>]*>([^<]+)<\/strong>/i);
  const postSubmitStatus = statusMatch?.[1] ?? 'UNKNOWN';
  console.log('researcher detail status after submit:', postSubmitStatus);
  if (postSubmitStatus !== 'SUBMITTED_ON_TIME' && postSubmitStatus !== 'SUBMITTED_LATE') {
    throw new Error(`researcher detail did not show submitted status before reviewer queue check (status=${postSubmitStatus})`);
  }

  response = await request('/researcher');
  const appMatch = response.text.match(/\/researcher\/applications\/([0-9a-f-]{36})/);
  if (!appMatch) {
    throw new Error('application link not found on researcher page after API submit');
  }

  response = await request('/reviewer');
  assertStatus(response.status, [200], 'reviewer queue', response.text);
  const reviewerVisible = response.text.includes(applicationId);
  console.log('reviewer queue has app:', reviewerVisible);
  if (!reviewerVisible) {
    throw new Error('reviewer queue did not show submitted application');
  }

  response = await request(`/reviewer/applications/${applicationId}?/decide`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      decision: 'forward_to_approval',
      comment: 'Eligibility checks passed; forwarding to approvers.'
    })
  });
  console.log('reviewer decision action:', response.status);
  assertStatus(response.status, [200, 303], 'reviewer decision', response.text);

  response = await request('/approver');
  assertStatus(response.status, [200], 'approver queue level1', response.text);
  const levelOneVisible = response.text.includes('Level 1 of 2') && response.text.includes(applicationId);
  console.log('approver queue level1 visible:', levelOneVisible);
  if (!levelOneVisible) {
    throw new Error('approver queue did not show level 1 item after reviewer forward');
  }

  response = await request(`/approver/applications/${applicationId}?/signOff`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      decision: 'approve',
      comment: 'Level 1 sign-off complete.'
    })
  });
  console.log('approver level1 sign-off action:', response.status);
  assertStatus(response.status, [200, 303], 'approver sign-off level1', response.text);

  response = await request('/approver');
  assertStatus(response.status, [200], 'approver queue level2', response.text);
  const levelTwoVisible = response.text.includes('Level 2 of 2') && response.text.includes(applicationId);
  console.log('approver queue level2 visible:', levelTwoVisible);
  if (!levelTwoVisible) {
    throw new Error('approver queue did not advance to level 2');
  }

  response = await request(`/approver/applications/${applicationId}?/signOff`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      decision: 'approve',
      comment: 'Final approval granted.'
    })
  });
  console.log('approver level2 sign-off action:', response.status);
  assertStatus(response.status, [200, 303], 'approver sign-off level2', response.text);

  response = await request(`/researcher/applications/${applicationId}`);
  assertStatus(response.status, [200], 'researcher detail post-approval', response.text);
  const finalStatusMatch = response.text.match(/Status:\s*<strong[^>]*>([^<]+)<\/strong>/i);
  const finalStatus = finalStatusMatch?.[1] ?? 'UNKNOWN';
  console.log('researcher detail final status:', finalStatus);
  if (finalStatus !== 'APPROVED') {
    throw new Error(`researcher detail did not show APPROVED after final sign-off (status=${finalStatus})`);
  }

  console.log('UI review/approval workflow scenario verification passed');
};

await main();
