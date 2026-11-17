/** Offline browser regression: new archive response must win over an older,
 * delayed GET during rapid live->archive handover. Browser routes only, never
 * sends synthetic readings to GW3000, the DEV API or MariaDB.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
const reading=(value,stale)=>({
 schemaVersion:'1',observedAt:'2026-11-17T17:10:00.000Z',stale,
 units:'metricwx',dataset:'original',dataRevision:stale?'old':'new',
 readings:{outTemp:{value,unit:'degC',quality:'measured',
  source:'weewx_archive',provenance:null}}
});
const older=JSON.stringify(reading(3.1,true));
const newer=JSON.stringify(reading(29.9,false));
let caught=[];
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:850}});
  const blocked=[];
  let holdInitial=true,latestRequests=0;
  await context.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/v1/current'){
    if(holdInitial){blocked.push(route);return;}
    latestRequests++;
    return route.fulfill({status:200,contentType:'application/json',body:newer});
   }
   if(url.pathname==='/api/v1/station')
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({schemaVersion:'1',capabilities:[]})});
   return route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({error:'browser-only fixture'})});
  });
  const page=await context.newPage();
  page.on('pageerror',e=>caught.push(width+': '+e.message));
  try{
   const response=await page.goto(new URL('aktualne/',origin).href,{
    waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(response?.status(),200,'/aktualne/ should load');
   // Multiple sections independently request /current on the landing.
   // Hold all initial copies so the delayed CurrentPanel GET is included.
   await page.waitForTimeout(350);
   assert.ok(blocked.length>=1,'expected at least one initially blocked archive GET');
   holdInitial=false;
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('loucka:archive-updated')));
   await page.waitForFunction(()=>
    document.querySelector('[data-current-panel] [data-metric-value="outTemp"]')
     ?.textContent?.trim()==='29,9',null,{timeout:10000});
   assert.ok(latestRequests>=1,'archive update must trigger a newer GET');
   const chip=page.locator('[data-current-panel] [data-current-status]');
   assert.equal((await chip.textContent())?.trim(),'Poslední měření');
   for(const route of blocked)
    await route.fulfill({status:200,contentType:'application/json',body:older});
   await page.waitForTimeout(150);
   assert.equal((await page.locator(
    '[data-current-panel] [data-metric-value="outTemp"]').textContent())?.trim(),'29,9');
   assert.equal((await chip.textContent())?.trim(),'Poslední měření');
   assert.equal(await chip.evaluate(el=>el.classList.contains('warning')),false,
    'old stale response must not leave warning styling');
   assert.equal(await chip.evaluate(el=>el.classList.contains('error')),false,
    'recovered archive must not retain error styling');
   console.log('CURRENT ARCHIVE RACE',width,'latest response preserved, stale request ignored');
  }finally{
   await context.close();
  }
 }
}finally{await browser.close();}
if(caught.length)throw Error('JS errors: '+caught.join('; '));
