/**
 * Rigenera le splash screen iOS (`apple-touch-startup-image`) fotografando la pagina di login.
 *
 * Logo e scritta vengono nascosti lasciando il solo sfondo dell'app: la splash non mostra
 * il marchio (compare una volta sola, con la schermata "Tap to start") e il passaggio
 * splash → pagina non ha salti.
 *
 * Requisiti: dev server attivo (`npm run dev` — oppure passa l'URL di produzione).
 * Uso: node scripts/generate-splashes.mjs [url]
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const APP_URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT_DIR = path.join(process.cwd(), 'public', 'splash');

/** Dimensioni in CSS px dei media query in index.html; il file è `<w*scale>x<h*scale>`. */
const TARGETS = [
  { width: 375, height: 667, scale: 2 }, // iPhone SE
  { width: 375, height: 812, scale: 3 }, // iPhone X / 11 Pro
  { width: 414, height: 896, scale: 2 }, // iPhone XR / 11
  { width: 390, height: 844, scale: 3 }, // iPhone 12 / 13 / 14
  { width: 393, height: 852, scale: 3 }, // iPhone 14 Pro / 15 / 16
  { width: 768, height: 1024, scale: 2 }, // iPad 9.7"
  { width: 834, height: 1194, scale: 2 }, // iPad Air / Pro 11"
  { width: 1024, height: 1366, scale: 2 }, // iPad Pro 12.9"
];

const TAP_BUTTON = 'button[aria-label="Apri form di accesso"]';

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

for (const { width, height, scale } of TARGETS) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(TAP_BUTTON, { state: 'visible', timeout: 60000 });
  // La splash di boot ha `aria-busy` e copre la pagina: aspettiamo che sparisca.
  await page
    .locator('[aria-busy]')
    .waitFor({ state: 'detached', timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(900);

  // Logo e scritta nascosti (occupano comunque lo spazio): la splash resta il solo sfondo.
  // Animazioni infinite congelate: la PNG deve essere deterministica.
  await page.addStyleTag({
    content: `${TAP_BUTTON}, ${TAP_BUTTON} + p { visibility: hidden !important; }
              *, *::before, *::after { animation-play-state: paused !important; }`,
  });
  await page.waitForTimeout(150);

  const file = path.join(OUT_DIR, `splash-${width * scale}x${height * scale}.png`);
  // Il mesh di sfondo è un gradiente morbido: senza quantizzazione la PNG arriva a ~2 MB.
  // 128 colori senza dithering la portano sotto i 100 KB con errore medio < 1% (impercettibile).
  const shot = await page.screenshot();
  const png = await sharp(shot)
    .png({ palette: true, colors: 128, dither: 0, effort: 8, compressionLevel: 9 })
    .toBuffer();
  writeFileSync(file, png);
  console.log(`${path.basename(file)}  ${(png.length / 1024).toFixed(0)} KB`);

  await context.close();
}

await browser.close();
console.log(`\nSplash generate in ${path.relative(process.cwd(), OUT_DIR)}`);
