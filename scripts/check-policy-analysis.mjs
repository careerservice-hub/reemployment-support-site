import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname, join } from 'node:path';
import assert from 'node:assert/strict';
const evidence = resolve(process.env.POLICY_EVIDENCE_DIR || '/tmp/policy-analysis-evidence');
await mkdir(evidence, { recursive: true });
const root = resolve(import.meta.dirname, '../dist');
let server;
let base = process.env.POLICY_BASE_URL;
if (!base) {
  server = createServer(async (req, res) => {
    try {
      let path = new URL(req.url, 'http://localhost').pathname;
      if (path.endsWith('/')) path += 'index.html';
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(root + '/')) throw new Error('path');
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' })[extname(file)] || 'application/octet-stream');
      res.end(await readFile(file));
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
}
const source = await readFile(resolve(import.meta.dirname, '../src/components/PolicyAnalysis.astro'), 'utf8');
const exactCopy = [...source.split('<style>')[0].matchAll(/<(?:p|h[234])\b[^>]*>([^<]+)<\/(?:p|h[234])>/g)].map(m => m[1]);
const cache = process.env.POLICY_VERIFY_SHA || String(Date.now());
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [1280, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    const response = await page.goto(`${base}/policy-updates/?verify=${cache}`);
    await page.waitForLoadState('networkidle');
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('h1').count(), 1);
    const panel = page.locator('.policy-analysis');
    assert(await panel.isVisible());
    const text = await panel.innerText();
    for (const copy of exactCopy) assert(text.includes(copy), copy);
    assert.equal(await panel.locator('details, [hidden]').count(), 0);
    assert.equal(await page.locator('.policy-row').count(), 7);
    const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(n => JSON.parse(n.textContent)));
    assert.equal(schemas.find(s => s['@type'] === 'ItemList').numberOfItems, 7);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.careerservice.co.kr/policy-updates/');
    const geometry = await page.evaluate(() => {
      const box = s => document.querySelector(s).getBoundingClientRect().toJSON();
      return { width: innerWidth, scroll: document.documentElement.scrollWidth, stages: box('.analysis-stages'), preparation: box('.analysis-preparation'), panel: box('.policy-analysis'), board: box('.policy-board') };
    });
    assert(geometry.scroll <= width);
    assert(geometry.panel.bottom <= geometry.board.top);
    if (width > 700) assert.equal(geometry.stages.top, geometry.preparation.top);
    else assert(geometry.preparation.top >= geometry.stages.bottom);
    await page.screenshot({ path: join(evidence, `policy-${width}.png`), fullPage: true });
    const bodyOnly = await page.locator('.policy-row').evaluateAll(rows => {
      const visible = rows.map(r => r.textContent).join(' ');
      for (const r of rows) for (const word of r.dataset.search.split(/\s+/)) if (word.length > 4 && !visible.includes(word)) return word;
    });
    assert(bodyOnly);
    await page.locator('#policy-search').fill(bodyOnly);
    await page.locator('#policy-search-form button[type="submit"]').click();
    assert(await page.locator('.policy-row:visible').count() > 0);
    await page.locator('#policy-search').fill('zzzz-no-match-검증');
    assert.equal(await page.locator('.policy-row:visible').count(), 0);
    assert(await page.locator('#policy-empty').isVisible());
    assert(await panel.isVisible());
    await page.locator('#policy-reset').click();
    assert.equal(await page.locator('.policy-row:visible').count(), 7);
    assert.equal(await page.locator('#policy-search').inputValue(), '');
    assert.equal(await page.locator('#policy-page-info').innerText(), '1 / 1 페이지');
    assert(await page.locator('#policy-pagination button').first().isDisabled());
    assert(await page.locator('#policy-pagination button').last().isDisabled());
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const href of await panel.locator('a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')))) {
      assert.equal((await page.request.get(`${base}${href}?verify=${cache}`)).status(), 200);
    }
    assert.deepEqual(errors, []);
    results.push({ width, exactCopy: exactCopy.length, geometry, bodyOnly, searchReset: true, noResults: true, pagination: true, links: true, metadata: true, errors });
    await page.close();
  }
  const report = { passed: true, base, verifySha: cache, results };
  await writeFile(join(evidence, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); server?.close(); }
