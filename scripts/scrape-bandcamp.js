// scripts/scrape-bandcamp.js
// Node 18+ (native fetch). If you prefer axios/cheerio, not required here.

import fs from 'node:fs/promises';
import path from 'node:path';

const ARTISTS = [
  { slug: 'nixiehalcyon', base: 'https://nixiehalcyon.bandcamp.com' },
  { slug: 'partyboob420', base: 'https://partyboob420.bandcamp.com' },
];

// ---------- helpers
async function getText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'aery-scraper/1.0' } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  return await res.text();
}

// find album links on /music (best-effort; Bandcamp markup can vary)
function parseAlbumLinksFromMusic(html, base) {
  const links = new Set();

  // common patterns
  const regexes = [
    /<a\s+[^>]*href="(\/album\/[^"#?]+)"[^>]*>/gi,  // /album/slug
    /<a\s+[^>]*href="(https:\/\/[^"]+\/album\/[^"#?]+)"[^>]*>/gi
  ];

  for (const re of regexes) {
    let m;
    while ((m = re.exec(html)) !== null) {
      const href = m[1].startsWith('http') ? m[1] : (base + m[1]);
      links.add(href);
    }
  }
  return Array.from(links);
}

// extract album_id + title from an album page
function parseAlbumData(html) {
  // 1) Try to find "album_id" explicitly
  let m = html.match(/"album_id"\s*:\s*(\d+)/);
  if (!m) m = html.match(/album_id\s*:\s*(\d+)/);
  const album_id = m ? Number(m[1]) : null;

  // title fallbacks: <meta property="og:title">, <title>, or JSON blobs
  let title =
    (html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1]) ||
    (html.match(/<title>([^<]+)<\/title>/i)?.[1]) ||
    null;

  if (title) {
    // bandcamp often appends "| Artist Name" — trim that
    title = title.replace(/\s*\|\s*[^|]+$/,'').trim();
  }

  return { album_id, title };
}

async function scrapeArtist({ slug, base }) {
  const musicUrl = `${base}/music`;
  const html = await getText(musicUrl);
  const albumLinks = parseAlbumLinksFromMusic(html, base);

  const out = [];
  for (const url of albumLinks) {
    try {
      const page = await getText(url);
      const { album_id, title } = parseAlbumData(page);

      if (!album_id) {
        console.warn(`[warn] no album_id for ${url}`);
        continue;
      }

      // optional: try to get cover image (og:image)
      const art =
        page.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i)?.[1] || null;

      out.push({
        url,
        title: title || 'untitled',
        album: album_id,
        art
      });
    } catch (err) {
      console.warn(`[warn] failed ${url}: ${err.message}`);
    }
  }

  // sort newest-ish first by guessing from URL order
  // (Bandcamp /music is usually newest first; keep order)
  return out;
}

async function main() {
  const outDir = path.join(process.cwd(), 'public', 'discog');
  await fs.mkdir(outDir, { recursive: true });

  for (const artist of ARTISTS) {
    const items = await scrapeArtist(artist);
    const payload = {
      artist: artist.slug,
      updated: new Date().toISOString(),
      items
    };
    const file = path.join(outDir, `${artist.slug}.json`);
    await fs.writeFile(file, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[ok] wrote ${file} (${items.length} items)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});