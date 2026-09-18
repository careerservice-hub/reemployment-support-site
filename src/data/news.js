import { createHash } from 'node:crypto';
import { approvedNews } from './approvedNews.js';

export const newsTopics = ['재취업지원', '중장년고용', '퇴직/전직지원', '기업경력지원'];
// Never store personal data or applicant stories here,
// even in drafts or anonymized form. Approval evidence stays outside this repo.
export const newsEntries = approvedNews;

export function contentDigest(entry) {
  const { approval, status, ...content } = entry;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export function publishedNews(entries = newsEntries) {
  const ids = new Set();
  const slugs = new Set();
  return entries.filter(entry => entry.status === 'published').map(entry => {
    const fail = () => { throw new Error(`Invalid or unapproved news entry: ${entry.slug}`); };
    const text = value => typeof value === 'string' && value.trim().length > 0;
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!Number.isSafeInteger(entry.id) || entry.id < 1 || ids.has(entry.id) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug ?? '') || slugs.has(entry.slug) ||
        !newsTopics.includes(entry.category) || !text(entry.title) || !text(entry.summary) ||
        !text(entry.source) || !text(entry.sourceTitle) || !date(entry.sourceDate) ||
        !date(entry.publishedAt) || !date(entry.modifiedAt) || !date(entry.checkedAt) ||
        entry.modifiedAt < entry.publishedAt || !Array.isArray(entry.sections) || !entry.sections.length ||
        !entry.sections.every(section => text(section.heading) && Array.isArray(section.paragraphs) && section.paragraphs.length && section.paragraphs.every(text))) fail();
    let sourceUrl;
    try { sourceUrl = new URL(entry.sourceUrl); } catch { fail(); }
    if (sourceUrl.protocol !== 'https:' || sourceUrl.username || sourceUrl.password) fail();
    // A boolean is not publication approval: bind an explicit per-item decision
    // to the exact content. Any content edit requires fresh approval.
    if (entry.approval?.decision !== 'approved' || !text(entry.approval.reference) ||
        !date(entry.approval.date) || entry.approval.contentDigest !== contentDigest(entry) ||
        entry.approval.noPersonalData !== true || entry.approval.noApplicantStories !== true) fail();
    ids.add(entry.id); slugs.add(entry.slug);
    return { ...entry, href: `/news-trends/${entry.slug}/`, date: entry.sourceDate,
      body: [entry.legalStage, ...entry.sections.map(section => `${section.heading} ${section.paragraphs.join(' ')}`)].join(' ') };
  }).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
}
