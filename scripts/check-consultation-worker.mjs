import worker from '../workers/consultation-alert.js';

const allowedOrigin = 'https://www.careerservice.co.kr';
const validPayload = {
  serviceType: 'business',
  name: '홍길동',
  company: '케이잡스',
  phone: '010-1234-5678',
  email: 'qa@example.com',
  employeeSize: '100명 미만',
  existingService: '준비 중',
  foundationStatus: '신청 예정',
  olderWorkerInquiry: '없음',
  applicationType: '',
  employmentStatus: '',
  careerInterest: '',
  preferredSchedule: '평일 오후',
  message: '상담 가능 일정과 준비 자료를 안내받고 싶습니다.',
  privacyConsent: true,
};

const fieldLimits = {
  serviceType: 24,
  name: 50,
  company: 80,
  phone: 30,
  email: 120,
  employeeSize: 30,
  existingService: 40,
  foundationStatus: 40,
  olderWorkerInquiry: 30,
  applicationType: 40,
  employmentStatus: 40,
  careerInterest: 40,
  preferredSchedule: 80,
  message: 1000,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let telegramFetches = 0;
let telegramReply = { ok: true };
let telegramThrows = false;
globalThis.fetch = async (url, options) => {
  assert(String(url).startsWith('https://api.telegram.org/bot'), `unexpected external URL: ${url}`);
  assert(options?.method === 'POST', 'Telegram fetch must use POST');
  telegramFetches += 1;
  if (telegramThrows) throw new Error('mocked network failure');
  return new Response(JSON.stringify(telegramReply), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

function makeRequest({ payload = validPayload, origin = allowedOrigin, contentType = 'application/json', rawBody, headers = {} } = {}) {
  const requestHeaders = { Origin: origin, ...headers };
  if (contentType !== null) requestHeaders['Content-Type'] = contentType;
  return new Request('https://worker.test/', {
    method: 'POST',
    headers: requestHeaders,
    body: rawBody ?? JSON.stringify(payload),
  });
}

function rejectingRateLimit(name) {
  return {
    async get() { throw new Error(`${name}: validation reached rate limiting`); },
    async put() { throw new Error(`${name}: validation reached rate limiting`); },
  };
}

async function expectCase(name, request, expectedStatus, expectedError, expectedField) {
  const fetchesBefore = telegramFetches;
  const response = await worker.fetch(request, {
    ALLOWED_ORIGIN: allowedOrigin,
    RATE_LIMIT: rejectingRateLimit(name),
  });
  const body = await response.json();
  assert(response.status === expectedStatus, `${name}: expected ${expectedStatus}, got ${response.status}`);
  assert(body.error === expectedError, `${name}: expected ${expectedError}, got ${body.error}`);
  if (expectedField) assert(body.field === expectedField, `${name}: expected field ${expectedField}, got ${body.field}`);
  assert(!JSON.stringify(body).includes('x'.repeat(20)), `${name}: response exposed submitted value`);
  assert(telegramFetches === fetchesBefore, `${name}: Telegram fetch must not run`);
  assert(response.headers.get('Cache-Control') === 'no-store', `${name}: missing no-store`);
  assert(response.headers.get('X-Content-Type-Options') === 'nosniff', `${name}: missing nosniff`);
  console.log(`PASS ${name}`);
}

await expectCase('invalid phone', makeRequest({ payload: { ...validPayload, phone: 'abc-123' } }), 400, 'invalid_phone');
await expectCase('invalid Origin', makeRequest({ origin: 'https://evil.example' }), 403, 'origin_not_allowed');
await expectCase('invalid email', makeRequest({ payload: { ...validPayload, email: 'invalid-email' } }), 400, 'invalid_email');
await expectCase('missing privacy consent', makeRequest({ payload: { ...validPayload, privacyConsent: false } }), 400, 'privacy_required');
await expectCase('invalid content type', makeRequest({ contentType: 'text/plain' }), 415, 'invalid_content_type');
await expectCase('invalid service type', makeRequest({ payload: { ...validPayload, serviceType: 'unknown' } }), 400, 'invalid_service_type');
await expectCase('overlong raw body without Content-Length', makeRequest({ rawBody: JSON.stringify({ ...validPayload, padding: 'x'.repeat(8100) }) }), 413, 'payload_too_large');
await expectCase('declared overlong payload', makeRequest({ headers: { 'Content-Length': '8001' } }), 413, 'payload_too_large');
await expectCase('invalid JSON', makeRequest({ rawBody: '{broken' }), 400, 'invalid_json');
await expectCase('non-object JSON', makeRequest({ rawBody: 'null' }), 400, 'invalid_json');

for (const [field, limit] of Object.entries(fieldLimits)) {
  await expectCase(
    `overlong ${field}`,
    makeRequest({ payload: { ...validPayload, [field]: 'x'.repeat(limit + 1) } }),
    400,
    'field_too_long',
    field,
  );
}

const optionsResponse = await worker.fetch(new Request('https://worker.test/', {
  method: 'OPTIONS',
  headers: { Origin: allowedOrigin },
}), { ALLOWED_ORIGIN: allowedOrigin });
assert(optionsResponse.status === 204, `OPTIONS: expected 204, got ${optionsResponse.status}`);
assert(optionsResponse.headers.get('Access-Control-Allow-Origin') === allowedOrigin, 'OPTIONS: missing allowed CORS origin');
console.log('PASS allowed OPTIONS preflight');

const originalDateNow = Date.now;
Date.now = () => 1_700_000_000_000;
try {
  const kvWrites = [];
  const successEnv = {
    ALLOWED_ORIGIN: allowedOrigin,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: 'test-chat',
    RATE_LIMIT_WINDOW_SECONDS: '600',
    RATE_LIMIT_MAX_REQUESTS: '3',
    RATE_LIMIT: {
      async get() { return '1'; },
      async put(...args) { kvWrites.push(args); },
    },
  };
  const fetchesBeforeSuccess = telegramFetches;
  telegramReply = { ok: true };
  const successResponse = await worker.fetch(makeRequest({ headers: { 'CF-Connecting-IP': '192.0.2.1' } }), successEnv);
  assert(successResponse.status === 200, `valid Telegram path: expected 200, got ${successResponse.status}`);
  assert((await successResponse.json()).ok === true, 'valid Telegram path: expected ok true');
  assert(telegramFetches === fetchesBeforeSuccess + 1, 'valid Telegram path: expected exactly one mocked Telegram fetch');
  assert(kvWrites.length === 1, `normal throttle increment: expected one KV write, got ${kvWrites.length}`);
  assert(kvWrites[0][1] === '2', `normal throttle increment: expected counter 2, got ${kvWrites[0][1]}`);
  assert(kvWrites[0][2]?.expirationTtl === 660, 'normal throttle increment: unexpected TTL');
  console.log('PASS valid Telegram path and normal best-effort KV increment');

  const fetchesBeforeFailure = telegramFetches;
  telegramReply = { ok: false, description: 'mocked failure' };
  const failureResponse = await worker.fetch(makeRequest(), {
    ALLOWED_ORIGIN: allowedOrigin,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: 'test-chat',
  });
  assert(failureResponse.status === 502, `Telegram failure: expected 502, got ${failureResponse.status}`);
  assert((await failureResponse.json()).error === 'delivery_failed', 'Telegram failure: wrong error');
  assert(failureResponse.headers.get('X-Request-ID'), 'Telegram failure: missing request id');
  assert(telegramFetches === fetchesBeforeFailure + 1, 'Telegram failure: expected exactly one mocked fetch');
  console.log('PASS mocked Telegram API failure returns 502');

  const fetchesBeforeNetworkFailure = telegramFetches;
  telegramThrows = true;
  const networkFailureResponse = await worker.fetch(makeRequest(), {
    ALLOWED_ORIGIN: allowedOrigin,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: 'test-chat',
  });
  telegramThrows = false;
  assert(networkFailureResponse.status === 502, `Telegram network failure: expected 502, got ${networkFailureResponse.status}`);
  assert((await networkFailureResponse.json()).error === 'delivery_failed', 'Telegram network failure: wrong error');
  assert(networkFailureResponse.headers.get('X-Request-ID'), 'Telegram network failure: missing request id');
  assert(telegramFetches === fetchesBeforeNetworkFailure + 1, 'Telegram network failure: expected exactly one mocked fetch');
  console.log('PASS mocked Telegram network failure returns safe 502');

  let limitedPuts = 0;
  const fetchesBeforeLimit = telegramFetches;
  const limitedResponse = await worker.fetch(makeRequest(), {
    ALLOWED_ORIGIN: allowedOrigin,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: 'test-chat',
    RATE_LIMIT_WINDOW_SECONDS: '600',
    RATE_LIMIT_MAX_REQUESTS: '3',
    RATE_LIMIT: {
      async get() { return '3'; },
      async put() { limitedPuts += 1; },
    },
  });
  assert(limitedResponse.status === 429, `rate limited: expected 429, got ${limitedResponse.status}`);
  assert(limitedResponse.headers.get('Retry-After') === '400', `rate limited: unexpected Retry-After ${limitedResponse.headers.get('Retry-After')}`);
  assert((await limitedResponse.json()).error === 'rate_limited', 'rate limited: wrong error');
  assert(limitedPuts === 0, 'rate limited: KV counter must not be written');
  assert(telegramFetches === fetchesBeforeLimit, 'rate limited: Telegram fetch must not run');
  console.log('PASS already-limited best-effort KV branch returns deterministic 429');
} finally {
  Date.now = originalDateNow;
}

console.log(`Consultation Worker check passed with ${telegramFetches} mocked Telegram fetches and zero real network requests`);
