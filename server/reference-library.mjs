import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { join } from 'node:path';
import { includeReferencePose } from '../shared/reference-policy.mjs';

// Assets are served only from the checked-in indexes, never from arbitrary paths
// or remote URLs. The library is optional and disabled without its local root.
export function createReferenceLibrary(root) {
  const assets = new Map();
  function asset(kind, path) {
    if (!/^(?:img|thumbs)\/[a-zA-Z0-9_-]+\.(?:jpg|webp)$/.test(path)) throw new Error('Invalid reference asset path');
    const file = join(root, kind + '-gallery', path), url = `/reference-library/${kind}/${path}`;
    if (!existsSync(file)) throw new Error('Missing indexed reference asset: ' + path);
    assets.set(url, file); return url;
  }
  const poses = JSON.parse(readFileSync(join(root, 'pose-gallery/pose-index.json'), 'utf8')).filter(includeReferencePose);
  const costumes = JSON.parse(readFileSync(join(root, 'costume-gallery/costumes-index.json'), 'utf8')).items;
  const grouped = new Map();
  for (const pose of poses) {
    const key = pose.sys + ':' + pose.no;
    if (!grouped.has(key)) grouped.set(key, { id: key, kind: 'pose', code: pose.no, name: pose.name, category: pose.cat, collection: pose.sys, keywords: pose.name, views: [] });
    grouped.get(key).views.push({ id: pose.id, label: pose.ang, thumb: asset('pose', pose.thumb), image: asset('pose', pose.img) });
  }
  const categories = { 春:'春季', 夏:'夏季', 秋:'秋季', 冬:'冬季', パーティ:'礼服派对', 水着:'泳装', ランジェリー:'内衣', セクシー:'魅力穿搭' };
  const items = [...grouped.values(), ...costumes.map(item => ({ id:item.id, kind:'costume', code:item.id, name:`${categories[item.categoria_ja] || item.categoria_ja} · ${item.id}`, category:categories[item.categoria_ja] || item.categoria_ja, collection:'服装参考', keywords:item.keywords, views:[{id:item.id,label:'服装',thumb:asset('costume',item.thumb),image:asset('costume',item.img)}] }))];
  const catalog = { author:'ギア (@giaaibusi)', translator:'Anhao', poseCount:grouped.size, poseImages:poses.length, costumeCount:costumes.length, items };
  const json = Buffer.from(JSON.stringify(catalog));
  return {
    catalog,
    handle(req,res,path) {
      if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405,{allow:'GET, HEAD'}).end();return; }
      if (path === '/reference-library/catalog.json') { res.writeHead(200,{'content-type':'application/json; charset=utf-8','content-length':json.length,'cache-control':'no-cache'}).end(req.method==='HEAD'?undefined:json); return; }
      const file = assets.get(path);
      if (!file) { res.writeHead(404,{'content-type':'text/plain'}).end('Reference not found');return; }
      res.writeHead(200,{'content-type':file.endsWith('.webp')?'image/webp':'image/jpeg','cache-control':'public, max-age=86400','x-content-type-options':'nosniff'});
      if (req.method==='HEAD') res.end(); else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }
  };
}
