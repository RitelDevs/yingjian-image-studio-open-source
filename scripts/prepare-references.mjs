import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { includeReferencePose } from '../shared/reference-policy.mjs';
import { createReferenceLibrary } from '../server/reference-library.mjs';

const app = resolve(import.meta.dirname, '..');
const source = process.argv.find(a => a.startsWith('--source-root='))?.slice(14);
if (!source) throw new Error('Pass --source-root=PATH containing the two pinned gallery checkouts; see docs/REFERENCE_LIBRARY.md.');
const output = join(app, 'references');
if (existsSync(output)) throw new Error('references already exists; use a fresh checkout to prepare another asset snapshot.');
const pins = { 'pose-gallery':'fc3264e1dfab58797234aa0a2e4a49669031b4d8', 'costume-gallery':'2b9852d4e951bce1c433e4442d1f6a944d2fd3ab' };
const manifest = { author:'ギア (@giaaibusi)', translator:'Anhao', sources:pins, files:[] };
const galleries = Object.keys(pins).map(name => {
  const root = resolve(source, name);
  if (execFileSync('git', ['-C',root,'rev-parse','HEAD'], {encoding:'utf8'}).trim() !== pins[name]) throw new Error('Unexpected source revision: '+name);
  const index = name === 'pose-gallery' ? 'pose-index.json' : 'costumes-index.json';
  const raw = JSON.parse(readFileSync(join(root,index),'utf8'));
  const items = name === 'pose-gallery' ? raw.filter(includeReferencePose) : raw.items;
  const paths = [...new Set(items.flatMap(item => [item.thumb,item.img]))];
  for (const path of paths) if (!/^(img|thumbs)\/[A-Za-z0-9_-]+\.(jpg|webp)$/.test(path) || !existsSync(join(root,path))) throw new Error('Invalid/missing indexed asset: '+path);
  return {name,root,index,items,paths,raw};
});
for (const {name,root,index,items,paths,raw} of galleries) {
  const dest = join(output,name); mkdirSync(dest,{recursive:true});
  writeFileSync(join(dest,index),JSON.stringify(name === 'pose-gallery' ? items : {...raw,items}));
  for (const path of paths) {
    mkdirSync(dirname(join(dest,path)),{recursive:true}); copyFileSync(join(root,path),join(dest,path));
    manifest.files.push({path:name+'/'+path,sha256:createHash('sha256').update(readFileSync(join(dest,path))).digest('hex')});
  }
  for (const file of ['LICENSE','LICENSE-GRANT.md','README.md','README-anhao.md']) if (existsSync(join(root,file))) copyFileSync(join(root,file),join(dest,file));
}
const library = createReferenceLibrary(output);
if (library.catalog.poseCount !== 233 || library.catalog.poseImages !== 1164 || library.catalog.costumeCount !== 1407) throw new Error('Unexpected catalog totals');
writeFileSync(join(output,'MANIFEST.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({root:output,poses:233,poseImages:1164,costumes:1407,assetFiles:manifest.files.length}));
