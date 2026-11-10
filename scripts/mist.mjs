// Draws the halftone mist behind each screen's heading, with qwedai.tech's own
// drawing code, so the dashboard and the site print the same mist. Each screen
// has two pictures: dawn for the light theme and a lake at dusk for the dark
// one. Every picture has its own seed, from the screen's key, so no two
// screens share one.
//
// The pictures are committed in src/assets/mist/, so building the dashboard
// needs none of this. To draw them again, with a checkout of QweD-frontend
// whose dependencies are installed (it provides the drawing code and sharp):
//
//   node scripts/mist.mjs <path to QweD-frontend>
//
// Node 22.18 or later runs the site's TypeScript file as it is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const site = process.argv[2];
if (!site) {
  console.error('Usage: node scripts/mist.mjs <path to QweD-frontend>');
  process.exit(1);
}
const { drawTexture, seedOf } = await import(pathToFileURL(path.resolve(site, 'src/data/texture-draw.ts')).href);
const sharp = createRequire(path.resolve(site, 'package.json'))('sharp');

// One key per screen with a heading on mist. The Overview has the lake scene
// instead, and a record's heading carries the record's own facts.
const SCREENS = ['ledger', 'agents', 'agent', 'batch', 'keys', 'members', 'security', 'server'];
const W = 1800;
const H = 440;

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/mist');
mkdirSync(out, { recursive: true });

// The light moves a little from screen to screen, with the screen's seed.
const nudge = (n, span) => ((n % 1000) / 1000 - 0.5) * span;
const seeds = new Set();

for (const screen of SCREENS) {
  for (const look of ['dawn', 'lake']) {
    const seed = seedOf(`dashboard-${screen}:${look}`);
    if (seeds.has(seed)) throw new Error(`Two pictures share seed ${seed}`);
    seeds.add(seed);
    const dawn = look === 'dawn';
    // The heading sits on the left, in a clear patch; the light comes from the
    // top right in the morning and the bottom right at dusk, as on the site.
    const spec = {
      look,
      w: W,
      h: H,
      seed,
      cell: 9,
      clear: dawn ? [0.22, 0.5, 0.26, 0.5] : [0.26, 0.5, 0.3, 0.55],
      dots: 0.6,
      level: dawn ? 0.6 : 0.55,
      glow: dawn ? [0.86 + nudge(seed, 0.16), -0.1, 0.4] : [0.82 + nudge(seed, 0.16), 1.1, 0.45],
    };
    const px = Buffer.from(drawTexture(spec));
    const file = path.join(out, `${screen}-${look}.webp`);
    const body = await sharp(px, { raw: { width: W, height: H, channels: 3 } })
      .webp({ quality: dawn ? 74 : 80, effort: 4 })
      .toBuffer();
    writeFileSync(file, body);
    console.log(`${path.basename(file)} ${(body.length / 1024).toFixed(0)} KB`);
  }
}
