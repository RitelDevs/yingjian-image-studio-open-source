import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { createApplication } from '../../server/index.mjs';
import { createGateway } from '../../server/gateway.mjs';

export function image(alpha) {
  const png = new PNG({width:2,height:2});
  png.data.set([20,90,170,255,0,0,0,alpha,0,0,0,alpha,0,0,0,alpha]);
  return PNG.sync.write(png);
}

export async function fixture(t, opaque = false, applicationFactory = createApplication) {
  const transparent = image(0), solid = image(255), calls = [];
  const upstream = createServer(async(req,res)=>{
    const parts=[];for await(const part of req)parts.push(part);
    const bytes=Buffer.concat(parts), raw=bytes.toString();
    const payload=String(req.headers['content-type']).startsWith('application/json') ? JSON.parse(raw)
      : Object.fromEntries([...raw.matchAll(/name="([^"]+)"\r\n\r\n([^\r]+)/g)].map(m=>[m[1],m[2]]));
    calls.push({path:req.url,payload,bytes});
    const result=!opaque && payload.background==='transparent' && payload.output_format==='png' ? transparent : solid;
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({data:[{b64_json:result.toString('base64')}]}));
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  const native=createGateway('http://127.0.0.1:'+upstream.address().port,'gpt-image-2.5-sunburst');
  const user={id:1,status:'active',balance:1}, key={id:1,user_id:1,group_id:2,group_ids:[2],key:'local-fixture-transparency-123456789',status:'active',expires_at:null};
  const gateway={...native,profile:async()=>user,groups:async()=>[{id:2,name:'Fixture',platform:'openai',allow_image_generation:true}],createKey:async()=>key,getKey:async()=>key,
  };
  gateway.converse=async(_key,p)=>JSON.stringify(p.messages[0].content.includes('专业方案助理')
    ? {ready:true,decisions:[{aspect:'composition',detail:'主体完整放置并保留安全边距。'},{aspect:'preservation',detail:'保留主体颜色和结构，不增加其他物品。'}]}
    : {ready:true,reply:'请确认透明背景方案。',prompt:'蓝色椅子，透明背景。'});
  const directory=mkdtempSync(join(tmpdir(),'visora-alpha-')),app=applicationFactory({dataDir:directory,gateway});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const base='http://127.0.0.1:'+app.server.address().port, cookie='studio_sid='+app.store.saveSession(user,'fixture-session',null,3600);
  t.after(async()=>{await app.close();await new Promise(r=>upstream.close(r));rmSync(directory,{recursive:true,force:true});});
  async function request(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{cookie,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
  const {data:{thread}}=await request('/api/threads',{});
  const body=patch=>({clientRequestId:randomUUID(),threadId:thread.id,prompt:'蓝色椅子，透明背景。',size:'1K',groupId:2,count:1,background:'transparent',references:[],...patch});
  async function wait(id){for(let n=0;n<100;n++){const {data}=await request('/api/jobs/'+id);if(!['queued','running'].includes(data.job.status))return data.job;await new Promise(r=>setTimeout(r,15));}throw Error('job timed out');}
  async function downloaded(job){const r=await fetch(base+job.images[0].url,{headers:{cookie}});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());}
  return {request,body,wait,downloaded,calls,transparent,solid,app,base,cookie};
}

