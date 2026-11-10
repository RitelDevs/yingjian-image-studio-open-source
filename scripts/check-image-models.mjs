import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { fixture } from '../tests/helpers/transparency.mjs';

const out=resolve('data/model-selection-ui');mkdirSync(out,{recursive:true});
let close;
const f=await fixture({after:fn=>{close=fn;}},false,undefined,p=>p.model==='gpt-image-2.6-sunburst'?{status:503,body:{error:{code:'channel_maintenance',message:'Channel under maintenance. sk-private-diagnostic'}}}:null);
const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined,headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'studio_sid',value:f.cookie.split('=')[1],url:f.base}]);
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const choose=async label=>{await page.locator('.composer .image-model-select .picker-trigger').click();await page.getByRole('option',{name:label,exact:true}).click();};
try {
 await page.goto(f.base,{waitUntil:'networkidle'});
 await page.locator('.composer .image-model-select').getByText('Sunburst 2.5 · 强力',{exact:true}).waitFor();
 await page.locator('.composer .image-model-select .picker-trigger').click();
 for(const label of ['Flare 2.5 · 快速','Sunburst 2.5 · 强力','Flare 2.6 · 快速','Sunburst 2.6 · 强力']) await page.getByRole('option',{name:label,exact:true}).waitFor();
 await page.screenshot({path:join(out,'01-four-models-desktop.png')});await page.keyboard.press('Escape');
 const input=page.getByRole('textbox',{name:'画面描述',exact:true});
 await page.getByRole('button',{name:'直出模式',exact:true}).click();
 for(const [index,[label,id]] of [['Flare 2.5 · 快速','gpt-image-2.5-flare'],['Sunburst 2.5 · 强力','gpt-image-2.5-sunburst']].entries()) {
  await choose(label);await input.fill('测试椅子 '+index);await page.getByRole('button',{name:'直接生成图片',exact:true}).click();
  await page.waitForFunction(n=>document.querySelectorAll('.image-open img').length===n,index+1);
  assert.equal(f.calls.at(-1).payload.model,id);
 }
 await choose('Flare 2.6 · 快速');await page.reload({waitUntil:'networkidle'});
 await page.locator('.composer .image-model-select').getByText('Flare 2.6 · 快速',{exact:true}).waitFor();
 await page.getByRole('button',{name:'会话模式',exact:true}).click();await input.fill('蓝色椅子，请保留轮廓。');await page.getByRole('button',{name:'发送对话',exact:true}).click();
 const confirm=page.getByRole('button',{name:'确认生成',exact:true});await confirm.waitFor();
 await page.locator('.confirmation-request .turn-settings').filter({hasText:'Flare 2.6 · 快速'}).waitFor();
 await choose('Sunburst 2.5 · 强力');await confirm.click();await page.waitForFunction(()=>document.querySelectorAll('.image-open img').length===3);
 assert.equal(f.calls.at(-1).payload.model,'gpt-image-2.6-flare');
 await page.getByRole('button',{name:'直出模式',exact:true}).click();await choose('Sunburst 2.6 · 强力');await input.fill('一把椅子');await page.getByRole('button',{name:'直接生成图片',exact:true}).click();
 await page.getByText(/所选模型的上游渠道正在维护/).waitFor();
 await page.screenshot({path:join(out,'02-channel-maintenance.png')});
 assert.equal(f.calls.length,4);assert.equal(f.calls.at(-1).payload.model,'gpt-image-2.6-sunburst');
 assert(!JSON.stringify(f.calls.map(c=>c.payload)).includes('response_format'));assert(!(await page.locator('body').innerText()).includes('sk-private'));
 await page.setViewportSize({width:390,height:844});await page.locator('.composer .image-model-select .picker-trigger').click();
 await page.getByRole('option',{name:'Flare 2.5 · 快速',exact:true}).waitFor();await page.screenshot({path:join(out,'03-four-models-mobile.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 writeFileSync(join(out,'report.json'),JSON.stringify({pass:true,models:4,upstreamCalls:f.calls.map(c=>({path:c.path,model:c.payload.model})),maintenanceDisplayed:true,confirmationModelLocked:true,errors,paidRequests:0},null,2));
 console.log('Model selection, persistence, confirmation locking, maintenance message, mobile layout: passed; paid requests: 0');
} catch(error) {await page.screenshot({path:join(out,'failure.png')});throw error;}
finally {await browser.close();await close();}
