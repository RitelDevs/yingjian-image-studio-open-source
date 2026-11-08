import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { fixture } from '../tests/helpers/transparency.mjs';

const out=resolve('data/transparency-ui');mkdirSync(out,{recursive:true});
let close;const applicationFactory=process.argv.includes('--bundle')?(await import('../dist-server/index.mjs')).createApplication:undefined;const f=await fixture({after:fn=>{close=fn;}},false,applicationFactory);
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'studio_sid',value:f.cookie.split('=')[1],url:f.base}]);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const choose=async label=>{
 await page.locator('.composer .background-select .picker-trigger').click();
 await page.getByRole('option',{name:label,exact:true}).click();
};
try{
 await page.goto(f.base,{waitUntil:'networkidle'});
 await choose('透明底');await page.screenshot({path:join(out,'01-selected-desktop.png')});
 await page.reload({waitUntil:'networkidle'});await page.locator('.composer .background-select').getByText('透明底',{exact:true}).waitFor();
 const input=page.getByRole('textbox',{name:'画面描述',exact:true});await input.fill('蓝色椅子，透明背景。');
 await page.getByRole('button',{name:'直出模式',exact:true}).click();await page.getByRole('button',{name:'直接生成图片',exact:true}).click();
 await page.locator('.image-open img').waitFor();assert.equal(f.calls[0].payload.background,'transparent');assert.equal(f.calls[0].payload.output_format,'png');
 const image=page.locator('.image-open img').first(),url=await image.getAttribute('src');
 const downloaded=await context.request.get(f.base+url);assert((await downloaded.body()).equals(f.transparent));assert.equal(PNG.sync.read(await downloaded.body()).data[7],0);
 await page.screenshot({path:join(out,'02-generated-desktop.png')});
 await page.getByRole('button',{name:'会话模式',exact:true}).click();await input.fill('同一把椅子，请保留透明背景。');await page.getByRole('button',{name:'发送对话',exact:true}).click();
 await page.getByRole('button',{name:'确认生成',exact:true}).waitFor();await page.locator('.confirmation-request .turn-settings').filter({hasText:'透明底 PNG'}).waitFor();
 await page.screenshot({path:join(out,'03-confirmation.png')});await page.getByRole('button',{name:'确认生成',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('.image-open img').length===2);assert.equal(f.calls.at(-1).payload.background,'transparent');
 await choose('自动');await input.fill('帮我扣掉这张图的底');await page.locator('.composer input[type=file]').setInputFiles({name:'background.png',mimeType:'image/png',buffer:f.solid});
 await page.locator('.composer .background-select').getByText('自动 · 透明底',{exact:true}).waitFor();await page.screenshot({path:join(out,'05-auto-cutout-desktop.png')});
 await page.getByRole('button',{name:'直出模式',exact:true}).click();await page.getByRole('button',{name:'直接生成图片',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.image-open img').length===3);
 assert.equal(f.calls.at(-1).path,'/v1/images/edits');assert.equal(f.calls.at(-1).payload.background,'transparent');assert.equal(f.calls.at(-1).payload.output_format,'png');
 await page.locator('.conversation-turn .turn-settings').filter({hasText:'透明底 PNG'}).last().waitFor();
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sidebar')).visibility==='hidden');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await choose('自动');await choose('透明底');
 await page.screenshot({path:join(out,'04-selected-mobile.png')});
 assert.deepEqual(errors,[]);writeFileSync(join(out,'report.json'),JSON.stringify({pass:true,autoCutoutRequest:true,persistentBackground:true,directPngAlphaPreserved:true,confirmedBackgroundPreserved:true,mobileNoOverflow:true,errors,paidRequests:0},null,2));console.log('Transparency UI and download checks passed; paid requests: 0.');
}catch(error){await page.screenshot({path:join(out,'failure.png')});throw error;}
finally{await browser.close();await close();}
