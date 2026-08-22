import { readFile } from 'node:fs/promises';

const siteUrl = new URL(process.env.INDEXNOW_SITE_URL || 'https://www.careerservice.co.kr');
const key = process.env.INDEXNOW_KEY || '67fc374d97eb7b248b8ff08e40a3a8ad';
const keyLocation = new URL(`/${key}.txt`, siteUrl).toString();
const sitemapUrl = new URL('/sitemap-0.xml', siteUrl).toString();
const dryRun = process.env.INDEXNOW_DRY_RUN === '1';

async function fetchText(url, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'KJOBS-IndexNow/1.0' } });
      if (response.ok) return await response.text();
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  throw lastError;
}

const sitemapXml = dryRun
  ? await readFile(process.env.INDEXNOW_SITEMAP_PATH || 'dist/sitemap-0.xml', 'utf8')
  : await fetchText(sitemapUrl);
const urlList = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

if (urlList.length === 0) throw new Error('No URLs found in sitemap');
if (urlList.some((url) => new URL(url).host !== siteUrl.host)) throw new Error('Sitemap contains an unexpected host');

const payload = { host: siteUrl.host, key, keyLocation, urlList };
if (dryRun) {
  console.log(JSON.stringify({ endpoint: 'https://api.indexnow.org/indexnow', ...payload }, null, 2));
  process.exit(0);
}

const publishedKey = (await fetchText(keyLocation)).trim();
if (publishedKey !== key) throw new Error('Published IndexNow key does not match');

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload),
});
const body = await response.text();
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected submission: ${response.status} ${body}`);
}
console.log(`IndexNow accepted ${urlList.length} URLs with status ${response.status}`);
