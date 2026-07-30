import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const previewPort = process.env.CONTACT_FORM_CHECK_PORT || '4337';
const baseUrl = process.env.CONTACT_FORM_CHECK_BASE_URL || `http://127.0.0.1:${previewPort}`;
const workerUrl = 'https://kjobs-consultation-alert.kjobs-alert.workers.dev/';

function startPreview() {
  const child = spawn('./node_modules/.bin/astro', ['preview', '--host', '127.0.0.1', '--port', previewPort], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1000);
    try {
      const response = await fetch(`${baseUrl}/contact/`, { method: 'HEAD', signal: controller.signal });
      if (response.ok || response.status < 500) return;
    } catch {
      // Retry until the preview server is ready.
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Preview server did not become ready: ${baseUrl}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fillValidForm(page, overrides = {}) {
  const values = {
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'qa@example.com',
    message: '상담 가능 일정과 준비 자료를 안내받고 싶습니다.',
    consent: true,
    ...overrides,
  };

  await page.locator('[name="name"]').fill(values.name);
  await page.locator('[name="phone"]').fill(values.phone);
  await page.locator('[name="email"]').fill(values.email);
  await page.locator('[name="message"]').fill(values.message);
  if (values.consent) await page.locator('[name="privacyConsent"]').check();
}

async function submitCase(page, name, overrides, expectedStatus) {
  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'domcontentloaded' });
  await fillValidForm(page, overrides);
  let workerRequests = 0;
  const countRequest = (request) => {
    if (request.url() === workerUrl) workerRequests += 1;
  };
  page.on('request', countRequest);
  await page.locator('#consultationForm').evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(150);
  const status = await page.locator('#formStatus').textContent();
  page.off('request', countRequest);
  assert(workerRequests === 0, `${name}: expected no Worker request, got ${workerRequests}`);
  assert(status?.includes(expectedStatus), `${name}: unexpected status: ${status}`);
  console.log(`PASS ${name}`);
}

const preview = process.env.CONTACT_FORM_CHECK_BASE_URL ? null : startPreview();
let browser;
try {
  await waitForServer();
  console.log(`Preview server ready: ${baseUrl}`);
  browser = await chromium.launch({ timeout: 15000 });
  const page = await browser.newPage();

  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'domcontentloaded' });
  const maxlengthContract = {
    name: 50,
    company: 80,
    phone: 30,
    email: 120,
    preferredSchedule: 80,
    message: 1000,
  };
  for (const [field, expected] of Object.entries(maxlengthContract)) {
    const actual = await page.locator(`[name="${field}"]`).getAttribute('maxlength');
    assert(Number(actual) === expected, `${field}: expected maxlength ${expected}, got ${actual}`);
  }
  console.log('PASS rendered maxlength contract matches Worker FIELD_LIMITS');

  await submitCase(page, 'invalid phone', { phone: 'abc' }, '숫자 9~11자리');
  await page.locator('[name="phone"]').fill('010-1234-5678');
  const editedPhoneValidation = await page.locator('[name="phone"]').evaluate((input) => input.validationMessage);
  assert(editedPhoneValidation === '', `invalid phone: stale custom validity remained after edit: ${editedPhoneValidation}`);
  console.log('PASS phone custom validity clears on edit');
  await submitCase(page, 'invalid email', { email: 'invalid-email' }, '필수 항목과 개인정보 동의를 확인해 주세요.');
  await submitCase(page, 'required field omitted', { name: '' }, '필수 항목과 개인정보 동의를 확인해 주세요.');
  await submitCase(page, 'consent omitted', { consent: false }, '필수 항목과 개인정보 동의를 확인해 주세요.');

  await page.goto(`${baseUrl}/contact/`, { waitUntil: 'domcontentloaded' });
  await fillValidForm(page, { phone: '(02) 797-5659' });
  let validWorkerRequests = 0;
  await page.route(workerUrl, async (route) => {
    validWorkerRequests += 1;
    await route.abort('failed');
  });
  await page.locator('#consultationForm').evaluate((form) => form.requestSubmit());
  await page.locator('#formStatus').filter({ hasText: '이메일 작성 화면' }).waitFor({ timeout: 5000 });
  const fallbackStatus = await page.locator('#formStatus').textContent();
  assert(validWorkerRequests === 1, `valid submission: expected one intercepted Worker request, got ${validWorkerRequests}`);
  assert(!fallbackStatus?.includes('전송되었습니다'), `valid submission: false success status shown: ${fallbackStatus}`);
  console.log('PASS valid data uses failure fallback when Worker request is aborted');
  console.log('Contact form check passed: invalid submissions blocked and fallback preserved without external submission');
} finally {
  if (browser) await browser.close();
  if (preview) preview.kill('SIGKILL');
}

process.exit(process.exitCode ?? 0);
