import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { transform } from 'lightningcss';
import { describe, expect, it } from 'vitest';

/**
 * Text on a profile or category color takes the color's ink through
 * relative color syntax, which older Android WebViews lack. There a
 * declaration with var() in it is not dropped at parse time but fails when
 * computed, and the text inherits the page's color instead of the white
 * fallback. The production minifier also merges `color: #fff; color: lch(...)`
 * into the last one. So the ink lives in an @supports block, and the build
 * keeps the plain color beside it.
 */

const SRC = join(import.meta.dirname, '../../src');
const SUPPORTS = '@supports (color:lch(from red l c h)){';

const cssFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );

/** The file as `vite build` writes it: minified by Lightning CSS for Vite's default target (Chrome 111). */
const built = (file: string) =>
  transform({ filename: file, code: readFileSync(file), minify: true, targets: { chrome: 111 << 16 } }).code.toString();

/** `css` without its ink @supports blocks. */
function outsideSupports(css: string): string {
  let out = '';
  let i = 0;
  for (let at = css.indexOf(SUPPORTS); at !== -1; at = css.indexOf(SUPPORTS, i)) {
    out += css.slice(i, at);
    let depth = 0;
    let j = at + SUPPORTS.length - 1;
    do {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
      j++;
    } while (depth > 0);
    i = j;
  }
  return out + css.slice(i);
}

describe('ink colors on an older WebView', () => {
  const files = cssFiles(SRC).filter((f) => readFileSync(f, 'utf8').includes('lch(from'));

  it('finds the stylesheets that use the ink', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files)
    it(`${file.slice(SRC.length + 1)}: the ink is only used where supported, with white outside`, () => {
      const css = built(file);
      const plain = outsideSupports(css);
      expect(plain).not.toContain('lch(from');
      expect(plain).toMatch(/color:#fff/);
    });
});
