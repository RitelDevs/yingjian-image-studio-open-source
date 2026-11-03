import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { referenceDimensions, resolveImageRequestGeometry } from '../server/image-request-geometry.mjs';
import { createGateway, classifyFailure } from '../server/gateway.mjs';

function png(width, height) {
  const bytes = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.write('IHDR',12); bytes.writeUInt32BE(width,16); bytes.writeUInt32BE(height,20); return bytes;
}
test('auto uses reference proportions, falls back safely and respects an explicit ratio', () => {
  for (const size of ['1K','2K','4K']) {
    const square=resolveImageRequestGeometry({size});assert.equal(square.width,square.height);assert.match(square.requestSize,/^\d+x\d+$/);
    const portrait=resolveImageRequestGeometry({size,references:[{bytes:png(600,900)}]});assert(Math.abs(portrait.width/portrait.height-2/3)<.02);
  }
  assert.equal(resolveImageRequestGeometry({size:'2K',references:[{bytes:Buffer.from('bad')},{bytes:png(1600,900)}]}).requestSize,'2048x1152');
  assert.equal(resolveImageRequestGeometry({size:'2K',aspectRatio:'9:16',references:[{bytes:png(1600,900)}]}).requestSize,'1152x2048');
  const panorama=resolveImageRequestGeometry({size:'1K',references:[{bytes:png(9999,1)}]});assert(panorama.width<=3*panorama.height);
});
test('dimension headers support JPEG and all three WebP variants and reject truncated or malformed segments', () => {
  const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,4,0,0,0xff,0xc2,0,7,8,3,0x84,2,0x58]);
  assert.deepEqual(referenceDimensions(jpeg),{width:600,height:900});
  for(const type of ['VP8X','VP8L','VP8 ']){
    const b=Buffer.alloc(30);b.write('RIFF');b.write('WEBP',8);b.write(type,12);b.writeUInt32LE(10,16);
    if(type==='VP8X'){b.writeUIntLE(599,24,3);b.writeUIntLE(899,27,3);}
    if(type==='VP8L'){b[20]=0x2f;b.writeUInt32LE(599+(899<<14),21);}
    if(type==='VP8 '){b.set([0x9d,1,0x2a],23);b.writeUInt16LE(600,26);b.writeUInt16LE(900,28);}
    assert.deepEqual(referenceDimensions(b),{width:600,height:900});
    for(let length=0;length<b.length;length++) assert.doesNotThrow(()=>referenceDimensions(b.subarray(0,length)));
  }
  for(const bytes of [png(0,900),Buffer.from([255,216,255]),Buffer.from([255,216,255,224,0,0]),Buffer.alloc(0)])assert.equal(referenceDimensions(bytes),null);
});
test('native upstream accepts every tier and both routes with pixel sizes, without retries or changed image bytes', async () => {
  const calls=[],image=png(600,900),upstream=createServer(async(req,res)=>{
    const chunks=[];for await(const part of req)chunks.push(part);const bytes=Buffer.concat(chunks),body=bytes.toString();const multipart=String(req.headers['content-type']).includes('multipart');
    const size=multipart?/name="size"\r\n\r\n([^\r]+)/.exec(body)?.[1]:JSON.parse(body).size;
    const match=/^(\d+)x(\d+)$/.exec(size||''),w=Number(match?.[1]),h=Number(match?.[2]);
    const valid=!!match&&w%16===0&&h%16===0&&w<=3840&&h<=3840&&w*h>=655360&&w*h<=8294400&&w<=h*3&&h<=w*3;
    calls.push({size,path:req.url,multipart,bytes,body,valid});res.writeHead(valid?200:400,{'content-type':'application/json'}).end(JSON.stringify(valid?{data:[{b64_json:'fixture'}]}:{error:{message:`Invalid size '${size}'. Expected WIDTHxHEIGHT.`}}));
  });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  try{
    const gateway=createGateway('http://127.0.0.1:'+upstream.address().port,'gpt-image-2.5-sunburst');
    const settings=[...['1K','2K','4K'].flatMap(size=>['auto','1:1','16:9','1:3','3:1'].map(aspectRatio=>({size,aspectRatio}))),...['A2','A3','A4'].map(size=>({size})),{size:'custom',pixelSize:{width:4096,height:4096}},{size:'custom',pixelSize:{width:512,height:512}}];
    for(const model of ['gpt-image-2.5-flare','gpt-image-2.5-sunburst'])for(const input of settings)for(const references of [[],[{mime:'image/png',bytes:image}]]){
      const result=await gateway.generate('fixture-only-key',{...input,model,references,prompt:'Original prompt',count:1});assert.equal(result.data.length,1);
      const call=calls.at(-1);assert(call.valid);assert.equal(call.path,references.length?'/v1/images/edits':'/v1/images/generations');
      assert.doesNotMatch(call.body,/response_format/);assert(call.body.includes('Original prompt'));if(references.length)assert(call.bytes.includes(image));
    }
    assert.equal(calls.length,settings.length*4);
  }finally{await new Promise(r=>upstream.close(r));}
});
test('observed symbolic size rejection identifies a site protocol error and does not tell auto users to select auto',()=>{
  const failure=classifyFailure(400,{error:{message:"Invalid size '2K'. Expected WIDTHxHEIGHT. sk-private-fixture"}});
  assert.equal(failure.reason,'size_unsupported');assert.equal(failure.uncertain,false);assert.match(failure.message,/接口兼容问题/);assert.doesNotMatch(failure.message,/改为.*自动|提示词|sk-private/);
});
