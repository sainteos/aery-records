// scripts/generate-galleries.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTISTS = ["nixiehalcyon", "partyboob420", "yoshidas"]; // add more

async function main() {
  const baseDir = path.join(__dirname, "..", "public", "img", "artists");
  const outDir  = path.join(__dirname, "..", "public", "galleries");
  await fs.mkdir(outDir, { recursive: true });

  for (const slug of ARTISTS) {
    const folder = path.join(baseDir, slug);

    let files = [];
    try {
      files = await fs.readdir(folder);
    } catch {
      console.warn(`No folder found for ${slug}`);
      continue;
    }

    const images = files.filter(f =>
      /\.(png|jpg|jpeg|gif|webp)$/i.test(f)
    ).map(f => `/img/artists/${slug}/${f}`);

    const payload = { slug, images };
    const outFile = path.join(outDir, `${slug}.json`);
    await fs.writeFile(outFile, JSON.stringify(payload, null, 2));

    console.log(`Generated gallery for ${slug}: ${images.length} images`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });