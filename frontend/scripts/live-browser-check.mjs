/**
 * End-to-end verification of the real public GW3000 feed and browser rendering.
 * Browser-only synthetic fixtures exercise failover. NEVER POST to gateway/WeeWX,
 * never change the public API or files.
 */
import {chromium} from 'playwright';

const base=process.env.LOUCKA_PREVIEW_URL||'https://dev.pocasi-loucka.eu';
const issues=[];
const browser=await chromium.launch({headless:true});
const fmt=(n,d)=>new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n);
const expectedProvenance='Živá data GW3000 přes lokální API';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function liveCurrent(){
 const response=await fetch(base+'/api/v1/live/current',{cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Public live/current HTTP '+response.status);
 return response.json();
}

try{
 // Only assert the physical feed if it is really active at this exact test time;
 // a planned station outage is not a frontend regression.
 const sample=await liveCurrent();
 const connected=sample.state==='live'&&sample.source==='gw3000_live'&&
   Number.isFinite(Date.parse(sample.receivedAt))&&
   Math.abs(Date.now()-Date.parse(sample.receivedAt))<120000;
 console.log('LIVE API',JSON.stringify({state:sample.state,source:sample.source,
   receivedAt:sample.receivedAt,metrics:Object.keys(sample.readings??{}).length}));
 if(connected){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>issues.push('live desktop JS: '+e.message));
  await page.goto(base+'/aktualne/',{waitUntil:'domcontentloaded',timeout:25000});
  try{
   await page.waitForFunction(()=>{
    const chip=document.querySelector('[data-current-status]')?.textContent??'';
    const provenance=document.querySelector('[data-current-provenance]')?.textContent??'';
    return chip.includes('GW3000')&&provenance.includes('Živá data GW3000');
   },null,{timeout:30000});
   const before=await page.evaluate(()=>{
    const value=document.querySelector('[data-metric-value="outTemp"]')?.textContent?.trim()??'';
    const station=document.querySelector('[data-current-status]')?.textContent?.trim()??'';
    const live=document.querySelector('[data-live-archive-status]')?.textContent?.trim()??'';
    const rain=document.querySelector('[data-metric-quality="rain"]')?.textContent?.trim()??'';
    return {value,station,live,rain};
   });
   console.log('LIVE BROWSER INITIAL',JSON.stringify(before));
   if(!before.station.includes('GW3000')||!before.live.includes('GW3000'))
    issues.push('Real live GW3000 status did not appear on frontend');
   if(!before.rain.includes('Archivní')&&!before.rain.includes('Nedostupné'))
    issues.push('Interval rain was incorrectly labelled as direct GW3000 measurement');
   if(before.value==='—')issues.push('Real live outdoor temperature missing in browser');
   // Confirm that an *actual new gateway packet* reaches the open page through SSE
   // or polling without any navigation. Values may legitimately remain unchanged.
   await page.evaluate(()=>{
    window.__louckaLivePackets=[];
    window.addEventListener('loucka:live-observation',e=>{
     const d=e.detail;
     if(d?.source==='gw3000_live'&&d?.receivedAt)
      window.__louckaLivePackets.push(d.receivedAt);
    });
   });
   try{
    await page.waitForFunction(()=>{
      const arr=window.__louckaLivePackets??[];
      return arr.length>0&&Number.isFinite(Date.parse(arr.at(-1)))&&
       Date.now()-Date.parse(arr.at(-1))<120000;
    },null,{timeout:50000});
    const packets=await page.evaluate(()=>window.__louckaLivePackets);
    console.log('LIVE BROWSER UPDATES',JSON.stringify(packets.slice(-5)));
   }catch{
    issues.push('No new verified GW3000 observation reached the active browser within 50s');
   }
  }catch(err){issues.push('Real live browser check: '+err);}
  finally{await page.close();}
 }else{
  console.log('LIVE SOURCE NOT FRESH: real-device browser assertion skipped; deterministic browser tests still required');
 }

 // No requests in this test affect GW3000: synthetic readings exist only in
 // Playwright's isolated browser page and are never sent to the server.
 for(const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height}});
  await context.route('**/api/v1/live?*',route=>route.abort('blockedbyclient'));
  await context.route('**/api/v1/live/current',route=>route.fulfill({
   status:200,contentType:'application/json',body:JSON.stringify({
    schemaVersion:'1',source:'weewx_archive',state:'disabled',
    observedAt:null,receivedAt:null,units:'metricwx',readings:{}
   })
  }));
  const page=await context.newPage();
  page.on('pageerror',e=>issues.push(viewport.name+' deterministic JS: '+e.message));
  await page.goto(base+'/aktualne/',{waitUntil:'domcontentloaded',timeout:25000});
  try{
   await page.waitForFunction(()=>document.querySelector('[data-current-status]')
    ?.textContent?.includes('Archivní měření'),null,{timeout:16000});
   const archive=await page.locator('[data-metric-value="rain"]').textContent();
   await page.evaluate(()=>{
    const stamp=new Date().toISOString();
    const reading=(value,unit)=>({value,unit,source:'gw3000_live',quality:'measured'});
    window.dispatchEvent(new CustomEvent('loucka:live-observation',{detail:{
      schemaVersion:'1',eventType:'observation',state:'live',units:'metricwx',source:'gw3000_live',
      observedAt:stamp,receivedAt:stamp,timestampMeaning:'gateway_polled_at',
      readings:{
       outTemp:reading(43.21,'degC'),
       pm25_1:reading(55.55,'microgram_per_cubic_meter'),
       barometer:reading(1001.17,'hPa'),
       windSpeed:reading(4.67,'meter_per_second')
      }
    }}));
   });
   const rendered=await page.evaluate(()=>({
    temp:document.querySelector('[data-metric-value="outTemp"]')?.textContent?.trim(),
    pm25:document.querySelector('[data-metric-value="pm25_1"]')?.textContent?.trim(),
    rain:document.querySelector('[data-metric-value="rain"]')?.textContent?.trim(),
    status:document.querySelector('[data-current-status]')?.textContent?.trim(),
    provenance:document.querySelector('[data-current-provenance]')?.textContent?.trim()
   }));
   console.log('BROWSER SYNTHETIC PAINT',viewport.name,JSON.stringify(rendered));
   if(rendered.temp!==fmt(43.21,1)||rendered.pm25!==fmt(55.55,1)||
     !rendered.status?.includes('GW3000')||!rendered.provenance?.includes(expectedProvenance))
    issues.push(viewport.name+': live event failed to paint selected metric values');
   if(rendered.rain!==(archive?.trim()??''))issues.push(viewport.name+': fake gateway interval rain displayed');

   // An expired packet must not overwrite a valid live or archive measurement.
   await page.evaluate(()=>{
    const old=new Date(Date.now()-240000).toISOString();
    window.dispatchEvent(new CustomEvent('loucka:live-observation',{detail:{
      state:'live',source:'gw3000_live',units:'metricwx',observedAt:old,receivedAt:old,
      readings:{outTemp:{value:77,unit:'degC',quality:'measured',source:'gw3000_live'}}
    }}));
   });
   if((await page.locator('[data-metric-value="outTemp"]').textContent())?.trim()!==fmt(43.21,1))
    issues.push(viewport.name+': stale event displaced a fresh live reading');
   await page.evaluate(()=>window.dispatchEvent(new Event('loucka:live-expired')));
   await page.waitForFunction(()=>{
    const chip=document.querySelector('[data-current-status]')?.textContent??'';
    const provenance=document.querySelector('[data-current-provenance]')?.textContent??'';
    return chip.includes('Archivní měření')&&provenance.includes('Původní archiv WeeWX');
   },null,{timeout:16000});
   const restored=(await page.locator('[data-metric-value="outTemp"]').textContent())?.trim();
   if(restored===fmt(43.21,1))issues.push(viewport.name+': stale GW3000 value survived archive fallback');
   console.log('BROWSER FAILOVER PASS',viewport.name,JSON.stringify({archiveTemp:restored}));
  }catch(err){issues.push(viewport.name+' browser failover: '+String(err));}
  finally{await context.close();}
 }
}catch(err){issues.push('Live browser test setup: '+String(err));}
finally{await browser.close();}
if(issues.length){
 console.error('GW3000 LIVE BROWSER FAILURE:\n'+issues.join('\n'));
 process.exitCode=1;
}else console.log('GW3000 live browser paint and failover verified');
