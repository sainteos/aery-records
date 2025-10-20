// scripts/scrape-bandcamp.js
// usage: node scripts/scrape-bandcamp.js nixiehalcyon
// writes: discog/<slug>.json

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'aery-records-discog-bot/1.0 (+https://aeryrecords.com)',
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return await res.text();
}

// Try to extract the numeric album id from an album page
function extractAlbumId(html) {
  // 1) From Bandcamp’s TralbumData JSON
  //   var TralbumData = {... "current": {"id": 2616033392, ...}, ...}
  const m1 = html.match(/TralbumData\s*=\s*({[\s\S]*?});/);
  if (m1) {
    try {
      const obj = JSON.parse(m1[1]
        // Bandcamp sometimes includes single quotes or trailing commas; clean a bit:
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      );
      // Prefer current.id; fallback to id
      const id = obj?.current?.id ?? obj?.id;
      if (id && String(id).match(/^\d+$/)) return String(id);
    } catch (_) {}
  }
  // 2) From an EmbeddedPlayer URL present in the markup
  const m2 = html.match(/EmbeddedPlayer\/album=(\d+)\//);
  if (m2) return m2[1];
  return null;
}

function extractTitle($) {
  const t = $('meta[property="og:title"]').attr('content')
       || $('h2.trackTitle').text()
       || $('title').text();
  return (t || '').trim();
}
function extractArt($) {
  return $('meta[property="og:image"]').attr('content') || '';
}

async function scrapeArtist(slug) {
  const base = `https://${slug}.bandcamp.com`;
  const listUrl = `${base}/music`;
  const html = await get(listUrl);
  const $ = cheerio.load(html);

  // Gather album links from the grid; fallback to any /album/ link
  const links = new Set();
  $('.music-grid .item a[href*="/album/"]').each((_, a) => {
    const href = $(a).attr('href');
    if (href) links.add(new URL(href, base).href);
  });
  if (links.size === 0) {
    $('a[href*="/album/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (href) links.add(new URL(href, base).href);
    });
  }

  const items = [];
  for (const url of Array.from(links)) {
    try {
      const page = await get(url);
      const $$ = cheerio.load(page);
      const albumId = extractAlbumId(page);
      const title   = extractTitle($$) || 'untitled';
      const art     = extractArt($$);
      items.push({ title, url, art, album: albumId || '' });
      // be polite
      await sleep(400);
    } catch (e) {
      console.warn('album fetch failed:', url, e.message);
    }
  }
  // sort newest first if Bandcamp exposes publish date in TralbumData (optional)
  // items.sort(...)

  return { items };
}

async function main() {
  const slug = (process.argv[2] || '').trim().toLowerCase();
  if (!slug) {
    console.error('usage: node scripts/scrape-bandcamp.js <artist-slug>');
    process.exit(1);
  }
  const outDir = path.resolve(__dirname, '..', 'public', 'discog');
  await fs.mkdir(outDir, { recursive: true });

  const payload = await scrapeArtist(slug);
  const outFile = path.join(outDir, `${slug}.json`);
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2));
  console.log('wrote', outFile, `items: ${payload.items.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });