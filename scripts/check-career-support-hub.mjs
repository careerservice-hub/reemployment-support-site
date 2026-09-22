import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Run against the isolated preview; never submits forms or requests indexing.
const base = process.env.HUB_CHECK_BASE_URL || 'http://127.0.0.1:4397';
const out = process.env.HUB_CHECK_OUTPUT || '/tmp/careerservice-hub-review';
const routes = ['/', '/career-support/', '/faq/', '/policy-updates/reemployment-service-reform-2026/'];
const norm = (s) => s.replace(/\s+/g, ' ').trim();
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const links = new Set();
try {
  const page = await browser.newPage();
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      const slug = route === '/' ? 'home' : route.split('/').filter(Boolean).at(-1);
      const audit = await page.evaluate(() => {
        const data = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent);
        return {
          title: document.title,
          h1: [...document.querySelectorAll('h1')].map(e => e.textContent),
          canonical: document.querySelector('link[rel="canonical"]').href,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          data,
          faqs: [...document.querySelectorAll('details.faq-item')].map(d => ({
            q: d.querySelector('summary').textContent,
            a: [...d.querySelectorAll('p')].map(e => e.textContent).join(' '),
          })),
          links: [...document.querySelectorAll('main a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/')),
          text: document.body.textContent,
        };
      });
      assert.equal(audit.overflow, false, `${route} ${width} overflow`);
      assert.equal(audit.h1.length, 1);
      assert.equal(audit.canonical, 'https://www.careerservice.co.kr' + route);
      assert.equal(audit.data.filter(n => n['@type'] === 'WebPage').length, 1);
      assert.equal(audit.data.filter(n => n['@type'] === 'BreadcrumbList').length, route === '/' ? 0 : 1);
      const faq = audit.data.filter(n => n['@type'] === 'FAQPage');
      assert.equal(faq.length, audit.faqs.length ? 1 : 0);
      if (faq.length) assert.deepEqual(faq[0].mainEntity.map(q => ({ q: norm(q.name), a: norm(q.acceptedAnswer.text) })), audit.faqs.map(q => ({ q: norm(q.q), a: norm(q.a) })));
      assert(!/정부지원사업\s*기준을\s*준수하며|©\s*2026\s*K[·.\s-]*JOBS\s*모든\s*권리\s*보유/i.test(audit.text));
      assert(!/명칭 변경을 예고하는 표현이 아니라|K·JOBS의 확장 개념/.test(audit.text));
      if (route === '/' || route === '/career-support/') assert(audit.title.includes('경력지원서비스') && audit.h1[0].includes('경력지원서비스'));
      audit.links.forEach(l => links.add(l));
      await page.screenshot({ path: `${out}/${slug}-${width}-full.png`, fullPage: true });
      await page.screenshot({ path: `${out}/${slug}-${width}-hero.png` });
      if (audit.faqs.length) {
        await page.locator('details.faq-item summary').first().focus();
        await page.keyboard.press('Enter');
        assert(await page.locator('details.faq-item').first().evaluate(e => e.open));
        await page.locator('details.faq-item').evaluateAll(ds => ds.forEach(d => { d.open = true; }));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
        await page.screenshot({ path: `${out}/${slug}-${width}-expanded-full.png`, fullPage: true });
        const section = route === '/faq/' ? '[aria-labelledby="common-faq-title"]' : '[aria-labelledby="career-support-faq-title"]';
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0); });
        await page.locator(section).screenshot({ path: `${out}/${slug}-${width}-faq.png`, style: 'header, .skip-link { visibility: hidden !important; }' });
      }
      const adjacent = route === '/' ? '[aria-labelledby="career-support-home-title"]' : route === '/career-support/' ? '[aria-labelledby="career-support-apply"]' : null;
      if (adjacent) {
        await page.locator(adjacent).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${out}/${slug}-${width}-adjacent.png` });
      }
      results.push({ route, width, title: audit.title, h1: audit.h1[0], canonical: audit.canonical, faqPairs: audit.faqs.length, overflow: false });
    }
  }
  for (const href of links) {
    const url = new URL(href, base);
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200, href);
    if (url.hash) assert(await page.locator(`[id="${decodeURIComponent(url.hash.slice(1))}"]`).count(), `missing anchor ${href}`);
  }
  // Public assets must not contradict the corrected page definition.
  const llms = await readFile('public/llms.txt', 'utf8');
  assert(!/K·JOBS의 확장 개념|명칭 변경을 예고하는 표현이 아니라/.test(llms));
  await writeFile(`${out}/results.json`, JSON.stringify({ results, internalLinks: [...links], verdict: 'pass' }, null, 2));
  console.log(`Career hub passed: ${results.length} page/viewport checks, ${links.size} internal links and anchors; screenshots: ${out}`);
} finally {
  await browser.close();
}
