import { readFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const base = 'https://www.careerservice.co.kr';
const sitemap = await readFile(path.join(dist, 'sitemap-0.xml'), 'utf8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const lastModifiedEntries = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
const failures = [];
let webpageCount = 0;
let breadcrumbCount = 0;
if (lastModifiedEntries.length !== urls.length) failures.push(`sitemap lastmod coverage ${lastModifiedEntries.length}/${urls.length}`);

function outputPath(url) {
  const pathname = new URL(url).pathname;
  return pathname === '/' ? path.join(dist, 'index.html') : path.join(dist, pathname, 'index.html');
}
function walk(value, visit) {
  if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
  else if (value && typeof value === 'object') {
    visit(value);
    Object.values(value).forEach((item) => walk(item, visit));
  }
}

for (const url of urls) {
  const html = await readFile(outputPath(url), 'utf8');
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) failures.push(`${url}: expected one JSON-LD script, found ${scripts.length}`);
  let data;
  try { data = JSON.parse(scripts[0]?.[1] || ''); }
  catch (error) { failures.push(`${url}: invalid JSON-LD (${error.message})`); continue; }
  const nodes = [];
  walk(data, (node) => { if (node['@type']) nodes.push(node); });
  const pageNode = nodes.find((node) => ['WebPage', 'CollectionPage'].includes(node['@type']));
  if (!pageNode) failures.push(`${url}: missing WebPage/CollectionPage`);
  else webpageCount += 1;
  if (new URL(url).pathname !== '/') {
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');
    if (!breadcrumb) failures.push(`${url}: missing BreadcrumbList`);
    else {
      breadcrumbCount += 1;
      if (!Array.isArray(breadcrumb.itemListElement) || breadcrumb.itemListElement.length < 2) failures.push(`${url}: incomplete breadcrumbs`);
    }
  }
  if (new URL(url).pathname === '/policy-updates/') {
    const collection = nodes.find((node) => node['@type'] === 'CollectionPage');
    const itemList = nodes.find((node) => node['@type'] === 'ItemList');
    if (collection?.hasPart?.length !== 5) failures.push('/policy-updates/: CollectionPage.hasPart must contain 5 articles');
    if (itemList?.numberOfItems !== 5) failures.push('/policy-updates/: ItemList must contain 5 articles');
  }
}

const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8');
const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
const indexNowKey = '67fc374d97eb7b248b8ff08e40a3a8ad';
const keyText = (await readFile(path.join(dist, `${indexNowKey}.txt`), 'utf8')).trim();
if (!robots.includes('Allow: /') || !robots.includes('sitemap-index.xml')) failures.push('robots.txt is incomplete');
if (!llms.includes('재취업지원서비스') || !llms.includes('기업컨설팅')) failures.push('llms.txt is incomplete');
if (keyText !== indexNowKey) failures.push('IndexNow key file mismatch');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Search/AI readiness passed: ${urls.length} URLs, ${webpageCount} page schemas, ${breadcrumbCount} breadcrumbs`);
