/** Isolated coalescing test: mocked archive only, no station/DB writes. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
const reading=value=>({
 schemaVersion:'1',observedAt:new Date().toISOString(),stale:false,
 units:'metricwx',dataset:'original',dataRevision:'browser-fixture-only',
 readings:{
  outTemp:{value,unit:'degC',quality:'measured',source:'weewx_archive'},
  windDir:{value:275,unit:'degree_compass',quality:'measured',source:'weewx_archive'},
  windSpeed:{value:4.2,unit:'meter_per_second',quality:'measured',source:'weewx_archive'},
  windGust:{value:8.1,unit:'meter_per_second',quality:'measured',source:'weewx_archive'}
 }
});
try{
 for(const width of [320,390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900}});
  let currentCount=0;
  await ctx.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/v1/current'){
    const index=++currentCount;
    // Let all three independently mounted components subscribe to the same
    // pending request instead of resolving before later scripts run.
    await new Promise(r=>setTimeout(r,300));
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify(reading(index===1?12.4:19.7))});
   }
   if(url.pathname==='/api/v1/station')
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({schemaVersion:'1',capabilities:[]})});
   return route.fulfill({status:503,contentType:'application/json',body:'{"error":"isolated-test-only"}'});
  });
  const page=await ctx.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(new URL('',origin).href,{
   waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(response?.status(),200);
  await page.waitForFunction(()=>
   document.querySelector('[data-current-panel] [data-metric-value="outTemp"]')?.textContent?.trim()==='12,4'&&
   document.querySelector('[data-overview-status]')?.textContent?.trim()!=='Načítám'&&
   document.querySelector('[data-wind-status]')?.textContent?.trim()!=='Načítám',
   null,{timeout:10000});
  assert.equal(currentCount,1,'all current panels should share the initial GET at '+width+'px');
  // An archive publication invalidates an old generation, including when
  // it happens within 300ms of the initial response.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('loucka:archive-updated')));
  await page.waitForFunction(()=>
   document.querySelector('[data-current-panel] [data-metric-value="outTemp"]')
    ?.textContent?.trim()==='19,7',null,{timeout:10000});
  assert.equal(currentCount,2,'archive revision should issue exactly one fresh GET');
  assert.deepEqual(errors,[]);
  console.log('CURRENT COALESCE',width,'initial=1 revision=1 / real endpoint never touched');
  await ctx.close();
 }
}finally{await browser.close();}
