/**
 * Rigenera le splash screen iOS (`apple-touch-startup-image`) con uno sfondo NEUTRO.
 *
 * Perché neutro: la splash nativa iOS è un'immagine statica e non può seguire lo sfondo
 * scelto dall'utente. Uno sfondo scuro neutro (senza marchio e senza aloni colorati)
 * riduce lo "stacco" visivo con qualsiasi tema scelto in app; subito dopo subentra la
 * splash di boot, che invece usa già lo sfondo dell'utente.
 *
 * Rigenera i PNG elencati in `index.html` (`<link rel="apple-touch-startup-image">`).
 * Nessuna dipendenza dal dev server: usa solo `sharp`.
 *
 * Uso: node scripts/generate-splashes.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'public', 'splash');

/** Dimensioni in pixel dei file `<w*scale>x<h*scale>` (media query in index.html). */
const TARGETS = [
  [750, 1334],   // iPhone SE
  [1125, 2436],  // iPhone X / 11 Pro
  [828, 1792],   // iPhone XR / 11
  [1170, 2532],  // iPhone 12 / 13 / 14
  [1179, 2556],  // iPhone 14 Pro / 15 / 16
  [1536, 2048],  // iPad 9.7"
  [1668, 2388],  // iPad Air / Pro 11"
  [2048, 2732],  // iPad Pro 12.9"
];

/**
 * Sfondo neutro: gradiente radiale scuro quasi impercettibile.
 * Colori scelti vicini al centro dell'insieme dei temi dell'app, senza tinta
 * (grigio neutro) così non "stona" con nessuno sfondo selezionabile.
 */
function neutralSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <radialGradient id="g" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#17171c"/>
      <stop offset="60%" stop-color="#101014"/>
      <stop offset="100%" stop-color="#0b0b0e"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`;
}

mkdirSync(OUT_DIR, { recursive: true });

for (const [w, h] of TARGETS) {
  // Gradiente morbido → basta una palette ridotta per tenere la PNG leggera (< 100 KB).
  const png = await sharp(Buffer.from(neutralSvg(w, h)))
    .png({ palette: true, colors: 64, dither: 0, effort: 8, compressionLevel: 9 })
    .toBuffer();
  const file = path.join(OUT_DIR, `splash-${w}x${h}.png`);
  writeFileSync(file, png);
  console.log(`${path.basename(file)}  ${(png.length / 1024).toFixed(0)} KB`);
}

console.log(`\nSplash neutre generate in ${path.relative(process.cwd(), OUT_DIR)}`);
