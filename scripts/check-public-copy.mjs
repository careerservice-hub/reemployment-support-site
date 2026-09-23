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
assert(business.includes('2026년 기업컨설팅은 6차까지 모집이 종료되었습니다.'), 'Confirmed recruitment closure missing');
const history = business.match(/<details\b[^>]*id="recruitment-history"[^>]*>([\s\S]*?)<\/details>/)?.[1];
assert(history, 'Recruitment history disclosure missing');
assert(history.includes('2026년 모집 이력 보기'), 'History summary missing');
const rows = [...history.matchAll(/<tbody[^>]*>([\s\S]*?)<\/tbody>/g)][0]?.[1].match(/<tr\b/g) || [];
assert.equal(rows.length, 6, 'History must contain six paired rounds');
const expectedIds = ['11773634627231', '11776393950070', '11776645941501', '11779411159512', '11779758214166', '11782435091662', '11782695396958', '11785477449530', '11785485331738', '11788498753242', '11788226445943'];
const links = [...history.matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>/g)];
assert.equal(links.length, 11, 'History must contain eleven official links');
assert.deepEqual(links.map(([, , href]) => new URL(href.replaceAll('&amp;', '&')).searchParams.get('bltnNo')), expectedIds, 'Official notice order or IDs differ');
for (const [, before, href, after] of links) {
  const url = new URL(href.replaceAll('&amp;', '&'));
  assert.equal(url.origin, 'https://www.nosa.or.kr');
  assert.equal(url.pathname, '/board/read.brd');
  assert.equal(url.searchParams.get('boardId'), 'nosa05');
  const attributes = before + after;
  assert(attributes.includes('target="_blank"') && attributes.includes('noopener noreferrer') && attributes.includes('(새 창)'), 'External link safety or accessible new-window label missing');
}
for (let round = 1; round <= 6; round++) {
  assert(history.includes(`${round}차 모집${round === 5 ? ' 변경' : ''}공고`), `Recruitment label missing: ${round}`);
  assert(history.includes(`${round}차 선정공고`), `Selection label missing: ${round}`);
}
const pendingCell = [...history.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].at(-1)?.[1];
assert(pendingCell?.includes('9월 29일 발표 예정') && !pendingCell.includes('<a'), 'Sixth selection must remain a non-link pending notice');
console.log(`Public copy passed: 3 eligibility pages, ${faqNode.mainEntity.length} FAQ pairs and recruitment notice`);
