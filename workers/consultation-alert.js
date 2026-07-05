export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://www.careerservice.co.kr',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'method_not_allowed' }, 405, corsHeaders);
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

    const required = ['serviceType', 'name', 'phone', 'email', 'message'];
    for (const field of required) {
      if (!clean(payload[field])) {
        return json({ ok: false, error: `missing_${field}` }, 400, corsHeaders);
      }
    }

    if (!payload.privacyConsent) {
      return json({ ok: false, error: 'privacy_required' }, 400, corsHeaders);
    }

    if (clean(payload.message).length < 10) {
      return json({ ok: false, error: 'message_too_short' }, 400, corsHeaders);
    }

    const text = buildTelegramMessage(payload);
    const result = await sendTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text);

    if (!result.ok) {
      return json({ ok: false, error: 'telegram_send_failed' }, 502, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);
  },
};

function clean(value) {
  return String(value || '').trim().slice(0, 1200);
}

function labelService(value) {
  return {
    business: '기업컨설팅',
    career: '커리어플래닝서비스',
    general: '기타 문의',
  }[value] || '기타 문의';
}

function buildTelegramMessage(data) {
  const serviceType = clean(data.serviceType);
  const lines = [
    '[재취업지원서비스 상담신청]',
    '',
    `상담유형: ${labelService(serviceType)}`,
    `성명/담당자: ${clean(data.name)}`,
    `기업명: ${clean(data.company) || '미입력'}`,
    `연락처: ${clean(data.phone)}`,
    `이메일: ${clean(data.email)}`,
  ];

  if (serviceType === 'business') {
    lines.push(
      '',
      `기업 규모: ${clean(data.employeeSize) || '미입력'}`,
      `기존 운영 여부: ${clean(data.existingService) || '미입력'}`,
      `재단 컨설팅 신청 여부: ${clean(data.foundationStatus) || '미입력'}`,
      `퇴직예정자/50세 이상 관련 문의: ${clean(data.olderWorkerInquiry) || '미입력'}`,
      '자동분류: 기업컨설팅 사전확인 필요'
    );
  }

  if (serviceType === 'career') {
    lines.push(
      '',
      `신청 구분: ${clean(data.applicationType) || '미입력'}`,
      `재직 여부: ${clean(data.employmentStatus) || '미입력'}`,
      `희망 상담: ${clean(data.careerInterest) || '미입력'}`,
      `희망 일정: ${clean(data.preferredSchedule) || '미입력'}`,
      '자동분류: 커리어플래닝서비스 사전확인 필요'
    );
  }

  lines.push(
    '',
    '상담 희망 내용:',
    clean(data.message),
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

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
