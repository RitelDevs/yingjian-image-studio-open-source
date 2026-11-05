import { createApplication } from '../server/index.mjs';
import { createGateway } from '../server/gateway.mjs';
import { createReferenceLibrary } from '../server/reference-library.mjs';
import { resolve } from 'node:path';

// Explicit loopback-only demo: isolated state and no real upstream credentials.
const root = resolve(import.meta.dirname,'../../../..');
const library = createReferenceLibrary(resolve(root,'third-party'));
const gateway = createGateway('http://127.0.0.1:1','gpt-image-2.5-sunburst',true);
const app = createApplication({demo:true,gateway,referenceLibrary:library,dataDir:resolve('data/reference-preview'),cookieName:'visora_reference_preview',previewId:'reference-library-20261106'});
const auth = await gateway.login('demo','demo');
const token = app.store.saveSession(auth.user,auth.access_token,null,auth.expires_in);
const handler = app.server.listeners('request')[0];
app.server.removeListener('request',handler);
app.server.on('request',(req,res)=>{
  if(req.url==='/'&&!/visora_reference_preview=/.test(req.headers.cookie||''))res.setHeader('set-cookie',`visora_reference_preview=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`);
  handler(req,res);
});
const port=Number(process.env.REFERENCE_PREVIEW_PORT)||8791;
app.server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${port}/#references`,poses:library.catalog.poseCount,poseImages:library.catalog.poseImages,costumes:library.catalog.costumeCount,demo:true})));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>void app.close());
