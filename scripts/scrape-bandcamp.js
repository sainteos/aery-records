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
function findAlbumFromTrack($$, base) {
  // Lots of track pages have “from <album> by …” with a link to /album/...
  // We take the first same-host /album/ link we see in the main content.
  let albumHref = null;
  $$('.fromAlbum a[href^="/album/"], a[href^="/album/"]').each((_, a) => {
    if (albumHref) return;
    const href = $$(a).attr('href');
    try {
      const u = new URL(href, base);
      albumHref = u.toString();
    } catch(_) {}
  });
  return albumHref;
}
async function scrapeArtist(slug) {
  const base = `https://${slug}.bandcamp.com`;
  const listUrl = `${base}/music`;
  const html = await get(listUrl);
  const $ = cheerio.load(html);

  // Gather album/track links on the same host only (strip tracking params)
  const host = `${slug}.bandcamp.com`;
  const links = new Set();

  const addLink = (href) => {
    if (!href) return;
    try {
      const u = new URL(href, base);
      if (u.hostname !== host) return;                // same artist subdomain only
      if (!/^\/(album|track)\//.test(u.pathname)) return; // album or track pages only
      u.search = '';
      u.hash = '';
      links.add(u.toString());
    } catch (_) {}
  };

  // preferred grid
  $('.music-grid .item a[href]').each((_, a) => addLink($(a).attr('href')));
  // fallback scan
  $('a[href*="/album/"], a[href*="/track/"]').each((_, a) => addLink($(a).attr('href')));

  const items = [];
  const queue = Array.from(links);  // start with discovered links
  const seen  = new Set();          // URLs we have processed (or decided to skip)

  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);

    try {
      const u = new URL(url);
      if (u.hostname !== host) continue; // double safety

      const page = await get(u.href);
      const $$   = cheerio.load(page);

      // If this is a track page and it links “from” an album, collapse into the album
      const isTrack = /^\/track\//.test(u.pathname);
      if (isTrack) {
        const albumUrl = findAlbumFromTrack($$, base);
        if (albumUrl) {
          // collapse: enqueue the album, skip the track
          if (!seen.has(albumUrl) && !queue.includes(albumUrl)) queue.push(albumUrl);
          continue;
        }
        // Otherwise: treat as a single (keep the track page)
      }

      // Prefer albumId for embeds, but don't drop the item if missing
      const albumId = extractAlbumId(page) || '';

      const title = extractTitle($$) || 'untitled';
      const art   = extractArt($$);

      items.push({ title, url: u.href, art, album: albumId });

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