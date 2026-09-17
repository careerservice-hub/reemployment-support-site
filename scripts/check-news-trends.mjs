import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, symlink, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { newsEntries, publishedNews, contentDigest } from '../src/data/news.js';

const root = resolve(import.meta.dirname, '..');
const evidence = resolve(process.env.NEWS_EVIDENCE_DIR || '/tmp/news-trends-evidence');
await mkdir(evidence, { recursive: true });
const checks = [];
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
assert.equal(newsEntries.length, 0);
assert.deepEqual(publishedNews([{ status: 'draft', slug: 'excluded-draft' }]), []);
const fixture = n => ({ id: n, slug: `test-only-${n}`, status: 'published', category: '재취업지원',
  title: `TEST ONLY — 화면 검증 자료 ${n}`, summary: '시험 전용 텍스트이며 실제 뉴스가 아닙니다.',
  source: 'TEST ONLY', sourceTitle: 'TEST ONLY', sourceUrl: 'https://example.invalid/test-only',
  sourceDate: '2026-09-17', publishedAt: '2026-09-17', modifiedAt: '2026-09-17', checkedAt: '2026-09-17',
  sections: [{ heading: '시험 전용 본문', paragraphs: [`본문전용검색어${n} 표시 및 검색 시험.`, '개인이나 신청자에 관한 정보가 없는 UI 테스트 텍스트.'] }],
});
const approved = entry => ({ ...entry, approval: { decision: 'approved', reference: 'TEST-ONLY-NOT-REAL-APPROVAL',
  date: '2026-09-17', contentDigest: contentDigest(entry), noPersonalData: true, noApplicantStories: true } });
assert.throws(() => publishedNews([fixture(1)]));
assert.throws(() => publishedNews([{ ...approved(fixture(1)), title: 'changed after approval' }]));
assert.throws(() => publishedNews([approved({ ...fixture(1), category: 'unrelated' })]));
assert.throws(() => publishedNews([approved({ ...fixture(1), sourceUrl: 'javascript:alert(1)' })]));
assert.throws(() => publishedNews([approved(fixture(1)), approved(fixture(1))]));
assert.throws(() => publishedNews([{ ...approved(fixture(1)), approval: { ...approved(fixture(1)).approval, noApplicantStories: false } }]));
pass('draft exclusion, per-item approval/content binding, topic/URL/duplicate/privacy gates');

// Build the test data ONLY in a separate copied site, never production src or dist.
const testRoot = await mkdtemp(join(evidence, 'fixture-site-'));
for (const file of ['src', 'public', 'astro.config.mjs', 'package.json', 'tsconfig.json']) await cp(join(root, file), join(testRoot, file), { recursive: true });
await symlink(join(root, 'node_modules'), join(testRoot, 'node_modules'), 'dir');
const testData = [...Array.from({ length: 12 }, (_, i) => approved(fixture(i + 1))), { status: 'draft', slug: 'excluded-draft' }];
const moduleText = await readFile(join(root, 'src/data/news.js'), 'utf8');
await writeFile(join(testRoot, 'src/data/news.js'), moduleText.replace('export const newsEntries = [];', `export const newsEntries = ${JSON.stringify(testData)};`));
const build = execFileSync(process.execPath, [join(root, 'node_modules/astro/bin/astro.mjs'), 'build'], { cwd: testRoot, encoding: 'utf8' });
await writeFile(join(evidence, 'fixture-build.log'), build);
const prodMap = await readFile(join(root, 'dist/sitemap-0.xml'), 'utf8');
const testMap = await readFile(join(testRoot, 'dist/sitemap-0.xml'), 'utf8');
assert(prodMap.includes('/news-trends/'));
assert(!prodMap.includes('test-only') && !prodMap.includes('excluded-draft'));
assert(testMap.includes('/news-trends/test-only-1/') && !testMap.includes('excluded-draft'));
assert(!(await readFile(join(testRoot, 'dist/llms.txt'), 'utf8')).includes('excluded-draft'));
assert.equal(await readFile(join(root, 'src/data/news.js'), 'utf8'), moduleText);
pass('separate fixture build, production empty, draft absent from sitemap/llms');

async function serve(folder) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const full = resolve(folder, `.${path}`);
      if (!full.startsWith(`${folder}/`)) throw new Error('path');
      const bytes = await readFile(full);
      res.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.xml': 'application/xml' })[extname(full)] || 'application/octet-stream');
      res.end(bytes);
    } catch { res.statusCode = 404; res.end('Not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
const prod = await serve(join(root, 'dist'));
const test = await serve(join(testRoot, 'dist'));
const browser = await chromium.launch({ headless: true });
const geometry = [];
try {
  for (const width of [1280, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const [name, url] of [['empty', `${prod.url}/news-trends/`], ['fixture-list', `${test.url}/news-trends/`], ['fixture-detail', `${test.url}/news-trends/test-only-1/`], ['policy', `${prod.url}/policy-updates/`]]) {
      assert.equal((await page.goto(url)).status(), 200);
      await page.waitForLoadState('networkidle');
      const sizes = await page.evaluate(() => {
        const hero = document.querySelector('.news-hero');
        if (hero && getComputedStyle(hero.querySelector('h1')).textAlign !== 'center') throw new Error('news hero must match centered policy hero');
        const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const nav = [...document.querySelectorAll('.site-header nav')].find(el => el.getBoundingClientRect().height > 0);
        return { innerWidth, scrollWidth: document.documentElement.scrollWidth, header: rect(document.querySelector('.site-header')), main: rect(document.querySelector('main')), footer: rect(document.querySelector('footer')), nav: [...nav.querySelectorAll('a')].map(el => ({ text: el.textContent, ...rect(el) })) };
      });
      assert.equal(sizes.innerWidth, width); assert(sizes.scrollWidth <= width, `${name} overflow ${width}`);
      assert(sizes.main.y >= sizes.header.bottom - 1, 'header overlaps main');
      assert(sizes.footer.y >= sizes.main.bottom - 1, 'footer overlaps main');
      for (const item of sizes.nav) { assert(item.x >= -1 && item.right <= width + 1); if (width === 390) assert(item.height >= 44); }
      for (let i = 0; i < sizes.nav.length; i++) for (let j = i + 1; j < sizes.nav.length; j++) {
        const a = sizes.nav[i], b = sizes.nav[j];
        assert(!(a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y), 'nav overlap');
      }
      const policyNav = sizes.nav.find(item => item.text === '정책' || item.text === '정책소식');
      const newsNav = sizes.nav.find(item => item.text === '뉴스·동향');
      assert.equal(policyNav.y, newsNav.y, 'policy and news must be adjacent on same nav row');
      assert(newsNav.x >= policyNav.right);
      geometry.push({ width, name, ...sizes });
      await page.screenshot({ path: join(evidence, `${name}-${width}.png`), fullPage: true });
      if (name === 'empty') {
        assert.equal(await page.locator('.news-row').count(), 0);
        assert(await page.locator('#news-empty').isVisible());
        await page.locator('#news-search').fill('없는검색어');
        await page.locator('#news-search-form').evaluate(form => form.requestSubmit());
        assert.match(await page.locator('#news-empty').innerText(), /검색 결과가 없습니다/);
        await page.locator('#news-reset').click();
        assert.match(await page.locator('#news-empty').innerText(), /등록된 뉴스/);
        assert(await page.locator('#news-search').evaluate(el => document.activeElement === el));
      }
      if (name === 'fixture-list') {
        assert.equal(await page.locator('.news-row:visible').count(), 10);
        await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
        assert.equal(await page.locator('.news-row:visible').count(), 2);
        assert(await page.locator('#news-pagination [aria-current]').evaluate(el => el === document.activeElement));
        await page.getByRole('button', { name: '이전 페이지', exact: true }).click();
        await page.getByRole('button', { name: '2 페이지', exact: true }).click();
        await page.locator('#news-search').fill('본문전용검색어12');
        assert.equal(await page.locator('.news-row:visible').count(), 1);
        assert.match(await page.locator('#news-page-info').innerText(), /1 \/ 1/);
        await page.locator('#news-search').fill('존재하지않는검색어');
        assert(await page.locator('#news-empty').isVisible());
        await page.locator('#news-reset').click();
        assert.equal(await page.locator('.news-row:visible').count(), 10);
      }
      if (name === 'fixture-detail') {
        assert.match(await page.locator('.policy-article').innerText(), /본문전용검색어1/);
        const schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.flatMap(n => JSON.parse(n.textContent)));
        assert(schemas.some(s => s['@type'] === 'Article' && s.citation[0] === 'https://example.invalid/test-only'));
        assert(schemas.some(s => s['@type'] === 'BreadcrumbList' && s.itemListElement[1].name === '뉴스·동향'));
        await page.getByRole('link', { name: '뉴스·동향 목록', exact: true }).click();
        await page.waitForURL('**/news-trends/');
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
    pass(`${width}px empty/search/reset/pagination/detail/schema/backlink/header/footer geometry; no JS errors`);
  }
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const page = await noJs.newPage();
  await page.goto(`${prod.url}/news-trends/`);
  assert(await page.locator('#news-empty').isVisible());
  await page.goto(`${test.url}/news-trends/`);
  assert.equal(await page.locator('.news-row a').count(), 12);
  assert.equal((await page.goto(`${test.url}/news-trends/excluded-draft/`)).status(), 404);
  pass('no-JS empty and server-rendered fixture links; draft route 404');
  await noJs.close();
} finally {
  await browser.close(); prod.server.close(); test.server.close();
  await writeFile(join(evidence, 'geometry.json'), JSON.stringify(geometry, null, 2));
}
await writeFile(join(evidence, 'news-test-results.json'), JSON.stringify({ status: 'pass', checks, testRoot }, null, 2));
console.log(`Evidence: ${evidence}`);
