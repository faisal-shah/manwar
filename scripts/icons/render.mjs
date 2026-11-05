// Renders the app icons and the README logo from the brand definition
// (src/ui/brand.ts) with the bundled Reem Kufi font, so they match the
// in-app logo exactly. Run from the repo root: node scripts/icons/render.mjs
// Writes public/{favicon-64,icon-192,icon-512,icon-maskable-512}.png and docs/logo.png.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const brand = readFileSync('src/ui/brand.ts', 'utf8');
const pick = (name) => brand.match(new RegExp(`export const ${name} = '([^']+)'`))[1];
const [AR, EN, MEANING] = [pick('NAME_AR'), pick('NAME_EN'), pick('MEANING')];
// Fonts are inlined as data URLs: a page opened with setContent may not load file:// fonts.
const dataUrl = (path) => `data:font/woff2;base64,${readFileSync(resolve(path)).toString('base64')}`;
const font = dataUrl('node_modules/@fontsource/reem-kufi/files/reem-kufi-arabic-700-normal.woff2');
const latin = dataUrl('node_modules/@fontsource/newsreader/files/newsreader-latin-400-normal.woff2');
const latinItalic = dataUrl('node_modules/@fontsource/newsreader/files/newsreader-latin-400-italic.woff2');

const css = `
@font-face { font-family: RK; src: url(${font}) format('woff2'); font-weight: 700; }
@font-face { font-family: NR; src: url(${latin}) format('woff2'); }
@font-face { font-family: NR; font-style: italic; src: url(${latinItalic}) format('woff2'); }
html, body { margin: 0; background: transparent; }
.tile { display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #dce8f3, #d2e3e6); }
.ar { font-family: RK; font-weight: 700; direction: rtl; color: #0a0a0a; white-space: nowrap; }
`;

/** Icon: the calligraphy centred on the app's sky gradient. `fill` is the share of the tile the word spans. */
function iconHtml(size, { radius, fill }) {
  return `<style>${css}</style><div class="tile" style="width:${size}px;height:${size}px;border-radius:${radius * size}px">
  <span class="ar" style="font-size:${size * fill * 0.6}px;line-height:1.5;margin-top:-${size * 0.02}px">${AR}</span></div>`;
}

function logoHtml() {
  return `<style>${css}
  .lock { display:inline-flex; flex-direction:column; align-items:center; padding: 24px 48px; }
  .en { font-family: NR; font-size: 54px; letter-spacing: .04em; color:#0a0a0a; line-height:1.1; }
  .mean { font-family: NR; font-style: italic; font-size: 30px; color:#5c6165; margin-top: 6px; }
  </style><div class="lock"><span class="ar" style="font-size:200px;line-height:1.35">${AR}</span><span class="en">${EN}</span><span class="mean">${MEANING}</span></div>`;
}

const b = await chromium.launch();
const ICON_FONTS = ['700 40px RK'];
const LOGO_FONTS = ['700 40px RK', '400 40px NR', 'italic 400 40px NR'];
async function shot(html, out, w, h, omitBackground = true, fonts = ICON_FONTS) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html);
  const ok = await p.evaluate(async (specs) => {
    for (const f of specs) await document.fonts.load(f, 'مَنْوَر Manwar');
    return specs.every((f) => document.fonts.check(f, 'مَنْوَر Manwar'));
  }, fonts);
  if (!ok) throw new Error(`fonts did not load for ${out}`);
  const el = await p.$('.tile, .lock');
  await el.screenshot({ path: out, omitBackground });
  await p.close();
  console.log(out);
}
await shot(iconHtml(64, { radius: 0.22, fill: 0.92 }), 'public/favicon-64.png', 64, 64);
await shot(iconHtml(192, { radius: 0.22, fill: 0.82 }), 'public/icon-192.png', 192, 192);
await shot(iconHtml(512, { radius: 0.22, fill: 0.82 }), 'public/icon-512.png', 512, 512);
// Maskable: full-bleed square, word inside the central safe zone.
await shot(iconHtml(512, { radius: 0, fill: 0.6 }), 'public/icon-maskable-512.png', 512, 512, false);
await shot(logoHtml(), 'docs/logo.png', 1200, 700, true, LOGO_FONTS);
await b.close();
