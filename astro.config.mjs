import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { publishedNews } from './src/data/news.js';

// Update only when the page's searchable content changes, not for visual-only edits.
const contentLastModified = {
  '/': '2026-09-07',
  '/approach/': '2026-09-07',
  '/business-consulting/': '2026-09-16',
  '/business-consulting-guide/': '2026-08-27',
  '/career-planning/': '2026-09-07',
  '/career-support/': '2026-08-27',
  '/contact/': '2026-07-30',
  '/faq/': '2026-09-07',
  '/news-trends/': '2026-09-17',
  '/policy-updates/': '2026-09-16',
  '/policy-updates/excellent-companies-2026/': '2026-09-16',
  '/policy-updates/labor-culture-employment-retention-2026/': '2026-09-16',
  '/policy-updates/enterprise-course-budget-2027/': '2026-09-07',
  '/policy-updates/joint-consulting-pilot-2026/': '2026-08-27',
  '/policy-updates/mandatory-employer-expansion-2026/': '2026-08-27',
  '/policy-updates/naver-it-joint-consulting-2026/': '2026-08-20',
  '/policy-updates/reemployment-service-reform-2026/': '2026-07-14',
  '/privacy/': '2026-07-30',
  '/process/': '2026-09-07',
  ...Object.fromEntries(publishedNews().map(article => [article.href, article.modifiedAt])),
};

export default defineConfig({
  site: 'https://www.careerservice.co.kr',
  base: '/',
  devToolbar: { enabled: false },
  integrations: [sitemap({
    serialize(item) {
      const pathname = new URL(item.url).pathname;
      const lastmod = contentLastModified[pathname];
      return lastmod ? { ...item, lastmod: new Date(`${lastmod}T00:00:00+09:00`) } : item;
    },
  })],
});
