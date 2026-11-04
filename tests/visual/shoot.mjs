// Screenshot the running dev server (demo mode against the emulators).
// Usage: node tests/visual/shoot.mjs <out.png> [query] [steps.json]
//   query: extra URL params, e.g. "now=2026-11-04T11:44"
//   steps: JSON array of actions run before the shot:
//     {"click": "<selector>"}, {"text": "<visible text to click>"}, {"wait": ms}, {"press": "Escape"}
// Env: W, H (viewport, default 1600x1000), DPR (default 1), BASE (default http://localhost:5173), WAIT (ms after load, default 1500),
//      DEMO (demo household name, default "shots"; each name is its own emulator household)
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const [out, query = '', stepsFile] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tests/visual/shoot.mjs <out.png> [query] [steps.json]');
  process.exit(2);
}
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 1000);
const base = process.env.BASE ?? 'http://localhost:5173';
const steps = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${base}/?demo=${process.env.DEMO ?? 'shots'}&${query}`);
await page.waitForSelector('.shell', { timeout: 20000 });
await page.waitForTimeout(Number(process.env.WAIT ?? 1500));
for (const s of steps) {
  if (s.click) await page.click(s.click);
  if (s.text) await page.getByText(s.text, { exact: true }).first().click();
  if (s.press) await page.keyboard.press(s.press);
  await page.waitForTimeout(s.wait ?? 500);
}
await page.screenshot({ path: out });
await browser.close();
if (errors.length) console.error('page errors:\n' + errors.join('\n'));
console.log(out);
