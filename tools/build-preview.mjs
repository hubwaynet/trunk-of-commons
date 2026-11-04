// Bundle a game page into one self-contained HTML file (for sharing previews,
// e.g. as a claude.ai artifact). The repo itself needs no build step:
// GitHub Pages serves the ES modules directly.
// Usage: node tools/build-preview.mjs rising-pool  ->  dist/rising-pool.html
// SPDX-License-Identifier: AGPL-3.0-only

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = process.argv[2] || 'rising-pool';
const pagePath = join(root, 'games', game, 'index.html');
const page = await readFile(pagePath, 'utf8');

const pick = (re) => (page.match(re) || [])[0] || '';
const title = pick(/<title>[\s\S]*?<\/title>/);
const fitMeta = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/);
const fonts = (page.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/g) || []).join('\n');
const cssHrefs = [...page.matchAll(/<link rel="stylesheet" href="(\.\.\/[^"]+\.css)">/g)].map((m) => m[1]);
const css = (await Promise.all(cssHrefs.map((h) => readFile(resolve(dirname(pagePath), h), 'utf8')))).join('\n');
// Links between pages are relative in the repo; in a standalone preview point them at the live site.
const SITE = 'https://hubwaynet.github.io/trunk-of-commons/';
const body = page.split('<!-- BODY:START -->')[1].split('<!-- BODY:END -->')[0]
  .replace(/href="\.\.\/\.\.\/([^"]*)"/g, (_, rest) => `href="${SITE}${rest}"`);
const jsSrc = page.match(/<script type="module" src="([^"]+)"><\/script>/)[1];

const bundled = await build({
  entryPoints: [resolve(dirname(pagePath), jsSrc)],
  bundle: true, format: 'iife', minify: false, write: false, target: 'es2020',
});
const js = bundled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const out = `${title}\n${fitMeta}\n${fonts}\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`;
await mkdir(join(root, 'dist'), { recursive: true });
const outPath = join(root, 'dist', `${game}.html`);
await writeFile(outPath, out);
console.log(`Wrote ${outPath} (${(out.length / 1024).toFixed(1)} KB)`);
