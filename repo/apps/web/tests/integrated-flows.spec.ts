import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'AdminPass1!';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://api:3000/api/v1';
const runId = Date.now().toString(36);

let policyTitle = `Playwright policy ${runId}`;
let applicationTitle = `Playwright application ${runId}`;
let resourceName = `Playwright room ${runId}`;
let invoiceDescription = `Playwright finance invoice ${runId}`;
let paymentReference = `wx-${runId}-1`;

const pad = (value: number): string => String(value).padStart(2, '0');

const toDateInput = (date: Date): string => {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toDateTimeLocalInput = (date: Date): string => {
  return `${toDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const nextWeekdayAt = (hour: number, minute = 0): Date => {
  const candidate = new Date();
  candidate.setSeconds(0, 0);

  for (let offset = 1; offset <= 14; offset += 1) {
    const day = addDays(candidate, offset);
    const dayOfWeek = day.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    day.setHours(hour, minute, 0, 0);
    return day;
  }

  throw new Error('Unable to compute next weekday date');
};

const readRuntimeValue = (fileName: string): string | null => {
  try {
    return readFileSync(path.join(repoRoot, '.runtime', fileName), 'utf-8').trim();
  } catch {
    return null;
  }
};

const grantRoles = async (username: string, roles: string[]): Promise<void> => {
  const host = process.env.PGHOST ?? process.env.RRGA_DB_HOST ?? readRuntimeValue('db_host') ?? 'db';
  const portRaw = process.env.PGPORT ?? process.env.RRGA_DB_PORT ?? readRuntimeValue('db_port') ?? '5432';
  const user = process.env.PGUSER ?? process.env.RRGA_DB_USER ?? readRuntimeValue('db_user');
  const password = process.env.PGPASSWORD ?? process.env.RRGA_DB_PASSWORD ?? readRuntimeValue('db_password');
  const database = process.env.PGDATABASE ?? process.env.RRGA_DB_NAME ?? readRuntimeValue('db_name');

  if (!user || !password || !database) {
    throw new Error('Missing DB runtime credentials for role seeding (PGUSER/PGPASSWORD/PGDATABASE).');
  }

  const port = Number(portRaw);
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid DB port for role seeding: ${portRaw}`);
  }

  const client = new Client({
    host,
    port,
    user,
    password,
    database
  });

  await client.connect();
  try {
    await client.query(
      `
        INSERT INTO user_roles(user_id, role_id)
        SELECT u.id, r.id
        FROM users u
        JOIN roles r ON r.code = ANY($2::text[])
        WHERE u.username = $1
        ON CONFLICT DO NOTHING;
      `,
      [username, roles]
    );
  } finally {
    await client.end();
  }
};

const signIn = async (page: Page): Promise<void> => {
  await page.goto('/login');
  await page.getByLabel('Username').fill(ADMIN_USERNAME);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Signed in as')).toBeVisible();
};

const signOut = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
};

const checkpoint = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
};

test.describe.serial('Integrated fullstack flows', () => {
  test.beforeAll(async () => {
    const response = await fetch(`${apiBaseUrl}/auth/bootstrap-admin`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
    });

    expect([201, 409]).toContain(response.status);
    await grantRoles(ADMIN_USERNAME, ['researcher', 'reviewer', 'approver', 'resource_manager', 'finance_clerk']);
  });

  test('researcher submission flow', async ({ page }, testInfo) => {
    await signIn(page);

    const now = new Date();
    await page.goto('/admin');
    await page.getByLabel('Title').fill(policyTitle);
    await page.getByLabel('Description').fill('Policy created from integrated Playwright coverage');
    await page.getByLabel('Policy period start').fill(toDateInput(addDays(now, -2)));
    await page.getByLabel('Policy period end').fill(toDateInput(addDays(now, 90)));
    await page.getByLabel('Submission deadline (local)').fill(toDateTimeLocalInput(addDays(now, 2)));
    await page.getByLabel('Grace hours').fill('24');
    await page.getByLabel('Annual cap amount').fill('999999');
    await page.getByLabel('Approval levels required').fill('1');
    await page.getByLabel('Required templates (one label per line)').fill('Budget Sheet');
    await page.getByRole('button', { name: 'Create policy' }).click();
    await expect(page.getByText(policyTitle)).toBeVisible();

    await page.goto('/researcher');
    const policyOptionValue = await page
      .locator('select[name="policyId"] option', { hasText: policyTitle })
      .first()
      .getAttribute('value');
    if (!policyOptionValue) {
      throw new Error(`Unable to locate created policy option: ${policyTitle}`);
    }
    await page.getByLabel('Funding policy').selectOption(policyOptionValue);
    await page.getByLabel('Application title').fill(applicationTitle);
    await page.getByLabel('Requested amount').fill('1200');
    await page.getByLabel('Summary').fill('Integrated submission path via Playwright.');
    await page.getByRole('button', { name: 'Create draft' }).click();

    const appRow = page.locator('li', { hasText: applicationTitle }).first();
    await expect(appRow).toContainText('DRAFT');
    await appRow.getByRole('link', { name: 'Open details' }).click();
    await expect(page).toHaveURL(/\/researcher\/applications\//);

    await page.getByRole('heading', { name: 'Add link version' }).locator('..').getByLabel('Document key').fill('template_1');
    await page.getByRole('heading', { name: 'Add link version' }).locator('..').getByLabel('Label').fill('Budget Link');
    await page
      .getByRole('heading', { name: 'Add link version' })
      .locator('..')
      .getByLabel('External URL')
      .fill(`https://example.com/budget/${runId}`);
    await page.getByRole('button', { name: 'Add link version' }).click();
    await expect(page.getByText(`https://example.com/budget/${runId}`)).toBeVisible();

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText(/Status:\s*(SUBMITTED_ON_TIME|SUBMITTED_LATE)/)).toBeVisible();
    await checkpoint(page, testInfo, '01-researcher-submitted');

    await signOut(page);
  });

  test('review and approval flow', async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto('/reviewer');
    const reviewerRow = page.locator('li', { hasText: applicationTitle }).first();
    await expect(reviewerRow).toBeVisible();
    await reviewerRow.getByRole('link', { name: 'Open reviewer detail' }).click();
    await page.getByLabel('Decision').selectOption('forward_to_approval');
    await page.getByLabel('Required comment').fill('Eligibility checks complete. Forwarding to approver.');
    await page.getByRole('button', { name: 'Record reviewer decision' }).click();
    await expect(page.getByText('Reviewer decision saved.')).toBeVisible();

    await page.goto('/approver');
    const approverRow = page.locator('li', { hasText: applicationTitle }).first();
    await expect(approverRow).toBeVisible();
    await approverRow.getByRole('link', { name: 'Open approver detail' }).click();
    await page.getByLabel('Decision').selectOption('approve');
    await page.getByLabel('Required comment').fill('Approved for funding.');
    await page.getByRole('button', { name: 'Record sign-off' }).click();
    await expect(page.getByText('Application not available for approver sign-off.')).toBeVisible();

    await page.goto('/researcher');
    const approvedRow = page.locator('li', { hasText: applicationTitle }).first();
    await expect(approvedRow).toContainText('APPROVED');
    await checkpoint(page, testInfo, '02-review-approval-complete');

    await signOut(page);
  });

  test('resource booking flow', async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto('/manager');
    await page.getByLabel('Resource type').selectOption('ROOM');
    await page.getByLabel('Name').fill(resourceName);
    await page.getByLabel('Description').fill('Playwright-created managed room');
    await page.getByLabel('Location').fill('Building A · Room 302');
    await page.getByLabel('Capacity').fill('2');
    await page.getByLabel('Timezone').fill('UTC');
    await page.getByRole('button', { name: 'Create resource' }).click();

    const resourceRow = page.locator('li', { hasText: resourceName }).first();
    await expect(resourceRow).toBeVisible();
    await resourceRow.getByRole('link', { name: 'Open settings' }).click();

    const fullWeekHours = ['1 00:00 23:59', '2 00:00 23:59', '3 00:00 23:59', '4 00:00 23:59', '5 00:00 23:59', '6 00:00 23:59', '7 00:00 23:59'].join('\n');
    await page.locator('form[action="?/setBusinessHours"] textarea[name="hours"]').fill(fullWeekHours);
    await page.getByRole('button', { name: 'Update business hours' }).click();

    const blackoutStart = nextWeekdayAt(12, 0);
    const blackoutEnd = addDays(blackoutStart, 0);
    blackoutEnd.setHours(13, 0, 0, 0);
    await page.getByLabel('Starts at').fill(toDateTimeLocalInput(blackoutStart));
    await page.getByLabel('Ends at').fill(toDateTimeLocalInput(blackoutEnd));
    await page.getByLabel('Reason').fill('Preventive maintenance window');
    await page.getByRole('button', { name: 'Create blackout' }).click();
    await expect(page.getByText('Preventive maintenance window')).toBeVisible();

    await page.goto('/researcher/resources');
    const bookingStart = nextWeekdayAt(9, 0);
    const bookingEnd = addDays(bookingStart, 0);
    bookingEnd.setHours(10, 0, 0, 0);
    await page.getByLabel('Starts at').fill(toDateTimeLocalInput(bookingStart));
    await page.getByLabel('Ends at').fill(toDateTimeLocalInput(bookingEnd));
    await page.getByRole('button', { name: 'Refresh availability' }).click();

    const availabilityRow = page.locator('li', { hasText: resourceName }).first();
    await expect(availabilityRow).toBeVisible();
    await availabilityRow.getByLabel('Seats requested').fill('1');
    await availabilityRow.getByRole('button', { name: 'Book this slot' }).click();

    const bookingPanel = page.locator('article', { hasText: 'Your bookings' });
    await expect(bookingPanel).toContainText(resourceName);
    await checkpoint(page, testInfo, '03-resource-booking-complete');

    await signOut(page);
  });

  test('recommendations flow', async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto('/researcher/recommendations');
    await page.getByLabel('Preferred disciplines (one per line)').fill('Biomedical Engineering');
    await page.getByLabel('Preferred keywords (one per line)').fill('machine learning\nresource optimization');
    await page.getByLabel('Preferred publishers (one per line)').fill('Springer');
    await page.getByLabel('Preferred locations (one per line)').fill('Building A');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Preferences saved.')).toBeVisible();

    const firstRecommendation = page.locator('ul.recommendation-list > li').first();
    await expect(firstRecommendation).toBeVisible();
    const targetType = await firstRecommendation.getAttribute('data-target-type');
    const targetId = await firstRecommendation.getAttribute('data-target-id');
    if (!targetType || !targetId) {
      throw new Error('First recommendation row is missing target identity attributes.');
    }

    const targetRecommendation = page.locator(
      `ul.recommendation-list > li[data-target-type="${targetType}"][data-target-id="${targetId}"]`
    );

    const feedbackOptions: Array<{ label: 'Like' | 'Not interested' | 'Block'; expected: 'LIKE' | 'NOT_INTERESTED' | 'BLOCK' }> = [
      { label: 'Like', expected: 'LIKE' },
      { label: 'Not interested', expected: 'NOT_INTERESTED' },
      { label: 'Block', expected: 'BLOCK' }
    ];

    let feedbackApplied = false;
    for (const option of feedbackOptions) {
      const button = targetRecommendation.getByRole('button', { name: option.label });
      if (await button.isDisabled()) {
        continue;
      }

      await button.click();
      await expect(targetRecommendation.getByText(`Current feedback: ${option.expected}`)).toBeVisible();
      feedbackApplied = true;
      break;
    }

    if (!feedbackApplied) {
      throw new Error('No enabled recommendation feedback action was available in first recommendation row.');
    }
    await checkpoint(page, testInfo, '04-recommendations-feedback');

    await signOut(page);
  });

  test('finance flow', async ({ page }, testInfo) => {
    await signIn(page);

    await page.goto('/finance');
    await page.getByLabel('Service type').selectOption('OTHER');
    await page.getByLabel('Description').fill(invoiceDescription);
    await page.getByLabel('Total amount (CNY)').fill('160.00');
    await page.getByRole('button', { name: 'Issue invoice' }).click();
    await expect(page.getByText('Invoice issued.')).toBeVisible();

    const invoiceRow = page.locator('li', { hasText: invoiceDescription }).first();
    await expect(invoiceRow).toBeVisible();
    await invoiceRow.getByRole('link', { name: 'Open invoice detail' }).click();
    await expect(page).toHaveURL(/\/finance\/invoices\//);

    await page.getByLabel('Amount (CNY)').first().fill('160.00');
    await page.getByLabel('WeChat transaction reference').fill(paymentReference);
    await page.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(paymentReference)).toBeVisible();

    await page.getByLabel('Amount (CNY)').nth(1).fill('30.00');
    await page.getByLabel('Reason').fill('Partial reconciliation adjustment');
    await page.getByLabel('WeChat refund reference').fill(`wx-refund-${runId}`);
    await page.getByRole('button', { name: 'Record refund' }).click();
    await expect(page.getByRole('heading', { name: 'Refunds' }).locator('..')).toContainText('WECHAT_OFFLINE');
    await checkpoint(page, testInfo, '05-finance-invoice-detail');

    const settlementCsv = [
      'wechatTransactionRef,amount,settledAt',
      `${paymentReference},150.00,2026-04-05T10:00:00.000Z`,
      `wx-missing-${runId},20.00,2026-04-05T10:01:00.000Z`
    ].join('\n');

    await page.goto('/finance');
    await page.getByLabel('Source label').fill(`settlement-${runId}.csv`);
    await page.getByLabel('CSV content').fill(settlementCsv);
    await page.getByRole('button', { name: 'Import settlement CSV' }).click();
    await expect(page.getByText('Settlement import complete.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Settlement exceptions' }).locator('..')).toContainText(
      /Amount mismatch|Unmatched reference/
    );
    await checkpoint(page, testInfo, '06-finance-reconciliation-queue');

    await signOut(page);
  });
});
