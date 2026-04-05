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

const formBody = (entries) => new URLSearchParams(entries).toString();

const localInput = (date) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const main = async () => {
  const suffix = Date.now().toString(36);
  const resourceName = `Resource-${suffix}`;

  let response = await request('/session/bootstrap-admin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('bootstrap:', response.status);
  assertStatus(response.status, [201, 409], 'bootstrap', response.text);

  execSync(
    `docker compose exec -T db psql -U "${dbUser}" -d "${dbName}" -c "INSERT INTO user_roles(user_id, role_id) SELECT u.id, r.id FROM users u JOIN roles r ON r.code IN ('administrator','resource_manager','researcher') WHERE u.username = 'admin' ON CONFLICT DO NOTHING;"`,
    { stdio: 'ignore' }
  );

  response = await request('/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'AdminPass1!' })
  });
  console.log('login:', response.status);
  assertStatus(response.status, [200], 'login', response.text);

  response = await request('/manager?/createResource', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      resourceType: 'ROOM',
      name: resourceName,
      description: 'Verification room',
      location: 'Building A',
      capacity: '1',
      timezone: 'UTC',
      isActive: 'on'
    })
  });
  console.log('create resource action:', response.status);
  assertStatus(response.status, [200, 303], 'create resource', response.text);

  response = await request('/manager');
  assertStatus(response.status, [200], 'manager page', response.text);
  const escapedResourceName = resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const resourceRegex = new RegExp(`${escapedResourceName}[\\s\\S]*?/manager/resources/([0-9a-f-]{36})`, 'i');
  const resourceMatch = response.text.match(resourceRegex);
  const resourceId = resourceMatch?.[1];
  if (!resourceId) {
    throw new Error('resource id not found on manager page');
  }
  console.log('resource id:', resourceId);

  const blackoutStart = new Date();
  blackoutStart.setDate(blackoutStart.getDate() + 1);
  blackoutStart.setHours(10, 0, 0, 0);
  const blackoutEnd = new Date(blackoutStart);
  blackoutEnd.setHours(11, 0, 0, 0);

  response = await request(`/manager/resources/${resourceId}?/addBlackout`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      startsAt: localInput(blackoutStart),
      endsAt: localInput(blackoutEnd),
      reason: 'Maintenance slot'
    })
  });
  console.log('add blackout action:', response.status);
  assertStatus(response.status, [200, 303], 'add blackout', response.text);

  const bookingStart = localInput(blackoutStart);
  const bookingEnd = localInput(blackoutEnd);

  response = await request(`/researcher/resources?startsAt=${encodeURIComponent(bookingStart)}&endsAt=${encodeURIComponent(bookingEnd)}`);
  assertStatus(response.status, [200], 'researcher resources blackout window', response.text);
  const blackoutVisible = response.text.includes('BLACKOUT');
  console.log('blackout status visible:', blackoutVisible);
  if (!blackoutVisible) {
    throw new Error('researcher resources page did not show blackout state');
  }

  const availableStart = new Date(blackoutStart);
  availableStart.setHours(12, 0, 0, 0);
  const availableEnd = new Date(availableStart);
  availableEnd.setHours(13, 0, 0, 0);

  response = await request('/researcher/resources?/createBooking', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      resourceId,
      startsAt: localInput(availableStart),
      endsAt: localInput(availableEnd),
      seatsRequested: '1'
    })
  });
  console.log('create booking action:', response.status);
  assertStatus(response.status, [200, 303], 'create booking', response.text);
  if (response.status === 200 && !response.text.includes('"type":"success"')) {
    throw new Error('create booking action did not return success action payload');
  }

  response = await request('/researcher/resources?/createBooking', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({
      resourceId,
      startsAt: localInput(availableStart),
      endsAt: localInput(availableEnd),
      seatsRequested: '1'
    })
  });
  console.log('duplicate booking action:', response.status);
  assertStatus(response.status, [200], 'duplicate booking rejection action', response.text);

  const isFailureAction = response.text.includes('"type":"failure"') && response.text.includes('"status":409');
  if (!isFailureAction) {
    throw new Error('duplicate booking action did not report 409 failure payload');
  }

  const capacityMessageVisible =
    response.text.includes('remaining capacity') ||
    response.text.includes('Booking conflict detected') ||
    response.text.includes('just now');
  console.log('capacity/conflict message visible:', capacityMessageVisible);
  if (!capacityMessageVisible) {
    throw new Error('expected capacity/conflict feedback was not visible after duplicate booking attempt');
  }

  console.log('UI resource booking scenario verification passed');
};

await main();
