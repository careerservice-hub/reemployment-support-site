import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { careerPlanningEligibilityAnswer, serviceCostAnswer } from '../src/data/serviceFacts.js';

for (const file of ['index.html', 'career-planning/index.html', 'faq/index.html']) {
  const html = await readFile(`dist/${file}`, 'utf8');
  assert(html.includes(careerPlanningEligibilityAnswer), `${file}: eligibility wording diverged`);
}
const faq = await readFile('dist/faq/index.html', 'utf8');
assert(faq.includes(serviceCostAnswer), 'FAQ cost answer missing');
const plainFaq = faq.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const jsonLd = JSON.parse(faq.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const faqNode = jsonLd.find(node => node['@type'] === 'FAQPage');
assert.equal(faqNode.mainEntity.length, (faq.match(/<details\b[^>]*data-faq-item/g) || []).length, 'FAQ schema and visible item counts diverged');
for (const question of faqNode.mainEntity) {
  assert(plainFaq.includes(question.name), `FAQ question missing: ${question.name}`);
  assert(plainFaq.includes(question.acceptedAnswer.text), `FAQ answer missing: ${question.name}`);
}
const business = await readFile('dist/business-consulting/index.html', 'utf8');
for (const stale of ['현재 5차 모집과 다음 6차', '현재 접수 중', '다음 차수 사전 안내', '2026. 8. 31.~9. 22.']) {
  assert(!business.includes(stale), `Stale recruitment copy: ${stale}`);
}
assert(business.includes('2026. 9. 1.~9. 22.'), 'Current round dates missing');
assert(business.includes('11788226445943'), 'Current official notice link missing');
assert(business.includes('전문컨설팅 재참여 특례') && business.includes('기초컨설팅 재참여 특례'), 'Reentry paths must remain distinct');
console.log(`Public copy passed: 3 eligibility pages, ${faqNode.mainEntity.length} FAQ pairs and recruitment notice`);
