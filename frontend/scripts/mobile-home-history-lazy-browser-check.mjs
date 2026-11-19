/**
 * Mobile-only read-only chart lazy-load regression. Fixtures never reach API/DB.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const historyRequests=[];
 await context.route('**/api/v1/**',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/v1/history'){
   const metric=url.searchParams.get('metric')||'outTemp';
   historyRequests.push(metric);
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    schemaVersion:'1',metric,unit:'°C',resolution:'hourly',dataRevision:'isolated-test',
    points:[
     {startTime:'2026-11-19T08:00:00Z',endTime:'2026-11-19T09:00:00Z',value:8.2,quality:'measured',source:'weewx_archive',provenance:null},
     {startTime:'2026-11-19T09:00:00Z',endTime:'2026-11-19T10:00:00Z',value:9.1,quality:'measured',source:'weewx_archive',provenance:null}
    ]})});
  }
  return route.fulfill({status:503,contentType:'application/json',body:'{"error":"browser-fixture-only"}'});
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(new URL('/',origin).href,{waitUntil:'domcontentloaded',timeout:30000});
 assert.equal(response?.status(),200);
 const root=page.locator('.evergreen-hero [data-history-chart]');
 const geometry=await root.evaluate(el=>({top:el.getBoundingClientRect().top,height:innerHeight}));
 console.log('MOBILE HISTORY GEOMETRY',JSON.stringify(geometry));
 assert.ok(geometry.top>geometry.height-40,'mobile chart should initially be outside the ready-to-paint area: '+JSON.stringify(geometry));
 await page.waitForTimeout(350);
 assert.equal(await root.locator('[data-chart-canvas] svg').count(),0,'ECharts must not paint before viewport entry');
 assert.equal(historyRequests.length,0,'offscreen homepage chart should not fetch history before viewport entry');
 await root.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>{
  const root=document.querySelector('.evergreen-hero [data-history-chart]');
  const status=root?.querySelector('[data-chart-status]')?.textContent??'';
  return !!root?.querySelector('[data-chart-canvas] svg')&&status.includes('naměřených bodů');
 },null,{timeout:16000});
 assert.equal(historyRequests[0],'outTemp');
 // The compact homepage intentionally hides the metric switch. Its real
 // chart must paint and present the same provenance/coverage explanation.
 assert.equal(await root.locator('.chart-toolbar').isVisible(),false,
  'homepage chart toolbar is intentionally hidden by design');
 const message=await root.locator('[data-chart-message]').textContent();
 assert.match(message??'',/Mezery označují chybějící měření/);
 assert.deepEqual(errors,[]);
 console.log('MOBILE HISTORY LAZY',JSON.stringify({aboveFoldInitially:false,paintedAfterScroll:true,historyRequests:historyRequests.length}));
 await context.close();
}finally{await browser.close();}
