import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, join } from 'node:path';
import assert from 'node:assert/strict';
import { publishedNews } from '../src/data/news.js';
import { approvedTrendSnapshots } from '../src/data/trends.js';
const entries = publishedNews();
const snapshots = approvedTrendSnapshots();
const evidence = resolve(process.env.NEWS_EVIDENCE_DIR || '/tmp/published-news-evidence');
await mkdir(evidence, { recursive: true });
const root = resolve(import.meta.dirname, '../dist');
let server;
let base = process.env.NEWS_BASE_URL;
if (!base) {
  server = createServer(async (req, res) => {
    try {
      let path = new URL(req.url, 'http://localhost').pathname;
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + '/')) throw new Error('path');
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.xml': 'application/xml' })[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
}
const cache = process.env.NEWS_VERIFY_SHA || String(Date.now());
const url = path => `${base.replace(/\/$/, '')}${path}?verify=${encodeURIComponent(cache)}`;
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const response = await fetch(url('/sitemap-0.xml'));
  assert.equal(response.status, 200);
  const sitemap = await response.text();
  for (const entry of entries) assert(sitemap.includes(entry.href));
  for (const width of [1280, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const load = async path => {
      const response = await page.goto(url(path)); await page.waitForLoadState('networkidle');
      assert.equal(response.status(), 200);
      assert(!/noindex/i.test(response.headers()['x-robots-tag'] || ''));
      assert(!await page.locator('meta[name="robots"][content*="noindex"]').count());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(!/PRIVATE_NEWS_PREVIEW_FILE|비공개 검토본|문안 승인 전|\/Users\//.test(await page.content()));
      return response.url();
    };
    const finalUrl = await load('/news-trends/');
    assert.equal(await page.locator('.news-row h2 a').count(), entries.length);
    assert(await page.locator('.trend-thesis').first().isVisible());
    assert.equal(await page.locator('.trend-axes section:visible').count(), 3);
    assert.equal(await page.locator('#trend-year option').count(), snapshots.length);
    await page.screenshot({ path: join(evidence, `published-news-${width}.png`), fullPage: true });
    const bodyOnly = await page.locator('.news-row').evaluateAll(rows => {
      const text = rows.map(r => r.textContent).join(' ');
      for (const r of rows) for (const word of r.dataset.search.split(/\s+/)) if (word.length > 4 && !text.includes(word)) return word;
    });
    assert(bodyOnly);
    await page.locator('#news-search').fill(bodyOnly);
    assert(await page.locator('.news-row:visible').count() > 0);
    await page.locator('#news-search').fill('zzzz-no-match-검증');
    assert.equal(await page.locator('.news-row:visible').count(), 0);
    assert(await page.locator('#news-empty').isVisible());
    await page.locator('#news-reset').click();
    assert.equal(await page.locator('.news-row:visible').count(), entries.length);
    const routes = [];
    for (const entry of entries) {
      const liveUrl = await load(entry.href);
      assert.equal(await page.locator('h1').innerText(), entry.title);
      assert.equal(await page.locator('.policy-date-row time').getAttribute('datetime'), entry.sourceDate);
      assert.equal(await page.locator('.legal-stage').innerText(), '자료의 단계\n' + entry.legalStage);
      const text = await page.locator('.policy-article').innerText();
      for (const section of entry.sections) for (const paragraph of section.paragraphs) assert(text.includes(paragraph));
      assert.equal(await page.locator('.policy-source-actions a').count(), entry.sources.length);
      const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(n => JSON.parse(n.textContent)));
      const article = schemas.find(s => s['@type'] === 'Article');
      assert.equal(article.headline, entry.title);
      assert.equal(article.datePublished, entry.publishedAt);
      assert.equal(article.dateModified, entry.modifiedAt);
      assert.deepEqual(article.citation, entry.sources.map(s => s.url));
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.careerservice.co.kr' + entry.href);
      await page.screenshot({ path: join(evidence, `${entry.slug}-${width}.png`), fullPage: true });
      routes.push({ url: liveUrl, status: 200, exactCopy: true, articleSchema: true, indexable: true });
      await page.locator('.policy-actions a').click(); await page.waitForLoadState('networkidle');
      assert.equal(await page.locator('.news-row h2 a').count(), entries.length);
    }
    assert.deepEqual(errors, []);
    results.push({ width, finalUrl, bodyOnly, routes, searchReset: true, noResults: true, noOverflow: true, errors });
    await page.close();
  }
  const report = { passed: true, base, verifySha: cache, sitemap: true, articleCount: entries.length, snapshotCount: snapshots.length, results };
  await writeFile(join(evidence, 'published-news-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); server?.close(); }
