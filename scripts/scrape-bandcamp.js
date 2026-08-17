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
      'User-Agent': 'aery-records-discog-bot/1.1 (+https://aeryrecords.com)',
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

const findNum = (re, text) => {
  const m = re.exec(text);
  return m ? String(m[1]) : null;
};
const parseJSONSafe = (s) => { try { return JSON.parse(s); } catch { return null; } };

/**
 * Try multiple sources to extract item_type (album|track), ids, and album membership.
 * Priority order:
 *  1) <script id="pagedata" data-blob='...'> (or its innerText JSON)
 *  2) <meta name="bc-page-properties" content='...'>
 *  3) <meta name="twitter:player" content='...EmbeddedPlayer/...'>
 *  4) TralbumData = {...}
 *  5) Any EmbeddedPlayer in raw HTML
 *
 * Returns { type?: 'album'|'track', albumId?: string, trackId?: string, belongsToAlbum: boolean }
 */
function extractIdsAndType(html, $) {
  let type;           // 'album' | 'track'
  let albumId;        // numeric string
  let trackId;        // numeric string
  let belongsToAlbum = false;

  // 1) pagedata blob
  //    <script id="pagedata" data-blob="&quot;{...}&quot;"></script>
  // or <script id="pagedata">{...}</script>
  const pdEl = $('#pagedata');
  if (pdEl.length) {
    let blob = pdEl.attr('data-blob');
    if (blob) {
      // decode HTML entities occasionally present
      blob = blob.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const props = parseJSONSafe(blob);
      if (props && typeof props === 'object') {
        type = props.item_type || type;
        // item_id is the current page's id (album or track)
        if (props.item_type === 'album' && /^\d+$/.test(String(props.item_id))) {
          albumId = String(props.item_id);
        }
        if (props.item_type === 'track' && /^\d+$/.test(String(props.item_id))) {
          trackId = String(props.item_id);
        }
        if (!albumId && props.album_id && /^\d+$/.test(String(props.album_id))) {
          albumId = String(props.album_id);
        }
        if (!trackId && props.track_id && /^\d+$/.test(String(props.track_id))) {
          trackId = String(props.track_id);
        }
        if (props.item_type === 'track' && props.album_id) {
          belongsToAlbum = true;
        }
      }
    } else {
      const text = (pdEl.text() || '').trim();
      const props = parseJSONSafe(text);
      if (props && typeof props === 'object') {
        type = props.item_type || type;
        if (props.item_type === 'album' && /^\d+$/.test(String(props.item_id))) {
          albumId = String(props.item_id);
        }
        if (props.item_type === 'track' && /^\d+$/.test(String(props.item_id))) {
          trackId = String(props.item_id);
        }
        if (!albumId && props.album_id && /^\d+$/.test(String(props.album_id))) {
          albumId = String(props.album_id);
        }
        if (!trackId && props.track_id && /^\d+$/.test(String(props.track_id))) {
          trackId = String(props.track_id);
        }
        if (props.item_type === 'track' && props.album_id) {
          belongsToAlbum = true;
        }
      }
    }
  }

  // 2) bc-page-properties
  if (!albumId && !trackId) {
    const bcPropsStr = $('meta[name="bc-page-properties"]').attr('content');
    if (bcPropsStr) {
      const props = parseJSONSafe(bcPropsStr);
      if (props && typeof props === 'object') {
        type = props.item_type || type;
        if (props.item_type === 'album' && /^\d+$/.test(String(props.item_id))) {
          albumId = String(props.item_id);
        }
        if (props.item_type === 'track' && /^\d+$/.test(String(props.item_id))) {
          trackId = String(props.item_id);
        }
        if (!albumId && props.album_id && /^\d+$/.test(String(props.album_id))) {
          albumId = String(props.album_id);
        }
        if (!trackId && props.track_id && /^\d+$/.test(String(props.track_id))) {
          trackId = String(props.track_id);
        }
        if (props.item_type === 'track' && props.album_id) {
          belongsToAlbum = true;
        }
      }
    }
  }

  // 3) twitter:player
  if (!albumId || !trackId) {
    const tw = $('meta[name="twitter:player"]').attr('content') || '';
    if (tw) {
      const a = findNum(/\/album=(\d+)\b/, tw);
      const t = findNum(/\/track=(\d+)\b/, tw);
      if (!albumId && a) albumId = a;
      if (!trackId && t) trackId = t;
    }
  }

  // 4) TralbumData (VM sandbox)
  if (!albumId && !trackId) {
    const m = html.match(/TralbumData\s*=\s*({[\s\S]*?});/);
    if (m) {
      try {
        const context = {};
        vm.createContext(context);
        const script = new vm.Script(`TralbumData = ${m[1]}; TralbumData;`);
        const data = script.runInContext(context, { timeout: 50 });
        const typ = String(data?.current?.type || '').toLowerCase();
        const id  = data?.current?.id ?? data?.id;

        if (id && /^\d+$/.test(String(id))) {
          if (typ === 'album') albumId = String(id);
          else if (typ === 'track') trackId = String(id);
          else albumId = String(id);
        }
        if (!albumId) {
          const aid = data?.album_id ?? data?.current?.album_id;
          if (aid && /^\d+$/.test(String(aid))) albumId = String(aid);
        }
        if (!trackId) {
          const tid = data?.track_id ?? data?.current?.track_id;
          if (tid && /^\d+$/.test(String(tid))) trackId = String(tid);
        }
        if (!belongsToAlbum && (typ === 'track') && (data?.album_id || data?.current?.album_id)) {
          belongsToAlbum = true;
        }
      } catch {}
    }
  }

  // 5) generic EmbeddedPlayer hints in the raw HTML
  if (!albumId) {
    const embAlbum = findNum(/EmbeddedPlayer\/album=(\d+)\b/, html);
    if (embAlbum) albumId = embAlbum;
  }
  if (!trackId) {
    const embTrack = findNum(/EmbeddedPlayer\/track=(\d+)\b/, html);
    if (embTrack) trackId = embTrack;
  }

  // If still unknown whether a track belongs to an album, infer from canonical + albumId
  if (!belongsToAlbum) {
    const canon = ($('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || '').toLowerCase();
    if (/\/track\//.test(canon) && albumId) belongsToAlbum = true;
  }

  // Determine type if still missing
  if (!type) {
    const canon = ($('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content') || '').toLowerCase();
    if (/\/album\//.test(canon)) type = 'album';
    else if (/\/track\//.test(canon)) type = 'track';
  }

  return { type, albumId, trackId, belongsToAlbum };
}

async function scrapeArtist(slug) {
  const base = `https://${slug}.bandcamp.com`;
  const listUrl = `${base}/music`;
  const html = await get(listUrl);
  const $ = cheerio.load(html);

  // Collect album/track links from this artist only
  const links = new Set();
  function consider(href) {
    if (!href) return;
    const u = new URL(href, base);
    if (u.hostname !== `${slug}.bandcamp.com`) return;          // only this artist
    if (!/^\/(album|track)\//.test(u.pathname)) return;         // only album/track pages
    u.searchParams.delete('from');
    u.searchParams.delete('action');
    u.hash = '';
    links.add(u.href);
  }
  $('.music-grid .item a').each((_, a) => consider($(a).attr('href')));
  $('a[href*="/album/"], a[href*="/track/"]').each((_, a) => consider($(a).attr('href')));

  const raw = [];
  for (const url of Array.from(links)) {
    try {
      const page = await get(url);
      const $$ = cheerio.load(page);

      // Ensure canonical stays on this artist
      const og = $$('meta[property="og:url"]').attr('content') || $$('link[rel="canonical"]').attr('href');
      if (og) {
        try { if (new URL(og).hostname !== `${slug}.bandcamp.com`) continue; } catch {}
      }

      const { type, albumId, trackId, belongsToAlbum } = extractIdsAndType(page, $$);
      const isTrackPage = /\/track\//.test(new URL(url).pathname);
      const title = extractTitle($$) || 'untitled';
      const art   = extractArt($$);

      // Skip track pages that belong to an album
      if (isTrackPage && belongsToAlbum) {
        await sleep(150);
        continue;
      }

      const item = { title, url, art, album: albumId || '' };
      if (!albumId && trackId) item.track = trackId; // true singles only
      raw.push(item);

      await sleep(220);
    } catch (e) {
      console.warn('album/track fetch failed:', url, e.message);
    }
  }

  // Dedupe by album id; keep first occurrence. Singles (no album) are kept.
  const byAlbum = new Map();
  const singles = [];
  for (const it of raw) {
    if (it.album) {
      if (!byAlbum.has(it.album)) byAlbum.set(it.album, it);
    } else {
      singles.push(it);
    }
  }
  const items = [...byAlbum.values(), ...singles];

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
  const outFile = path.join(outDir, `${slug.replace(/[^a-z0-9]/gi, '')}.json`);
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2));
  console.log(`wrote ${outFile} items: ${payload.items.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });