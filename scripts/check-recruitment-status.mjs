import assert from 'node:assert/strict';
import { recruitmentState } from '../src/data/recruitmentStatus.js';

const checks = [
  ['2026-08-31T14:59:59.999Z', 'upcoming'],
  ['2026-08-31T15:00:00.000Z', 'current'],
  ['2026-09-07T08:00:00.000Z', 'current'],
  ['2026-09-22T14:59:59.999Z', 'current'],
  ['2026-09-22T15:00:00.000Z', 'closed'],
  ['2027-01-01T00:00:00.000Z', 'closed'],
];
for (const [time, expected] of checks) {
  assert.equal(recruitmentState('2026-09-01', '2026-09-22', new Date(time)).className, expected, time);
}
assert.equal(recruitmentState('2026-07-27', '2026-08-31', new Date('2026-09-07T00:00:00+09:00')).className, 'closed');
assert.equal(recruitmentState('bad', '2026-09-22').label, '신청기간 확인');
assert.equal(recruitmentState('2026-09-23', '2026-09-22').label, '신청기간 확인');
assert.equal(recruitmentState('2026-09-01', '2026-09-22', new Date('bad')).label, '신청기간 확인');
console.log('Recruitment KST status passed: 10 boundary/fallback cases');
