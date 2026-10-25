import { build as buildWeb } from 'vite';
import { build as buildServer } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative, resolve, isAbsolute } from 'node:path';

// The October 9 homepage experiment is still under local review. Keep it out of unrelated deployments.
const publishedHomepage = process.argv.includes('--published-homepage');
const homepageFiles = new Map(['Showcase.jsx', 'spatial-showcase.css'].map(name => [
  fileURLToPath(new URL(`../src/${name}`, import.meta.url)).replaceAll('\\', '/'),
  new URL(`../src/published-homepage/${name}`, import.meta.url)
]));
await buildWeb(publishedHomepage ? { plugins: [{
  name: 'published-homepage', enforce: 'pre',
  load(id) { const file = homepageFiles.get(id.replaceAll('\\', '/')); return file ? readFileSync(file, 'utf8') : null; }
}] } : undefined);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverOutput = resolve(root, 'dist-server');
const outputRelative = relative(root, serverOutput);
if (!outputRelative || outputRelative.startsWith('..') || isAbsolute(outputRelative)) throw new Error('Refusing to clean a directory outside this project.');
rmSync(serverOutput, { recursive: true, force: true });
await buildServer({
  entryPoints: ['server/index.mjs'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  outfile: 'dist-server/index.mjs',
  logLevel: 'info'
});
