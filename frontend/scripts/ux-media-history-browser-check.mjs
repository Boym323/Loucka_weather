/** Browser-only integration: real date semantics, synthetic readings never sent to API. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const capture=process.env.UX_CAPTURE==='1';
if(capture)await mkdir('test-results/ux-media-history',{recursive:true});
const browser=await chromium.launch({headless:true});
const validVideo='/api/v1/camera/timelapse/2026-11-19.mp4';
const frame='/api/v1/camera/frames/20261119T043000Z.jpg';
try{
 for(const width of [320,390,1440]){
  for(const theme of ['light','dark']){
   const ctx=await browser.newContext({viewport:{width,height:900}});
   await ctx.addInitScript(selected=>localStorage.setItem('loucka-theme',selected),theme);
   let historyRequests=0,rawHistoryRequests=0;
   let rainValue=null;
   const hold=()=>{let release;const pending=new Promise(resolve=>{release=resolve;});return {pending,release};};
   let graphGate=hold(),sensorGate=hold();
   await ctx.route('**/api/v1/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/v1/history'){
     historyRequests++;
     const metric=url.searchParams.get('metric')||'outTemp';
     const resolution=url.searchParams.get('resolution')||'hourly';
     if(resolution==='raw')rawHistoryRequests++;
     if(metric==='outTemp'&&resolution==='hourly'&&graphGate)await graphGate.pending;
     if(metric==='rain'&&resolution==='raw')return route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify({
       schemaVersion:'1',metric,unit:'mm',resolution,dataRevision:'rain-fixture',
       points:[
        {startTime:'2026-11-18T09:00:00Z',endTime:'2026-11-18T09:05:00Z',value:rainValue,quality:rainValue===null?'missing':'measured',source:'weewx_archive',provenance:null},
        {startTime:'2026-11-18T09:05:00Z',endTime:'2026-11-18T09:10:00Z',value:999,quality:'suspect',source:'weewx_archive',provenance:null}
       ]})
     });
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      schemaVersion:'1',metric,unit:'°C',resolution,dataRevision:'browser-only',
      points:[
       {startTime:'2026-11-18T09:00:00Z',endTime:'2026-11-18T10:00:00Z',value:10.5,quality:'measured',source:'weewx_archive',provenance:null},
       {startTime:'2026-11-18T10:00:00Z',endTime:'2026-11-18T11:00:00Z',value:null,quality:'missing',source:'weewx_archive',provenance:null},
       {startTime:'2026-11-18T11:00:00Z',endTime:'2026-11-18T12:00:00Z',value:999,quality:'suspect',source:'weewx_archive',provenance:null},
       {startTime:'2026-11-18T12:00:00Z',endTime:'2026-11-18T13:00:00Z',value:11.2,quality:'reconstructed',source:'weewx_archive',provenance:'historical-qc'}
      ]})});
    }
    if(url.pathname==='/api/v1/camera/archive')
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'ok',frames:[{fetchedAt:'2026-11-19T04:30:00Z',url:frame}],
      videos:[{date:'2026-11-19',url:validVideo,state:'live'},
       {date:'2026-11-18',url:'/api/v1/camera/timelapse/2026-11-18.mp4',state:'complete'}]
     })});
    if(url.pathname==='/api/v1/current'){
     if(sensorGate)await sensorGate.pending;
     const readings=Object.fromEntries(['soilTemp1','soilTemp2','soilTemp3','soilTemp4','extraTemp1','extraHumid1','pm25_1','lightning_distance'].map((metric,i)=>[metric,{
      value:i%2===0?0:null,quality:i%2===0?'measured':'missing',unit:'unit',source:'weewx_archive',provenance:null
     }]));
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({schemaVersion:'1',observedAt:new Date().toISOString(),stale:false,units:'metricwx',dataset:'original',dataRevision:'sensor-fixture',readings})});
    }
    if(url.pathname==='/api/v1/station')
     return route.fulfill({status:200,contentType:'application/json',body:'{"schemaVersion":"1","capabilities":[]}'});
    return route.fulfill({status:503,contentType:'application/json',body:'{"error":"test-only"}'});
   });
   const page=await ctx.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(new URL('grafy/',origin).href,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>document.querySelector('[data-advanced-status]')?.textContent==='Načítám graf…');
   const positions=selectors=>page.evaluate(list=>list.map(selector=>Math.round(document.querySelector(selector).getBoundingClientRect().top*10)/10),selectors);
   const graphSelectors=['.history-presets','[data-history-form]','[data-advanced-canvas]','[data-advanced-table]'];
   const graphBefore=await positions(graphSelectors);
   graphGate.release();graphGate=null;
   await page.waitForFunction(()=>document.querySelector('[data-advanced-status]')?.textContent?.includes('Zobrazeno'),null,{timeout:20000});
   const graphAfter=await positions(graphSelectors);
   assert.ok(graphBefore.every((v,i)=>Math.abs(v-graphAfter[i])<=2),'Graph async layout '+JSON.stringify({width,theme,graphBefore,graphAfter}));
   // Allow delayed rain initialization to finish before the unrelated
   // zoom/no-extra-request assertion snapshots the total request count.
   await page.waitForFunction(()=>document.querySelector('[data-rain-status]')?.textContent==='Bez potvrzených intervalů',null,{timeout:12000});
   const rainSummary=page.locator('[data-rain-summary]');
   assert.match(await rainSummary.textContent(),/Úhrn nelze určit/);
   assert.doesNotMatch(await rainSummary.textContent(),/0,0 mm/);
   rainValue=0;
   await page.locator('[data-rain-retry]').click();
   await page.waitForFunction(()=>document.querySelector('[data-rain-status]')?.textContent?.includes('1 platných intervalů'),null,{timeout:12000});
   assert.match(await rainSummary.textContent(),/0,0 mm · neúplné pokrytí/);
   const before=historyRequests;
   const zoomIn=page.locator('[data-history-zoom="in"]');
   assert.equal(await zoomIn.isEnabled(),true,'Zoom becomes available for valid points');
   await zoomIn.focus();
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('[data-history-zoom-status]')?.textContent?.includes('50 %'));
   await page.locator('[data-history-zoom="reset"]').focus();
   await page.keyboard.press('Space');
   await page.waitForFunction(()=>document.querySelector('[data-history-zoom-status]')?.textContent?.includes('celé zvolené období'));
   assert.equal(historyRequests,before,'Keyboard zoom must not refetch history');
   await page.locator('[data-advanced-table] > summary').click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-advanced-table-body] tr').length===4,null,{timeout:5000});
   const table=await page.evaluate(()=>({
    rows:[...document.querySelectorAll('[data-advanced-table-body] tr')].map(row=>[...row.cells].map(cell=>cell.textContent?.trim())),
    source:document.querySelector('[data-advanced-table-body]')?.textContent?.includes('historical-qc'),
    quality:[...document.querySelectorAll('[data-advanced-table-body] td[data-quality]')].map(cell=>cell.dataset.quality)
   }));
   assert.equal(historyRequests,before,'Opening data table must not refetch');
   assert.deepEqual(table.quality,['measured','missing','suspect','reconstructed']);
   assert.equal(table.rows[1][2],'—');
   assert.equal(table.rows[2][2],'—');
   assert.equal(table.source,true);
   const rawBeforeTheme=rawHistoryRequests;
   const rainBefore=await page.locator('[data-rain-chart] svg').innerHTML();
   const changeTheme=mode=>page.evaluate(mode=>{document.documentElement.dataset.theme=mode;window.dispatchEvent(new Event('loucka:theme-change'));},mode);
   const otherTheme=theme==='dark'?'light':'dark';
   await changeTheme(otherTheme);
   await page.waitForFunction(before=>document.querySelector('[data-rain-chart] svg')?.innerHTML!==before,rainBefore);
   assert.equal(rawHistoryRequests,rawBeforeTheme,'rain theme switch must not refetch raw history');
   await changeTheme(theme);
   await page.waitForFunction(()=>document.querySelector('[data-advanced-status]')?.textContent?.includes('Zobrazeno'));
   assert.equal(rawHistoryRequests,rawBeforeTheme,'restoring theme must not refetch rain');
   assert.match(await rainSummary.textContent(),/0,0 mm · neúplné pokrytí/);
   console.log('RAIN THEME REPAINT',width,theme,'raw GET delta',rawHistoryRequests-rawBeforeTheme);
   if(capture)await page.screenshot({path:'test-results/ux-media-history/history-'+width+'-'+theme+'.png',fullPage:false});
   await page.goto(new URL('senzory/',origin).href,{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('[data-sensor-channels]').waitFor();
   const sensorSelectors=['.sensor-directory-toolbar','.sensor-directory-list','[data-sensor-id="soilTemp2"]','.sensor-advanced-section'];
   const sensorBefore=await positions(sensorSelectors);
   sensorGate.release();sensorGate=null;
   await page.waitForFunction(()=>document.querySelector('[data-sensors-status]')?.textContent==='Poslední archivní měření');
   const sensorAfter=await positions(sensorSelectors);
   assert.ok(sensorBefore.every((v,i)=>Math.abs(v-sensorAfter[i])<=2),'Sensor async layout '+JSON.stringify({width,theme,sensorBefore,sensorAfter}));
   assert.equal(await page.locator('[data-sensor-value="soilTemp1"]').textContent(),'0,0');
   assert.equal(await page.locator('[data-sensor-value="soilTemp2"]').textContent(),'—');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   console.log('HISTORY SENSOR ASYNC GEOMETRY',width,theme,JSON.stringify({graphBefore,graphAfter,sensorBefore,sensorAfter}));
   // The compact HistoryChart is on /aktualne/, not the /grafy/ route.
   await page.goto(new URL('aktualne/',origin).href,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>document.querySelector('[data-chart-status]')?.textContent?.includes('naměřených bodů'));
   const compactBefore=rawHistoryRequests;
   const svgBefore=await page.locator('[data-chart-canvas] svg').innerHTML();
   await changeTheme(otherTheme);
   await page.waitForFunction(before=>document.querySelector('[data-chart-canvas] svg')?.innerHTML!==before,svgBefore);
   assert.equal(rawHistoryRequests,compactBefore,'compact chart theme switch must not refetch');
   await changeTheme(theme);
   console.log('HISTORY THEME REPAINT',width,theme,'raw GET delta',rawHistoryRequests-compactBefore);
   await page.goto(new URL('kamera/',origin).href,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>Boolean(document.querySelector('[data-archive-player]')?.getAttribute('poster')),null,{timeout:12000});
   assert.equal(await page.locator('[data-archive-player]').getAttribute('poster'),frame);
   assert.equal(await page.locator('[data-archive-poster-note]').isVisible(),true);
   await page.locator('[data-archive-video]').selectOption('/api/v1/camera/timelapse/2026-11-18.mp4');
   assert.equal(await page.locator('[data-archive-player]').getAttribute('poster'),null);
   assert.equal(await page.locator('[data-archive-poster-note]').isVisible(),false);
   const nav=await page.evaluate(()=>({
    top:getComputedStyle(document.querySelector('.site-header .mobile-nav')).display,
    dock:getComputedStyle(document.querySelector('.mobile-dock')).display,
    width:document.documentElement.scrollWidth,
    theme:document.documentElement.dataset.theme
   }));
   assert.equal(nav.theme,theme);
   assert.ok(nav.width<=width+1);
   if(width<=390){assert.equal(nav.top,'none');assert.notEqual(nav.dock,'none');}
   else assert.equal(nav.dock,'none');
   if(capture)await page.screenshot({path:'test-results/ux-media-history/camera-'+width+'-'+theme+'.png',fullPage:false});
   assert.deepEqual(errors,[]);
   console.log('UX MEDIA HISTORY',width,theme,'keyboard zoom OK, table=4 rows poster=real, nav='+nav.top+'/'+nav.dock);
   await ctx.close();
  }
 }
}finally{await browser.close();}
