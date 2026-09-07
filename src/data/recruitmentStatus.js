export function recruitmentState(startDate, endDate, now = new Date()) {
  const start = Date.parse(`${startDate}T00:00:00+09:00`);
  const endExclusive = Date.parse(`${endDate}T00:00:00+09:00`) + 86400000;
  const time = now.getTime();
  if (![start, endExclusive, time].every(Number.isFinite) || start >= endExclusive) {
    return { className: 'upcoming', label: '신청기간 확인' };
  }
  if (time < start) return { className: 'upcoming', label: '접수 예정' };
  if (time >= endExclusive) return { className: 'closed', label: '접수 종료' };
  return { className: 'current', label: '접수기간 중 · 공식 공고 확인' };
}
