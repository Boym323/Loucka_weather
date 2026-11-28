/**
 * Offline Chromium wind-compass v2 regression. API responses and GW3000 events
 * are browser fixtures only, never sent to the real station or production.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const out='test-results/layout-audit';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const reading=(value,source='weewx_archive',quality='measured')=>({
 value,unit:'meter_per_second',source,quality,provenance:source
});
try{
 for(const viewport of [{name:'mobil',width:390},{name:'desktop',width:1440}]){
  for(const theme of ['light','dark']){
   const context=await browser.newContext({
    viewport:{width:viewport.width,height:900},deviceScaleFactor:1
   });
   const fixtureForArchive=()=>({
    schemaVersion:'1',observedAt:new Date().toISOString(),
    stale:false,units:'metricwx',dataset:'original',dataRevision:'wind-browser-fixture',
    readings:{
     windDir:{...reading(350),unit:'degree_compass'},
     windSpeed:reading(4.2),windGust:reading(7.8)
    }
   });
   let fixture=fixtureForArchive();
   await context.route('**/api/v1/current?*',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(fixture)
   }));
   await context.route('**/api/v1/live/current',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
     schemaVersion:'1',state:'disabled',source:'weewx_archive',
     observedAt:null,receivedAt:null,units:'metricwx',readings:{}
    })
   }));
   await context.route('**/api/v1/live?*',route=>route.abort('blockedbyclient'));
   const page=await context.newPage();
   const exceptions=[];
   page.on('pageerror',e=>exceptions.push(e.message));
   await page.addInitScript(mode=>localStorage.setItem('loucka-theme',mode),theme);
   for(const path of ['','aktualne/']){
    fixture=fixtureForArchive();
    const response=await page.goto(new URL(path||'/prehled-klasicky/?mobile=full',origin).href,{
     waitUntil:'domcontentloaded',timeout:25000
    });
    assert.equal(response?.status(),200,path+' HTTP 200');
    const compass=page.locator('[data-wind-compass]');
    await page.waitForFunction(()=>document.querySelector('[data-wind-degrees]')?.textContent==='350',
     null,{timeout:12000});
    assert.equal(await compass.locator('[data-wind-sector-short]').textContent(),'S');
    assert.equal(await compass.locator('[data-wind-valid]').getAttribute('data-wind-valid'),'true');
    assert.match(await compass.locator('.wind-gauge-v2').getAttribute('aria-label')??'',/350 stupňů/);
    assert.equal(await compass.locator('[data-wind-value="windSpeed"]').textContent(),'4,2');
    assert.equal(await compass.locator('[data-wind-value="windGust"]').textContent(),'7,8');
    assert.equal(await compass.locator('[data-wind-bearing]').evaluate(e=>e.style.transform),'rotate(350deg)');
    const shape=await compass.evaluate(root=>{
     const dial=root.querySelector('.wind-gauge-v2').getBoundingClientRect();
     const mid=root.querySelector('.wind-core-v2').getBoundingClientRect();
     const value=root.querySelector('[data-wind-degrees]').getBoundingClientRect();
     const coreContained=mid.left>=dial.left&&mid.right<=dial.right;
     const textContained=value.left>=mid.left&&value.right<=mid.right;
     const documentOverflow=document.documentElement.scrollWidth-innerWidth;
     return {dialWidth:dial.width,coreContained,textContained,documentOverflow};
    });
    assert.ok(shape.dialWidth>=95||viewport.width<360,'dial must remain visible');
    assert.ok(shape.coreContained,'central readout not inside compass');
    assert.ok(shape.textContained,'degree value leaks out of central disc');
    assert.ok(shape.documentOverflow<=2,'page horizontal overflow '+shape.documentOverflow);
    const dialBackground=await compass.locator('.wind-gauge-v2').evaluate(
     el=>getComputedStyle(el).backgroundImage);
    const expectedDial=theme==='dark'?/27,\s*54,\s*59/:/246,\s*251,\s*249/;
    assert.match(dialBackground,expectedDial,
     theme+' dial fill must match the color theme, not the legacy light Evergreen style');

    const detail={schemaVersion:'1',eventType:'observation',state:'live',
     receivedAt:new Date().toISOString(),units:'metricwx',source:'gw3000_live',
     readings:{
      windDir:{...reading(10,'gw3000_live'),unit:'degree_compass'},
      windSpeed:reading(5.3,'gw3000_live'),
      windGust:reading(8.6,'gw3000_live')
     }
    };
    await page.evaluate(data=>window.dispatchEvent(
     new CustomEvent('loucka:live-observation',{detail:data})),detail);
    await page.waitForFunction(()=>document.querySelector('[data-wind-degrees]')?.textContent==='10',
     null,{timeout:12000});
    assert.equal(await compass.locator('[data-wind-bearing]').evaluate(e=>e.style.transform),
     'rotate(370deg)','must cross north by 20 degrees, not spin backwards');
    assert.equal(await compass.locator('[data-wind-value="windSpeed"]').textContent(),'5,3');
    assert.equal(await compass.locator('[data-wind-value="windGust"]').textContent(),'8,6');
    assert.match(await compass.locator('[data-wind-source="windGust"]').textContent()??'',/Živé měření/);

    await page.evaluate(data=>{
     data.receivedAt=new Date(Date.now()-240000).toISOString();
     data.readings.windDir.value=270;
     window.dispatchEvent(new CustomEvent('loucka:live-observation',{detail:data}));
    },structuredClone(detail));
    assert.equal(await compass.locator('[data-wind-degrees]').textContent(),'10',
     'outdated packet must not overwrite fresh direction');
    await page.screenshot({
     path:out+'/wind-rose-v2-'+(path?'aktualne-':'home-')+viewport.name+'-'+theme+'.png',
     fullPage:true
    });
    await page.evaluate(()=>window.dispatchEvent(new Event('loucka:live-expired')));
    await page.waitForFunction(()=>document.querySelector('[data-wind-degrees]')?.textContent==='350',
     null,{timeout:12000});
    assert.match(await compass.locator('[data-wind-status]').textContent()??'',/Uložené měření/);

    fixture={...fixture,readings:{
     ...fixture.readings,windDir:{...fixture.readings.windDir,value:null,quality:'missing'}
    }};
    await page.evaluate(()=>window.dispatchEvent(new Event('loucka:live-expired')));
    await compass.locator('[data-wind-valid="false"]').waitFor({timeout:12000});
    assert.equal((await compass.locator('[data-wind-degrees]').textContent())?.trim(),'—');
    assert.match(await compass.locator('.wind-gauge-v2').getAttribute('aria-label')??'',/není dostupný/);
    assert.equal(exceptions.length,0,'JS exceptions: '+exceptions.join('; '));
   }
   // Exercise the actual default portal separately: its compact dial is smaller
   // than the classic instrument. Hold the archive GET until live arrives.
   for(const fail of [false,true]){
    const portal=await context.newPage();
    const portalErrors=[];
    portal.on('pageerror',e=>portalErrors.push(e.message));
    await portal.addInitScript(mode=>localStorage.setItem('loucka-theme',mode),theme);
    let archive=fixtureForArchive();
    let release;
    const gate=new Promise(resolve=>{release=resolve;});
    let first=true;
    await portal.route('**/api/v1/current?*',async route=>{
     if(first){
      first=false;
      await gate;
      if(fail)return route.fulfill({status:500,contentType:'application/json',body:'{}'});
     }
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(archive)});
    });
    const requested=portal.waitForRequest(req=>new URL(req.url()).pathname==='/api/v1/current',{timeout:12000});
    try{
     const response=await portal.goto(new URL('/',origin).href,{waitUntil:'domcontentloaded',timeout:25000});
     assert.equal(response?.status(),200);
     await requested;
     const panel=portal.locator('[data-wind-compass]');
     const live={schemaVersion:'1',eventType:'observation',state:'live',
      receivedAt:new Date().toISOString(),units:'metricwx',source:'gw3000_live',
      readings:{
       windDir:{...reading(10,'gw3000_live'),unit:'degree_compass'},
       windSpeed:reading(0,'gw3000_live')
      }
     };
     const emit=detail=>portal.evaluate(data=>window.dispatchEvent(
      new CustomEvent('loucka:live-observation',{detail:data})),detail);
     await emit(live);
     await portal.waitForFunction(()=>document.querySelector('[data-wind-degrees]')?.textContent==='10');
     assert.equal(await panel.locator('[data-wind-value="windSpeed"]').textContent(),'0,0');
     assert.equal(await panel.locator('.wind-gauge-v2').isVisible(),true);
     release();
     // Gust is intentionally not live: its update proves the delayed archive
     // success/rejection was processed, rather than asserting before it settled.
     await portal.waitForFunction(expected=>
      document.querySelector('[data-wind-source="windGust"]')?.textContent===expected,
      fail?'Data nedostupná':'Uložené měření',{timeout:12000});
     assert.equal(await panel.locator('[data-wind-degrees]').textContent(),'10');
     assert.equal(await panel.locator('[data-wind-value="windSpeed"]').textContent(),'0,0');
     assert.equal(await panel.locator('[data-wind-source="windSpeed"]').textContent(),'Živé měření');
     assert.equal(await panel.locator('[data-wind-value="windGust"]').textContent(),fail?'—':'7,8');
     assert.equal(await panel.locator('[data-wind-status]').textContent(),'Živé měření');
     // A packet can still be fresh enough for display but older than the last
     // accepted live packet. It must not roll back either metric.
     const older=structuredClone(live);
     older.receivedAt=new Date(Date.parse(live.receivedAt)-5000).toISOString();
     older.readings.windDir.value=270;
     older.readings.windSpeed.value=9;
     await emit(older);
     assert.equal(await panel.locator('[data-wind-degrees]').textContent(),'10');
     assert.equal(await panel.locator('[data-wind-value="windSpeed"]').textContent(),'0,0');
     if(!fail){
      archive={...fixtureForArchive(),readings:{
       ...fixtureForArchive().readings,
       windDir:{...reading(null,'weewx_archive','missing'),unit:'degree_compass'},
       windSpeed:reading(0)
      }};
      await portal.evaluate(()=>window.dispatchEvent(new Event('loucka:live-expired')));
      await panel.locator('[data-wind-valid="false"]').waitFor({state:'attached',timeout:12000});
      assert.equal(await panel.locator('.wind-gauge-v2').isVisible(),false);
      assert.equal(await panel.locator('[data-wind-status]').textContent(),'Bez platného směru');
      assert.equal(await panel.locator('[data-wind-value="windSpeed"]').textContent(),'0,0');
      assert.equal(await panel.locator('[data-wind-source="windSpeed"]').textContent(),'Uložené měření');
      assert.equal(await panel.locator('[data-wind-value="windSpeed"]').isVisible(),true);
      assert.equal(await panel.locator('[data-wind-value="windGust"]').isVisible(),true);
      const north=structuredClone(live);
      north.receivedAt=new Date().toISOString();
      north.readings.windDir.value=0;
      await emit(north);
      await panel.locator('[data-wind-valid="true"]').waitFor({state:'visible',timeout:12000});
      assert.equal(await panel.locator('[data-wind-degrees]').textContent(),'0');
      assert.ok(await portal.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
      await portal.screenshot({path:out+'/wind-rose-v2-portal-'+viewport.name+'-'+theme+'.png',fullPage:true});
     }
     assert.deepEqual(portalErrors,[]);
    }finally{
     release();
     await portal.close();
    }
   }
   await page.emulateMedia({reducedMotion:'reduce'});
   const duration=await page.locator('[data-wind-bearing]').evaluate(
    node=>getComputedStyle(node).transitionDuration);
   assert.equal(duration,'0s','reduced motion must disable pointer animation');
   await context.close();
   console.log('WIND V2 BROWSER',viewport.name,theme,'homepage and current, live fallback, missing and a11y labels OK');
  }
 }
}finally{
 await browser.close();
}
