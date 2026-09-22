import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

// Run against an explicitly started local preview, never a deployed endpoint.
const base = process.env.PREPARATION_CHECK_BASE_URL || 'http://127.0.0.1:4362';
assert.equal(new URL(base).hostname, '127.0.0.1');
const artifacts = resolve(process.env.PREPARATION_CHECK_ARTIFACTS || '../reemployment-training-link-20260922-evidence');
const baseline = 'ee94eff877a80efbac70f778fe33b90768378fb1';
const sourcePath = 'src/pages/business-consulting.astro';
const oldSource = execFileSync('git', ['show', `${baseline}:${sourcePath}`], { encoding: 'utf8' });
const source = await readFile(sourcePath, 'utf8');
const arrays = s => s.slice(s.indexOf('const readinessItems'), s.indexOf('\n---', 4));
assert.equal(arrays(source), arrays(oldSource), 'All five original business factual arrays remain unchanged');
const data = vm.runInNewContext(`${arrays(oldSource)}; ({readinessItems,steps,supportTypes,practicalChecks,outputItems})`);
const compact = s => s.replace(/\s+/g, '');
const expected = [
  ...data.readinessItems.map(([title, detail]) => title + detail),
  ...data.steps.map(([, title,, detail]) => title + ' 단계' + detail),
  ...data.supportTypes.map(([title,, detail]) => title + detail),
  ...data.practicalChecks.map(({title, criteria, materials}) => title + '세부 확인 기준' + criteria.join('') + '준비자료' + materials),
  ...data.outputItems.map(([title,, detail]) => title + detail),
].map(compact);
assert.equal(expected.length, 21);
// Preserve privacy notice, form fields and outbound handler exactly, except for the approved preset.
const oldContact = execFileSync('git', ['show', `${baseline}:src/pages/contact.astro`], { encoding: 'utf8' });
const contact = await readFile('src/pages/contact.astro', 'utf8');
for (const [start, end] of [['<div class="privacy-box">', '<div class="form-actions">'], ["form.addEventListener('submit'", '</script>']]) {
  assert.equal(contact.slice(contact.indexOf(start), contact.indexOf(end, contact.indexOf(start))), oldContact.slice(oldContact.indexOf(start), oldContact.indexOf(end, oldContact.indexOf(start))));
}
for (const path of ['src/pages/career-planning.astro', 'src/pages/privacy.astro']) {
  assert.equal(await readFile(path, 'utf8'), execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' }));
}
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch();
const report = { baseline, base, screenshots: [], geometry: [], inlineInteractions: 0, faqPairs: 0, mockRequests: 0, blockedExternalRequests: 0 };
const context = await browser.newContext();
await context.route('**/*', route => {
  if (new URL(route.request().url()).origin === base) return route.continue();
  report.blockedExternalRequests++;
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const shot = async (name, locator = null) => {
  const path = join(artifacts, `${name}.png`);
  if (locator) await locator.screenshot({ path });
  else await page.screenshot({ path, fullPage: true });
  report.screenshots.push(path);
};
const bounds = async label => {
  const result = await page.evaluate(() => {
    const failures = [];
    if (document.documentElement.scrollWidth > innerWidth) failures.push('page overflow');
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    for (const el of document.querySelectorAll('#company-staff-training, #company-staff-training *, #recruitment-history, .business-guide-entry, .faq-item[open], .consultation-form')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > innerWidth + 1) failures.push(`${el.tagName}.${el.className}: outside viewport`);
    }
    const sections = [...document.querySelectorAll('main > section')].filter(visible);
    for (let i = 1; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top < sections[i-1].getBoundingClientRect().bottom - 1) failures.push('adjacent section overlap');
    }
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, failures };
  });
  assert.deepEqual(result.failures, [], label);
  report.geometry.push({ label, ...result });
};
try {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ['/', '/business-consulting/', '/business-consulting-guide/', '/career-support/', '/faq/', '/contact/?preset=business-next-year', '/career-planning/']) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      await bounds(`${width} ${route} default`);
      await shot(`${width}-${route === '/' ? 'home' : route.split('/')[1]}-full`);
    }
    await page.goto(base + '/business-consulting/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.page-next-actions-grid[aria-label="기업컨설팅 상세 안내"] > a').count(), 3);
    assert.equal(await page.locator('#recruitment-history').evaluate(el => el.open), false);
    await shot(`${width}-business-quick-adjacent`, page.locator('.business-guide-entry'));
    await shot(`${width}-business-closure-adjacent`, page.locator('.recruitment-notice'));
    await page.locator('a[href="#company-staff-training"]').click();
    await page.waitForTimeout(300);
    assert.equal(new URL(page.url()).hash, '#company-staff-training');
    const card = page.locator('#company-staff-training');
    assert.match(await card.innerText(), /2026년 운영기간: 4\. 17\.~11\. 27\./);
    const external = card.locator('a');
    assert.equal(await external.getAttribute('href'), 'https://www.elifeplan.or.kr/board/index.jsp?code=corp&ch=corp');
    assert.equal(await external.getAttribute('target'), '_blank');
    assert.equal(await external.getAttribute('rel'), 'noopener noreferrer');
    assert.ok((await external.boundingBox()).height >= 44);
    await shot(`${width}-business-training`, card);
    await shot(`${width}-business-practical-adjacent`, card.locator('..'));
    const history = page.locator('#recruitment-history');
    await history.locator(':scope > summary').click();
    assert.equal(await history.evaluate(el => el.open), true);
    assert.deepEqual((await page.locator('.round-status').allTextContents()).map(s => s.trim()), ['접수 종료', '접수 종료']);
    await page.locator('.recruitment-details .recruitment-details > summary').click();
    await bounds(`${width} recruitment history all open`);
    await shot(`${width}-business-history-open`, page.locator('.recruitment-notice'));
    await history.locator(':scope > summary').press('Enter');
    assert.equal(await history.evaluate(el => el.open), false);
    const details = page.locator('details.business-inline-details');
    assert.equal(await details.count(), 21);
    assert.deepEqual((await page.locator('.business-inline-content').allTextContents()).map(compact), expected);
    assert.equal(await page.locator('[role="tooltip"], .step-popover, .step-popover-card').count(), 0);
    for (let i = 0; i < 21; i++) {
      const d = details.nth(i), s = d.locator('summary');
      assert.ok((await s.boundingBox()).height >= 44);
      await s.click(); assert.equal(await d.evaluate(el => el.open), true);
      await s.press('Enter'); assert.equal(await d.evaluate(el => el.open), false);
      await s.press('Space'); assert.equal(await d.evaluate(el => el.open), true);
      report.inlineInteractions += 3;
    }
    const inlineFailures = await page.evaluate(() => {
      const errors = [];
      const rect = el => el.getBoundingClientRect();
      const inside = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
      const cards = [...document.querySelectorAll('.business-inline-card')];
      for (const [i, card] of cards.entries()) {
        const d = card.querySelector('details'), c = d.querySelector('.business-inline-content');
        if (!inside(rect(card), rect(d)) || !inside(rect(d), rect(c))) errors.push(`${i} container`);
        for (const child of c.querySelectorAll('*')) if (!inside(rect(c), rect(child))) errors.push(`${i} child`);
        for (const other of cards.slice(i + 1)) {
          const a = rect(card), b = rect(other);
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) errors.push(`${i} overlap`);
        }
      }
      return errors;
    });
    assert.deepEqual(inlineFailures, []);
    await bounds(`${width} inline all open`);
    await shot(`${width}-business-inline-open`);
    await page.goto(base + '/faq/', { waitUntil: 'networkidle' });
    const faqs = page.locator('[data-faq-item]');
    const schema = await page.locator('script[type="application/ld+json"]').evaluate(el => {
      const collect = x => !x || typeof x !== 'object' ? [] : [x, ...Object.values(x).flatMap(collect)];
      return collect(JSON.parse(el.textContent)).find(x => x['@type'] === 'FAQPage').mainEntity;
    });
    assert.equal(await faqs.count(), schema.length);
    for (let i = 0; i < schema.length; i++) {
      const f = faqs.nth(i);
      assert.equal(compact(await f.locator('summary').textContent()), compact(schema[i].name));
      const paragraphs = (await f.locator('p').allTextContents()).join(' ');
      assert.equal(compact(paragraphs), compact(schema[i].acceptedAnswer.text));
    }
    report.faqPairs = schema.length;
    for (const question of ['올해 모집이 끝났는데 상담을 받을 수 있나요?', '기업컨설팅 참여기업 담당자는 별도 교육을 받아야 하나요?']) {
      await page.getByText(question, { exact: true }).click();
    }
    const trainingFaq = faqs.filter({ hasText: '기업컨설팅 참여기업 담당자는 별도 교육을 받아야 하나요?' });
    assert.doesNotMatch(await trainingFaq.innerText(), /2026|4\. 17|11\. 27/);
    assert.equal(await trainingFaq.locator('a').getAttribute('target'), '_blank');
    await bounds(`${width} FAQ new answers open`);
    await shot(`${width}-faq-new-adjacent`, page.locator('[aria-labelledby="consulting-faq-title"]'));
    await page.locator('#faq-search').fill('연수');
    assert.equal(await page.locator('[data-faq-item]:visible').count(), 1);
    await page.locator('#faq-search').fill('zz-no-matching-question-zz');
    assert.equal(await page.locator('#faq-empty').isVisible(), true);
    await page.locator('#faq-search-clear').click();
    assert.equal(await page.locator('[data-faq-item]:visible').count(), schema.length);
    await page.goto(base + '/contact/?preset=business-next-year#consultation-request', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[name="serviceType"]:checked').inputValue(), 'business');
    assert.equal(await page.locator('[name="message"]').inputValue(), '차년도 기업컨설팅 참여를 위한 사전상담을 희망합니다.');
    await shot(`${width}-contact-preset-adjacent`, page.locator('#consultation-request'));
    await page.locator('[name="message"]').fill('직접 수정한 상담내용은 그대로 보존되어야 합니다.');
    await page.locator('label').filter({ has: page.locator('[name="serviceType"][value="career"]') }).click();
    await page.evaluate(() => { dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await page.locator('[name="message"]').inputValue(), '직접 수정한 상담내용은 그대로 보존되어야 합니다.');
    assert.equal(await page.locator('[name="serviceType"]:checked').inputValue(), 'career');
  }
  for (const suffix of ['', '?preset=unknown', '?preset=%3Cimg%20src=x%20onerror=alert(1)%3E&message=INJECTED']) {
    await page.goto(base + '/contact/' + suffix);
    assert.equal(await page.locator('[name="message"]').inputValue(), '');
    assert.equal(await page.locator('img[src="x"]').count(), 0);
  }
  // Simulate browser-restored form values before the existing inline script initializes.
  await page.route('**/contact/?preset=business-next-year', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<textarea name="message"', '<textarea name="message"').replace('</textarea>', '기존 상담내용 보존</textarea>').replace('value="business" checked', 'value="business"').replace('value="career"', 'value="career" checked');
    await route.fulfill({ response, body: html });
  });
  await page.goto(base + '/contact/?preset=business-next-year');
  assert.equal(await page.locator('[name="message"]').inputValue(), '기존 상담내용 보존');
  assert.equal(await page.locator('[name="serviceType"]:checked').inputValue(), 'career');
  await page.unroute('**/contact/?preset=business-next-year');
  for (const mode of ['success', 'failure']) {
    await page.route('https://kjobs-consultation-alert.kjobs-alert.workers.dev/**', async route => {
      report.mockRequests++;
      const payload = route.request().postDataJSON();
      assert.equal(payload.serviceType, 'business');
      assert.equal(payload.message, '차년도 기업컨설팅 참여를 위한 사전상담을 희망합니다.');
      if (mode === 'success') await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      else await route.abort();
    });
    await page.goto(base + '/contact/?preset=business-next-year');
    await page.locator('[name="name"]').fill('로컬검증');
    await page.locator('[name="phone"]').fill('010-0000-0000');
    await page.locator('[name="email"]').fill('local-test@example.com');
    await page.locator('[name="privacyConsent"]').check();
    await page.locator('#consultationForm').evaluate(f => f.requestSubmit());
    await page.locator('#formStatus').filter({ hasText: mode === 'success' ? '전송되었습니다' : '이메일 작성 화면' }).waitFor();
    await page.unroute('https://kjobs-consultation-alert.kjobs-alert.workers.dev/**');
  }
  // Explicit closure also wins before the scheduled KST end, including refresh events.
  await page.clock.install({ time: new Date('2026-09-22T03:00:00Z') });
  await page.goto(base + '/business-consulting/');
  await page.evaluate(() => { dispatchEvent(new Event('pageshow')); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.runFor(60001);
  assert.equal((await page.locator('[data-recruitment-confirmed-closed="true"]').textContent()).trim(), '접수 종료');
  assert.equal(await page.locator('.recruitment-round.current').count(), 0);
  assert.deepEqual(errors, []);
  report.status = 'PASS';
  await writeFile(join(artifacts, 'business-preparation-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
