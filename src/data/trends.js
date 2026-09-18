import { createHash } from 'node:crypto';
import { newsEntries, publishedNews, contentDigest } from './news.js';
import { trendSnapshots } from './trendSnapshots.js';

export function snapshotDigest(snapshot) {
  const { approval, ...content } = snapshot;
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

// Each immutable snapshot is approved independently. The newest snapshot must
// cover the exact published corpus: adding, editing or removing news blocks a
// build until a corresponding analysis is reviewed and appended. Old snapshots
// retain their original corpus hashes, copy and source-date scope.
export function approvedTrendSnapshots(snapshots = trendSnapshots, entries = newsEntries) {
  const articles = publishedNews(entries);
  if (!snapshots.length && !articles.length) return [];
  if (!snapshots.length) throw new Error('Annual analysis review required');
  const ids = new Set();
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const text = value => typeof value === 'string' && value.trim().length > 0;
  for (const s of snapshots) {
    if (!/^[a-z0-9-]+$/.test(s.id ?? '') || ids.has(s.id) || !Number.isInteger(s.year) ||
        !date(s.asOf) || !date(s.analysisUpdated) || s.year > Number(s.asOf.slice(0, 4)) || s.analysisUpdated < s.asOf ||
        ![s.label, s.thesis, s.takeaway, s.coverage, s.comparison].every(text) ||
        !Array.isArray(s.axes) || s.axes.length !== 3 || !s.axes.every(a => text(a.title) && text(a.text) && articles.some(e => e.slug === a.articleSlug)) ||
        !Array.isArray(s.sourceIds) || !s.sourceIds.length || !s.sourceIds.every(text) ||
        !Array.isArray(s.entryDigests) || s.articleCount !== s.entryDigests.length || new Set(s.entryDigests).size !== s.entryDigests.length ||
        !s.entryDigests.every(d => /^[a-f0-9]{64}$/.test(d)) ||
        s.approval?.decision !== 'approved' || !text(s.approval.reference) || !date(s.approval.date) ||
        s.approval.contentDigest !== snapshotDigest(s)) throw new Error(`Invalid or unapproved annual snapshot: ${s.id}`);
    ids.add(s.id);
  }
  const latest = [...snapshots].sort((a, b) => b.asOf.localeCompare(a.asOf) || b.analysisUpdated.localeCompare(a.analysisUpdated) || b.id.localeCompare(a.id))[0];
  const expected = entries.filter(e => e.status === 'published').map(contentDigest).sort();
  if (JSON.stringify([...latest.entryDigests].sort()) !== JSON.stringify(expected) ||
      articles.some(e => e.sourceDate > latest.asOf) ||
      JSON.stringify([...new Set(articles.flatMap(e => e.sourceIds ?? []))].sort()) !== JSON.stringify([...latest.sourceIds].sort())) {
    throw new Error('Stale annual analysis: review and append a snapshot for the changed news corpus');
  }
  return snapshots;
}
