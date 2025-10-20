// scripts/scrape-bandcamp.js
// usage: node scripts/scrape-bandcamp.js <artist-slug>
// writes: public/discog/<slug>.json

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import vm from 'vm';

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

function extractTitle($) {
  const t = $('meta[property="og:title"]').attr('content')
        || $('h2.trackTitle').first().text()
        || $('title').text();
  return (t || '').trim();
}
function extractArt($) {
  return ($('meta[property="og:image"]').attr('content') || '').trim();
}

/**
 * Try multiple strategies to extract numeric IDs from an album/track page.
 * Returns { albumId?: string, trackId?: string } (both optional).
 */
function extractIds($, html) {
  const out = {};

  // 1) Direct attributes used by Bandcamp on the page body/wrapper (most reliable)
  //    e.g. <body data-tralbumid="2616033392" data-item-id="...">
  const attrAlbum = $('[data-tralbumid]').attr('data-tralbumid');
  if (attrAlbum && /^\d+$/.test(attrAlbum)) out.albumId = String(attrAlbum);

  const attrTrack = $('[data-trackid]').attr('data-trackid');
  if (attrTrack && /^\d+$/.test(attrTrack)) out.trackId = String(attrTrack);

  // 2) TralbumData = {...} script block – evaluate in a safe VM and read .current.id
  //    (Bandcamp includes plain objects here; no DOM access needed)
  if (!out.albumId && !out.trackId) {
    const m = html.match(/TralbumData\s*=\s*({[\s\S]*?});/);
    if (m) {
      try {
        const context = {};
        vm.createContext(context);
        // eslint-disable-next-line no-new-func
        const script = new vm.Script(`TralbumData = ${m[1]}; TralbumData;`);
        const data = script.runInContext(context, { timeout: 50 });
        const maybeId = data?.current?.id ?? data?.id;
        if (maybeId && /^\d+$/.test(String(maybeId))) {
          // TralbumData includes "current.type": "album" | "track"
          const typ = (data?.current?.type || '').toLowerCase();
          if (typ === 'album') out.albumId = String(maybeId);
          else if (typ === 'track') out.trackId = String(maybeId);
          else {
            // fallback: prefer albumId when page URL contains /album/
            out.albumId = String(maybeId);
          }
        }
      } catch {}
    }
  }

  // 3) EmbeddedPlayer hints in the markup (album= or track= in iframe URLs)
  if (!out.albumId) {
    const embAlbum = html.match(/EmbeddedPlayer\/album=(\d+)\//);
    if (embAlbum) out.albumId = embAlbum[1];
  }
  if (!out.trackId) {
    const embTrack = html.match(/EmbeddedPlayer\/track=(\d+)\//);
    if (embTrack) out.trackId = embTrack[1];
  }

  return out;
}

async function scrapeArtist(slug) {
  const base = `https://${slug}.bandcamp.com`;
  const listUrl = `${base}/music`;
  const html = await get(listUrl);
  const $ = cheerio.load(html);

  // STRICT: only album links on THIS artist’s domain
  const links = new Set();
  $('.music-grid .item a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const u = new URL(href, base);
    if (u.hostname === `${slug}.bandcamp.com` && u.pathname.startsWith('/album/')) {
      // strip tracking query params
      u.search = '';
      links.add(u.href);
    }
  });

  // Fallback: scan page for same-domain /album/ links
  if (links.size === 0) {
    $('a[href*="/album/"]').each((_, a) => {
      const href = $(a).attr('href');
      if (!href) return;
      const u = new URL(href, base);
      if (u.hostname === `${slug}.bandcamp.com` && u.pathname.startsWith('/album/')) {
        u.search = '';
        links.add(u.href);
      }
    });
  }

  const items = [];
  for (const url of Array.from(links)) {
    try {
      const page = await get(url);
      const $$ = cheerio.load(page);
      const { albumId, trackId } = extractIds($$, page);
      const title = extractTitle($$) || 'untitled';
      const art   = extractArt($$);

      const item = { title, url, art, album: albumId || '' };
      if (trackId) item.track = trackId; // optional extra for singles

      items.push(item);
      await sleep(300);
    } catch (e) {
      console.warn('album fetch failed:', url, e.message);
    }
  }

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
  console.log(`wrote ${outFile} items: ${payload.items.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });