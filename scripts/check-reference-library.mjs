import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const origin='http://127.0.0.1:8791',out='data/reference-check';mkdirSync(out,{recursive:true});
const catalog=await(await fetch(origin+'/reference-library/catalog.json')).json();
assert.equal(catalog.poseCount,288);assert.equal(catalog.poseImages,1439);assert.equal(catalog.costumeCount,1407);
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});});
const report={};
try{
 await page.goto(origin+'/#references',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'让想象，有所参考。'}).waitFor();await page.evaluate(()=>document.fonts.ready);await page.locator('.rl-art img').first().waitFor();
 assert.equal(await page.locator('.rl-card').count(),36);assert.equal(await page.locator('.rl-card img').first().evaluate(i=>i.complete&&i.naturalWidth>0),true);await page.screenshot({path:out+'/desktop.png'});report.localAssets=true;
 const source=catalog.items.find(x=>x.collection==='全身单人・标准系'),front=source.views.find(v=>v.label==='正面'),side=source.views.find(v=>v.label==='侧面');
 await page.getByRole('searchbox',{name:'搜索参考素材'}).fill(source.code);await page.getByRole('button',{name:`查看 ${source.name}`,exact:true}).click();await page.getByRole('button',{name:'侧面',exact:true}).click();assert.equal(await page.locator('.rl-detail-image').getAttribute('src'),side.image);await page.getByRole('button',{name:'选作参考图',exact:true}).click();await page.getByRole('button',{name:'关闭参考详情'}).click();report.multiview=true;
 await page.getByRole('button',{name:/服装\s*1407/}).click();await page.getByRole('searchbox').fill('SPR-0001');await page.getByRole('button',{name:'选择 SPR-0001',exact:true}).click();assert.equal(await page.locator('.rl-selected-images button').count(),2);await page.screenshot({path:out+'/selected.png'});
 await page.getByRole('button',{name:/带回创作/}).click();await page.getByRole('textbox',{name:'画面描述',exact:true}).waitFor();assert.equal(await page.locator('.composer-ref').count(),2);assert.equal(writes.length,0);report.importWithoutGeneration=true;
 await page.getByRole('textbox',{name:'画面描述',exact:true}).fill('让我的角色采用姿势参考图的动作，穿上服装参考图中的衣服。');await page.locator('.composer').screenshot({path:out+'/composer.png'});
 await page.getByRole('button',{name:'直出模式',exact:true}).click();await page.getByRole('button',{name:'直接生成图片',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.conversation-turn').length>0);await page.waitForTimeout(1000);
 const request=writes.find(x=>x.path==='/api/jobs');assert(request);assert.equal(request.body.references.length,2);
 const sent=request.body.references.map(r=>Buffer.from((typeof r==='string'?r:r.dataUrl).split(',')[1],'base64'));
 const selected=[side,catalog.items.find(x=>x.id==='SPR-0001').views[0]];
 for(let i=0;i<2;i++){const original=Buffer.from(await(await fetch(origin+selected[i].image)).arrayBuffer());assert.equal(createHash('sha256').update(sent[i]).digest('hex'),createHash('sha256').update(original).digest('hex'));}report.originalReferenceBytesSent=true;
 await page.getByRole('button',{name:'参考图库',exact:true}).click();await page.getByRole('searchbox').waitFor();await page.getByRole('searchbox').fill('not-a-real-reference');assert.equal(await page.locator('.rl-card').count(),0);await page.getByRole('button',{name:'清除搜索和分类'}).click();report.searchEmptyRecovery=true;
 for(let i=0;i<5;i++)await page.locator('.rl-pick').nth(i).click();assert.equal(await page.locator('.rl-selected-images button').count(),4);await page.getByRole('alert').filter({hasText:'还可以选 4 张'}).waitFor();for(let i=0;i<4;i++)await page.locator('.rl-selected-images button').first().click();report.referenceLimit=true;
 const base=page.url();await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sidebar')).visibility==='hidden');await page.screenshot({path:out+'/mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.getByRole('button',{name:/带回创作/}).isVisible(),true);report.mobile=true;
 await page.reload({waitUntil:'networkidle'});assert.equal(page.url(),base);await page.getByRole('heading',{name:'让想象，有所参考。'}).waitFor();report.deepLinkRefresh=true;
 assert.deepEqual(errors,[]);writeFileSync(out+'/report.json',JSON.stringify({pass:true,...report,errors,paidRequests:0},null,2));console.log(JSON.stringify({pass:true,...report,paidRequests:0}));
}finally{await browser.close();}
