import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { createServer } from 'node:net';
import { chromium } from 'playwright';

const base = process.env.INLINE_CHECK_BASE_URL || 'http://127.0.0.1:4351';
const artifacts = process.env.INLINE_CHECK_ARTIFACTS || join(homedir(), '.hermes/workspaces/business-inline-20260914/inline-test');
const path = 'src/pages/business-consulting.astro';
const original = execFileSync('git', ['show', `origin/main:${path}`], { encoding: 'utf8' });
const current = await readFile(path, 'utf8');
const data = (source) => source.slice(source.indexOf('const readinessItems'), source.indexOf('\n---', 4));
assert.equal(data(current), data(original), 'All factual arrays must match origin/main exactly');
// Normalize only the approved disclosure wrappers/classes, leaving all copy,
// links, headings, section ordering and BaseLayout SEO props untouched.
const normalize = (source) => source.slice(source.indexOf('<BaseLayout'), source.indexOf('</BaseLayout>'))
  .replace(/<article[^>]*>/g, '<article>')
  .replace(/<div class="step-popover[^\"]*"[^>]*>([\s\S]*?)<\/div>/g, '$1')
  .replace(/<\/?BusinessInlineDetails[^>]*>/g, '')
  .replace(/class="(?:popover|inline)-(section-label|materials)"/g, 'class="$1"');
assert.equal(normalize(current), normalize(original), 'Non-interaction page markup/copy must be unchanged');
const arrays = vm.runInNewContext(`${data(original)}; ({readinessItems,steps,supportTypes,practicalChecks,outputItems})`);
const compact = (text) => text.replace(/\s+/g, '');
const expected = [
  ...arrays.readinessItems.map(([title, detail]) => title + detail),
  ...arrays.steps.map(([, title,, detail]) => title + ' 단계' + detail),
  ...arrays.supportTypes.map(([title,, detail]) => title + detail),
  ...arrays.practicalChecks.map(({title, criteria, materials}) => title + '세부 확인 기준' + criteria.join('') + '준비자료' + materials),
  ...arrays.outputItems.map(([title,, detail]) => title + detail),
].map(compact);
assert.equal(expected.length, 21);
await mkdir(artifacts, { recursive: true });
// Fail rather than silently testing a stale preview if the owned port is busy.
if (!process.env.INLINE_CHECK_BASE_URL) {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(4351, '127.0.0.1', () => probe.close(resolve));
  });
}
const preview = process.env.INLINE_CHECK_BASE_URL ? null : spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', 'preview', '--host', '127.0.0.1', '--port', '4351'], { stdio: 'pipe' });
let browser;
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Preview must become ready');
  browser = await chromium.launch();
  const page = await browser.newPage();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/business-consulting/`);
    const details = page.locator('details.business-inline-details');
    assert.equal(await details.count(), 21);
    assert.equal(await page.locator('[role="tooltip"], .step-popover, .step-popover-card').count(), 0);
    assert.deepEqual((await page.locator('.business-inline-content').allTextContents()).map(compact), expected);
    assert.equal(await details.locator(':scope[open]').count(), 0);
    await page.screenshot({ path: join(artifacts, `${width}-closed.png`), fullPage: true });
    const geometry = async (label) => {
      const failures = await page.evaluate(() => {
        const errors = [];
        const cards = [...document.querySelectorAll('.business-inline-card')];
        const rect = el => el.getBoundingClientRect();
        const contains = (a,b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
        if (document.documentElement.scrollWidth > innerWidth) errors.push('horizontal overflow');
        for (const [i, card] of cards.entries()) {
          const d = card.querySelector('details');
          const s = d.querySelector('summary');
          if (rect(s).height < 44) errors.push(`${i}: summary target`);
          for (const el of [card, d, ...(d.open ? [d.querySelector('.business-inline-content')] : [])]) {
            const css = getComputedStyle(el);
            if (css.transform !== 'none' || ['absolute','fixed'].includes(css.position)) errors.push(`${i}: non-static/transform`);
          }
          if (!contains(rect(card), rect(d))) errors.push(`${i}: details outside article`);
          if (d.open) {
            const content = d.querySelector('.business-inline-content');
            if (!contains(rect(d), rect(content))) errors.push(`${i}: content clipped`);
            for (const el of content.querySelectorAll('*')) {
              if (!contains(rect(content), rect(el))) errors.push(`${i}: descendant outside content`);
            }
            for (let ancestor = content; ancestor; ancestor = ancestor.parentElement) {
              const css = getComputedStyle(ancestor);
              if (/(hidden|clip|scroll|auto)/.test(css.overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) errors.push(`${i}: ancestor clipping`);
            }
          }
          for (const other of cards.slice(i+1)) {
            const a = rect(card), b = rect(other);
            if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) errors.push(`${i}: articles overlap`);
          }
        }
        const sections = [...document.querySelectorAll('main > section')];
        for (let i=1;i<sections.length;i++) if(rect(sections[i]).top < rect(sections[i-1]).bottom-1) errors.push('sections overlap');
        return errors;
      });
      assert.deepEqual(failures, [], `${width} ${label}`);
    };
    await geometry('closed');
    for (let i = 0; i < 21; i++) {
      const d = details.nth(i), summary = d.locator('summary');
      for (const method of ['click', 'Enter', 'Space']) {
        if (method === 'click') await summary.click();
        else { await summary.focus(); await summary.press(method); }
        assert.equal(await d.evaluate(el => el.open), true, `${width}/${i}/${method} opens`);
        assert.equal(await summary.innerText(), '접기');
        await summary.hover();
        await geometry(`${i}/${method} open hover/focus`);
        if (method !== 'click') assert.equal(await summary.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        if (method === 'click') await summary.click(); else await summary.press(method);
        assert.equal(await d.evaluate(el => el.open), false, `${width}/${i}/${method} closes`);
        assert.equal(await summary.innerText(), '상세 보기');
        await summary.hover();
        assert.equal(await d.evaluate(el => el.open), false, 'Hover must not open');
      }
    }
    for (let i = 0; i < 21; i++) await details.nth(i).locator('summary').click();
    assert.equal(await page.locator('.business-inline-details[open]').count(), 21);
    for (let i=0;i<21;i++) {
      const summary = details.nth(i).locator('summary');
      await summary.focus(); await summary.hover();
      await geometry(`all open focus/hover ${i}`);
    }
    await page.screenshot({ path: join(artifacts, `${width}-all-open.png`), fullPage: true });
    results.push({width, disclosures:21, interactionMethods:['click','Enter','Space'], allOpenGeometry:'pass', textParity:'pass'});
  }
  for (const route of ['/', '/career-planning/', '/process/', '/approach/']) {
    await page.goto(`${base}${route}`);
    assert.equal(await page.locator('.business-inline-details').count(), 0, `${route} scoped component absent`);
    assert.ok(await page.locator('.step-popover').count() > 0, `${route} existing popovers retained`);
  }
  // Native disclosure must also work when JavaScript is disabled.
  const noJs = await browser.newPage({ javaScriptEnabled: false });
  await noJs.goto(`${base}/business-consulting/`);
  await noJs.locator('.business-inline-details summary').first().click();
  assert.equal(await noJs.locator('.business-inline-details[open]').count(), 1);
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({status:'pass', baseline:execFileSync('git',['rev-parse','origin/main'],{encoding:'utf8'}).trim(), results, otherRoutes:'retained', noJavaScript:'pass'}, null, 2));
  console.log(`PASS: 21 disclosures × 3 widths × click/Enter/Space open+close; all-open focus/hover geometry; origin/main text/copy/SEO parity; other routes retained; no-JS. Evidence: ${artifacts}`);
} finally {
  await browser?.close();
  preview?.kill('SIGTERM');
}
