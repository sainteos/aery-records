// scripts/update-catalog.js
// merges all public/discog/*.json into public/discog/catalog.json
// preserves any manually-added fields (catalogNo, format) on existing entries
// adds stub entries (with releaseDate) for newly-discovered releases
// auto-assigns catalogNo to new entries, in release-date order — but never
// reassigns a catalogNo that's already been written, so numbers stay stable
// across runs even if an older release is discovered later

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const discogDir  = path.resolve(__dirname, '..', 'public', 'discog');
const catalogFile = path.join(discogDir, 'catalog.json');

// slug → display name (keep in sync with index.html's homepage script)
const ARTIST_NAMES = {
  nixiehalcyon: 'nixie halcyon',
  partyboob420: '파티 가슴 (420)ＰＡＲＴＹＢＯＯＢ',
  yoshidas: 'yoshi das',
};

async function readJsonSafe(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const existing = (await readJsonSafe(catalogFile)) || { items: [] };
  const byUrl = new Map(existing.items.map(it => [it.url, it]));

  const files = (await fs.readdir(discogDir)).filter(
    f => f.endsWith('.json') && f !== 'catalog.json'
  );

  let added = 0;
  let backfilled = 0;
  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    const data = await readJsonSafe(path.join(discogDir, file));
    const items = Array.isArray(data?.items) ? data.items : [];

    for (const it of items) {
      if (!it.url) continue;

      const existing = byUrl.get(it.url);
      if (existing) {
        // entry already exists — never touch catalogNo/format (manual fields),
        // but DO backfill releaseDate (and other scraped fields) if missing,
        // so a scraper fix like adding releaseDate can reach entries that
        // were created before that field existed.
        if (!existing.releaseDate && it.releaseDate) {
          existing.releaseDate = it.releaseDate;
          backfilled++;
        }
        if (!existing.art && it.art) existing.art = it.art;
        if (!existing.album && it.album) existing.album = it.album;
        if (!existing.track && it.track) existing.track = it.track;
        continue;
      }

      byUrl.set(it.url, {
        url: it.url,
        title: it.title || 'untitled',
        artist: ARTIST_NAMES[slug] || slug,
        art: it.art || '',
        album: it.album || '',
        track: it.track || '',
        releaseDate: it.releaseDate || '',
        catalogNo: '',   // ← auto-assigned below, or fill in manually
        format: '',      // ← fill in manually
      });
      added++;
    }
  }

  const items = Array.from(byUrl.values());

  // --- auto-assign catalogNo ---
  // Never touch an item that already has one. For items that don't, assign
  // the next sequential aery-XXX, in release-date order (oldest gets the
  // lowest new number). Items with no usable date sort after dated ones,
  // in whatever order they were merged.
  const assignedNums = items
    .map(it => it.catalogNo && /^aery-(\d+)$/.exec(it.catalogNo))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10));
  let nextNum = assignedNums.length ? Math.max(...assignedNums) + 1 : 1;

  const unassigned = items.filter(it => !it.catalogNo);
  unassigned.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : NaN;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : NaN;
    if (!isNaN(da) && !isNaN(db)) return da - db; // oldest first
    if (!isNaN(da)) return -1;
    if (!isNaN(db)) return 1;
    return 0;
  });
  for (const it of unassigned) {
    it.catalogNo = `aery-${String(nextNum).padStart(3, '0')}`;
    nextNum++;
  }

  // --- final sort for display: newest release first ---
  items.sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : NaN;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : NaN;
    if (!isNaN(da) && !isNaN(db)) return db - da;
    if (!isNaN(da)) return -1;
    if (!isNaN(db)) return 1;
    return 0;
  });

  const merged = { items };
  await fs.writeFile(catalogFile, JSON.stringify(merged, null, 2));
  console.log(`catalog.json: ${merged.items.length} total, ${added} new stub(s) added, ${backfilled} releaseDate backfill(s)`);
  if (added > 0) {
    console.log('ⓘ new release(s) auto-numbered — fill in format manually when convenient:');
    for (const it of merged.items) {
      if (!it.format) console.log(`  - ${it.catalogNo} — ${it.artist} — ${it.title} (${it.url})`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });