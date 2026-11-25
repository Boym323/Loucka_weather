/** Default compact firstfold comparison. Browser fixtures are synthetic and read-only. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
await mkdir('test-results/mobile-home-variant',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(value=>localStorage.setItem('loucka-theme',value),theme);
  await context.route('**/api/v1/**',route=>route.fulfill({
   status:503,contentType:'application/json',body:'{"error":"browser-fixture-only"}'
  }));
  const page=await context.newPage();
  await page.goto(new URL('/prehled-klasicky/?mobile=full',origin).href,{waitUntil:'domcontentloaded'});
  const regular=await page.evaluate(()=>({
   height:document.querySelector('[data-home-hero]')?.getBoundingClientRect().height,
   toggle:getComputedStyle(document.querySelector('[data-home-expert-toggle]')).display,
   wind:getComputedStyle(document.querySelector('#home-wind')).display,
   chart:getComputedStyle(document.querySelector('#home-history')).display
  }));
  assert.equal(regular.toggle,'none');
  assert.notEqual(regular.wind,'none');
  assert.notEqual(regular.chart,'none');
  await page.goto(new URL('/prehled-klasicky/',origin).href,{waitUntil:'domcontentloaded'});
  const compact=await page.evaluate(()=>({
   height:document.querySelector('[data-home-hero]')?.getBoundingClientRect().height,
   toggle:getComputedStyle(document.querySelector('[data-home-expert-toggle]')).display,
   wind:getComputedStyle(document.querySelector('#home-wind')).display,
   chart:getComputedStyle(document.querySelector('#home-history')).display,
   width:document.documentElement.scrollWidth
  }));
  assert.ok(compact.width<=width+1,'no horizontal overflow');
  if(width<=390){
   assert.notEqual(compact.toggle,'none');
   assert.equal(compact.wind,'none');
   assert.equal(compact.chart,'none');
   assert.ok(compact.height<regular.height,'compact variant actually shortens hero');
   const toggle=page.locator('[data-home-expert-toggle]');
   await toggle.focus();await page.keyboard.press('Enter');
   assert.equal(await toggle.getAttribute('aria-expanded'),'true');
   assert.notEqual(await page.locator('#home-wind').evaluate(e=>getComputedStyle(e).display),'none');
   assert.notEqual(await page.locator('#home-history').evaluate(e=>getComputedStyle(e).display),'none');
   await toggle.focus();await page.keyboard.press('Space');
   assert.equal(await toggle.getAttribute('aria-expanded'),'false');
   assert.equal(await page.locator('#home-history').evaluate(e=>getComputedStyle(e).display),'none');
  }else{
   assert.equal(compact.toggle,'none');
   assert.notEqual(compact.wind,'none');
   assert.notEqual(compact.chart,'none');
  }
  await page.screenshot({
   path:'test-results/mobile-home-variant/'+width+'-'+theme+'.png',
   fullPage:false
  });
  console.log('MOBILE FIRSTFOLD TRIAL',width,theme,
   'regular='+Math.round(regular.height)+' compact='+Math.round(compact.height));
  await context.close();
 }
}finally{await browser.close();}
