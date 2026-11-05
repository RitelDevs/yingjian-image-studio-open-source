import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const out='data/reference-motion';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),report={};
try{
 await page.goto((process.env.REFERENCE_TEST_ORIGIN||'http://127.0.0.1:8791')+'/#references',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'让想象，有所参考。'}).waitFor();
 const pose=page.getByRole('button',{name:/姿势\s*233/}),costume=page.getByRole('button',{name:/服装\s*1407/}),surface=page.locator('.rl-tab-surface');
 const x=()=>surface.evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41);
 const finish=()=>surface.evaluate(async e=>{await Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{})));});
 const start=await x();await costume.click();
 const timing=await surface.evaluate(e=>{const a=e.getAnimations().find(a=>a.transitionProperty==='transform');if(!a)return null;const timing=a.effect.getTiming();a.pause();a.currentTime=125;return {duration:timing.duration,easing:timing.easing,property:a.transitionProperty};});
 assert(timing);assert.equal(timing.duration,250);assert.equal(timing.easing,'cubic-bezier(0.77, 0, 0.175, 1)');
 const middle=await x(),target=await surface.evaluate(e=>new DOMMatrixReadOnly(e.style.transform).m41);assert(middle>start+10&&middle<target-10);
 await page.locator('.rl-tabs').screenshot({path:out+'/mid-slide.png'});
 const reversed=await pose.evaluate(async button=>{button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));await new Promise(requestAnimationFrame);const e=document.querySelector('.rl-tab-surface'),a=e.getAnimations().find(a=>a.transitionProperty==='transform');if(a){a.pause();a.currentTime=0;}return new DOMMatrixReadOnly(getComputedStyle(e).transform).m41;});assert(Math.abs(reversed-middle)<2,'Reversing must start from the current surface position');await surface.evaluate(e=>e.getAnimations().forEach(a=>a.play()));await finish();assert(Math.abs((await x())-start)<1);report.interruptibleSlide=timing;
 await page.locator('.rl-scroll').evaluate(e=>{e.scrollTop=950;});const y=(await page.locator('.rl-tools').boundingBox()).y;await costume.click();await finish();assert(Math.abs((await page.locator('.rl-tools').boundingBox()).y-y)<2);await page.screenshot({path:out+'/sticky-costume.png'});report.stickySwitchNoJump=true;
 await pose.focus();await page.keyboard.press('Enter');assert.equal(await pose.getAttribute('aria-pressed'),'true');assert.equal(await surface.evaluate(e=>e.getAnimations().length),0);report.keyboardImmediate=true;
 await page.emulateMedia({reducedMotion:'reduce'});await costume.click();assert.equal(await surface.evaluate(e=>e.getAnimations().length),0);report.reducedMotion=true;
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>getComputedStyle(document.querySelector('.sidebar')).visibility==='hidden');await pose.click();await finish();const bounds=await surface.boundingBox(),button=await pose.boundingBox();assert(Math.abs(bounds.x-button.x)<1&&Math.abs(bounds.width-button.width)<1);await page.locator('.rl-tabs').screenshot({path:out+'/mobile.png'});report.mobileAligned=true;
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'返回创作',exact:true}).click();
 const direct=page.getByRole('button',{name:'直出模式',exact:true}),mode=page.locator('.composer-mode-surface');await page.getByRole('button',{name:'会话模式',exact:true}).click();await mode.evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));await direct.click();
 const modeTiming=await mode.evaluate(e=>{const a=e.getAnimations().find(a=>a.transitionProperty==='transform');return a?.effect.getTiming();});assert.equal(modeTiming.duration,250);assert.equal(modeTiming.easing,'cubic-bezier(0.77, 0, 0.175, 1)');
 await mode.evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished)));assert.equal(await direct.getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'会话模式',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await mode.evaluate(e=>e.getAnimations().length),0);report.composerModeSlide=true;
 writeFileSync(out+'/report.json',JSON.stringify({pass:true,...report},null,2));console.log(JSON.stringify({pass:true,...report}));
}finally{await browser.close();}
