const FIELD_LIMITS = {
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

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://www.careerservice.co.kr';
    const origin = request.headers.get('Origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      if (origin !== allowedOrigin) return json({ ok: false, error: 'origin_not_allowed' }, 403, corsHeaders);
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
    }

    if (origin !== allowedOrigin) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403, corsHeaders);
    }

    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 8000) {
      return json({ ok: false, error: 'payload_too_large' }, 413, corsHeaders);
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400, corsHeaders);
    }

    if (payload.website) {
      return json({ ok: true, skipped: true }, 200, corsHeaders);
    }

    payload = sanitizePayload(payload);

    const required = ['serviceType', 'name', 'phone', 'email', 'message'];
    for (const field of required) {
      if (!payload[field]) {
        return json({ ok: false, error: `missing_${field}` }, 400, corsHeaders);
      }
    }

    if (!payload.privacyConsent) {
      return json({ ok: false, error: 'privacy_required' }, 400, corsHeaders);
    }

    if (payload.message.length < 10) {
      return json({ ok: false, error: 'message_too_short' }, 400, corsHeaders);
    }

    if (!isReasonableEmail(payload.email)) {
      return json({ ok: false, error: 'invalid_email' }, 400, corsHeaders);
    }

    const rate = await checkRateLimit(request, env);
    if (!rate.ok) {
      return json({ ok: false, error: 'rate_limited' }, 429, {
        ...corsHeaders,
        'Retry-After': String(rate.retryAfter),
      });
    }

    const text = buildTelegramMessage(payload);
    const result = await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);

    if (!result.ok) {
      return json({ ok: false, error: 'telegram_send_failed' }, 502, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  },
};

function sanitizePayload(raw) {
  const payload = {};
  for (const [key, max] of Object.entries(FIELD_LIMITS)) {
    payload[key] = clean(raw[key], max);
  }
  payload.privacyConsent = raw.privacyConsent === true || raw.privacyConsent === 'true' || raw.privacyConsent === 'on';
  return payload;
}

function clean(value, max = 1200) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function isReasonableEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= FIELD_LIMITS.email;
}

async function checkRateLimit(request, env) {
  if (!env.RATE_LIMIT) return { ok: true };

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const windowSeconds = Number(env.RATE_LIMIT_WINDOW_SECONDS || 600);
  const maxRequests = Number(env.RATE_LIMIT_MAX_REQUESTS || 3);
  const now = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(now / windowSeconds);
  const key = `consult:${await sha256(`${ip}:${bucket}`)}`;
  const current = Number((await env.RATE_LIMIT.get(key)) || 0);

  if (current >= maxRequests) {
    const retryAfter = windowSeconds - (now % windowSeconds);
    return { ok: false, retryAfter };
  }

  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
  return { ok: true };
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function labelService(value) {
  return {
    business: '기업컨설팅',
    career: '커리어플래닝서비스',
    general: '기타 문의',
  }[value] || '기타 문의';
}

function buildTelegramMessage(data) {
  const serviceType = data.serviceType;
  const lines = [
    '[재취업지원서비스 상담신청]',
    '',
    `상담유형: ${labelService(serviceType)}`,
    `성명/담당자: ${data.name}`,
    `기업명: ${data.company || '미입력'}`,
    `연락처: ${data.phone}`,
    `이메일: ${data.email}`,
  ];

  if (serviceType === 'business') {
    lines.push(
      '',
      `기업 규모: ${data.employeeSize || '미입력'}`,
      `기존 운영 여부: ${data.existingService || '미입력'}`,
      `재단 컨설팅 신청 여부: ${data.foundationStatus || '미입력'}`,
      `퇴직예정자/50세 이상 관련 문의: ${data.olderWorkerInquiry || '미입력'}`,
      '자동분류: 기업컨설팅 사전확인 필요'
    );
  }

  if (serviceType === 'career') {
    lines.push(
      '',
      `신청 구분: ${data.applicationType || '미입력'}`,
      `재직 여부: ${data.employmentStatus || '미입력'}`,
      `희망 상담: ${data.careerInterest || '미입력'}`,
      `희망 일정: ${data.preferredSchedule || '미입력'}`,
      '자동분류: 커리어플래닝서비스 사전확인 필요'
    );
  }

  lines.push(
    '',
    '상담 희망 내용:',
    data.message,
    '',
    '개인정보 동의: 동의함',
    `접수시각: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    '',
    '주의: 주민등록번호·민감정보·내부 인사자료는 접수하지 않도록 안내된 문의입니다.'
  );

  return lines.join('\n').slice(0, 3900);
}

async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return { ok: false };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return response.json();
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}
