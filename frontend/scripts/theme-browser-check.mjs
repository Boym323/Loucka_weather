/**
 * Deterministic browser check for astronomical auto mode and persistent manual
 * overrides. Browser clocks are isolated to local Astro preview; no real API.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {solarDay} from '../src/shared/domain/astronomy.ts';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
const waitReady=page=>page.waitForFunction(
 ()=>document.documentElement.dataset.themeReady==='true',{},{timeout:16000}
);
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({
   viewport:{width,height:900},deviceScaleFactor:1
  });
  const page=await context.newPage();
  await page.clock.install({time:new Date('2026-06-21T12:00:00Z')});
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:25000});
  await waitReady(page);
  const theme=()=>page.locator('html').getAttribute('data-theme');
  const pref=()=>page.locator('html').getAttribute('data-theme-preference');
  assert.equal(await theme(),'light',width+' summer daylight');
  assert.equal(await pref(),'auto',width+' default auto');
  const picker=page.locator('[data-theme-picker]');
  await picker.locator('summary').click();
  assert.equal(await picker.locator('[data-theme-choice]').count(),3);
  await picker.locator('[data-theme-choice="dark"]').click();
  assert.equal(await theme(),'dark',width+' manual dark');
  assert.equal(await pref(),'dark',width+' manual dark preference');
  assert.equal(await picker.evaluate(e=>e.open),false);
  await page.goto(new URL('grafy/',origin).href,{waitUntil:'domcontentloaded'});
  await waitReady(page);
  assert.equal(await theme(),'dark',width+' dark survives navigation');
  await picker.locator('summary').click();
  await picker.locator('[data-theme-choice="light"]').click();
  assert.equal(await theme(),'light',width+' manual light');
  await page.reload({waitUntil:'domcontentloaded'});
  await waitReady(page);
  assert.equal(await theme(),'light',width+' light survives reload');
  await picker.locator('summary').click();
  await picker.locator('[data-theme-choice="auto"]').click();
  assert.equal(await pref(),'auto',width+' auto restored');
  assert.equal(await theme(),'light',width+' auto restores solar daylight');
  await context.close();
 }

 const night=await browser.newPage({viewport:{width:390,height:844}});
 await night.clock.install({time:new Date('2026-12-21T01:00:00Z')});
 await night.goto(origin,{waitUntil:'domcontentloaded'});
 await waitReady(night);
 assert.equal(await night.locator('html').getAttribute('data-theme'),'dark','winter night');
 assert.equal(await night.locator('html').getAttribute('data-theme-preference'),'auto');
 await night.close();

 const sunrise=solarDay('2026-06-21');
 assert.ok(sunrise);
 const atDawn=await browser.newPage({viewport:{width:1440,height:900}});
 await atDawn.clock.install({time:new Date(sunrise.sunrise.getTime()-30_000)});
 await atDawn.goto(origin,{waitUntil:'domcontentloaded'});
 await waitReady(atDawn);
 assert.equal(await atDawn.locator('html').getAttribute('data-theme'),'dark','before sunrise');
 await atDawn.clock.fastForward(70_000);
 await atDawn.waitForFunction(()=>document.documentElement.dataset.theme==='light',
  {},{timeout:8000});
 assert.equal(await atDawn.locator('html').getAttribute('data-theme-preference'),'auto',
  'automatic setting remains active at sunrise');
 await atDawn.close();
 console.log('SOLAR THEME BROWSER verified automatic sunrise, winter night, manual overrides, reload and navigation');
}finally{
 await browser.close();
}
