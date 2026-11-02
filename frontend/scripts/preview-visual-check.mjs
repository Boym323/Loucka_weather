/**
 * External screenshot and runtime smoke test for the *deployed* preview.
 * Read-only: never modifies the site, GitHub or MariaDB.
 * Produces desktop/mobile screenshots in test-results/preview-screenshots.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const base=process.env.LOUCKA_PREVIEW_URL || 'https://dev.pocasi-loucka.eu';
const out='test-results/preview-screenshots';
const routes=[
 ['prehled','/'],['aktualne','/aktualne/'],['grafy','/grafy/'],
 ['klimatologie','/klimatologie/'],['kamera','/kamera/'],
 ['mapy','/mapy/'],['senzory','/senzory/'],['rekordy','/rekordy/'],['puda-ovzdusi','/puda-ovzdusi/'],['stav','/stav/'],['o-stanici','/o-stanici/']
];
const sizes=[
 {name:'desktop',width:1440,height:900},
 {name:'mobil',width:390,height:844}
];
const errors=[];
const expectedCommit=process.env.LOUCKA_EXPECT_COMMIT || '';
const checkPublicReady=async()=>{
 try{
  const response=await fetch(base+'/api/v1/readyz?probe='+Date.now(),{
   cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  const data=await response.json().catch(()=>null);
  return response.ok&&data?.ready===true;
 }catch{return false;}
};
const waitForPublishedCommit=async () => {
 const deadline=Date.now()+6*60_000;
 let last='metadata not yet available';
 while(Date.now()<deadline){
  try{
   const response=await fetch(base+'/deployment.json?verify='+Date.now(),{
    cache:'no-store',
    signal:AbortSignal.timeout(8000)
   });
   if(response.ok){
    const body=await response.json();
    last=String(body.commit ?? 'unknown');
    if(!expectedCommit||body.commit===expectedCommit){
     // Publishing the static commit can briefly precede API activation.
     // Require stable readiness before visiting pages, including manual/scheduled runs.
     await new Promise(resolve=>setTimeout(resolve,2000));
     if(await checkPublicReady()){
      await new Promise(resolve=>setTimeout(resolve,1500));
      if(await checkPublicReady()){
       console.log('Confirmed public deploy with ready API:',body.commit);
       return;
      }
     }
     last='API not yet stable after deploying '+body.commit;
    }
   } else last='HTTP '+response.status;
  }catch(e){last=String(e);}
  await new Promise(resolve=>setTimeout(resolve,12000));
 }
 throw new Error('Staging did not deploy ready API for expected '+(expectedCommit||'current')+' within 6 minutes. Last: '+last);
};
await waitForPublishedCommit();
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const size of sizes){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
  page.on('pageerror',error=>errors.push(size.name+': JavaScript exception: '+error.message));
  for(const [name,path] of routes){
   try{
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response||response.status()!==200){
     errors.push(size.name+' '+path+': HTTP '+(response?.status()??'no response'));
     continue;
    }
    await page.waitForTimeout(900);
    if(path==='/klimatologie/'){
     await page.waitForFunction(()=>{
      const status=document.querySelector('[data-climate-status]')?.textContent??'';
      const chart=document.querySelector('[data-chart-status="temperature"]')?.textContent??'';
      return !status.includes('Načítám') && !status.includes('Ověřuji') &&
       (status.includes('nedostupné')||(!chart.includes('Načítám') && !chart.includes('Ověřuji')));
     },null,{timeout:30000}).catch(()=>console.log('Climate chart still pending after 30 seconds'));
     const info=await page.evaluate(()=>({
      overall:document.querySelector('[data-climate-status]')?.textContent,
      temp:document.querySelector('[data-chart-status="temperature"]')?.textContent,
      annual:document.querySelector('[data-years-status]')?.textContent
     }));
     console.log('CLIMATE RUNTIME',size.name,JSON.stringify(info));
     const climate=await page.evaluate(()=>({
      overall:document.querySelector('[data-climate-status]')?.textContent?.trim()??'',
      statuses:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,document.querySelector('[data-chart-status="'+name+'"]')?.textContent?.trim()??''
      ])),
      annual:document.querySelector('[data-years-status]')?.textContent?.trim()??'',
      summary:{
       temperature:document.querySelector('[data-summary="temperature"]')?.textContent?.trim()??'',
       rain:document.querySelector('[data-summary="rain"]')?.textContent?.trim()??''
      },
      svgs:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,document.querySelector('[data-chart="'+name+'"] svg')!==null
      ])),
      validMonths:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,Number(document.querySelector('[data-chart="'+name+'"]')?.getAttribute('data-valid-months')??0)
      ]))
     }));
     console.log('CLIMATE VERIFIED',size.name,JSON.stringify(climate));
     for(const metric of ['temperature','rain','wind']){
      if(await page.locator('[data-climate-trend="'+metric+'"] svg').count()!==1)
       errors.push(size.name+': missing six-year '+metric+' trend chart');
     }
     if(!climate.overall.startsWith('Archivní souhrny'))
      errors.push(size.name+': climatology API failed: '+climate.overall);
     for(const [metric,status] of Object.entries(climate.statuses)){
      if(status!=='Archivní souhrny')
       errors.push(size.name+': '+metric+' climate chart missing data: '+status);
      if(!climate.svgs[metric])
       errors.push(size.name+': '+metric+' chart SVG not rendered');
      if(climate.validMonths[metric]!==12)
       errors.push(size.name+': '+metric+' missing months '+climate.validMonths[metric]+'/12 for complete year 2025');
     }
     if(climate.annual!=='Souhrny WeeWX')
      errors.push(size.name+': annual climate table not ready: '+climate.annual);
     for(const [metric,value] of Object.entries(climate.summary)){
      if(!/[0-9]/.test(value)||value==='—')
       errors.push(size.name+': '+metric+' annual summary missing: '+value);
     }
    }
    const state=await page.evaluate(()=>({
     title:document.title,
     brand:!!document.querySelector('.brand'),
     main:!!document.querySelector('main'),
     width:document.documentElement.scrollWidth,
     viewport:window.innerWidth
    }));
    if(!state.brand||!state.main)errors.push(size.name+' '+path+': missing layout');
    const dock=await page.evaluate(()=>{
     const element=document.querySelector('.mobile-dock');
     return {exists:!!element,display:element?getComputedStyle(element).display:'none'};
    });
    if(!dock.exists)errors.push(size.name+' '+path+': missing mobile dock markup');
    else if(size.name==='mobil'&&dock.display==='none')errors.push('mobile dock hidden on '+path);
    else if(size.name==='desktop'&&dock.display!=='none')errors.push('mobile dock visible on desktop '+path);
    if(path==='/grafy/'){
     await page.waitForFunction(()=>{
      const state=document.querySelector('[data-rain-status]')?.textContent??'';
      return state.includes('platných intervalů')||state.includes('Bez potvrzených intervalů')||
       state.includes('Historie nedostupná');
     },null,{timeout:30000});
     let rain=(await page.locator('[data-rain-status]').textContent())?.trim()??'';
     if(rain==='Historie nedostupná'){
      await page.locator('[data-rain-retry]').click();
      await page.waitForFunction(()=>{
       const state=document.querySelector('[data-rain-status]')?.textContent??'';
       return state.includes('platných intervalů')||state.includes('Bez potvrzených intervalů')||
        state.includes('Historie nedostupná');
      },null,{timeout:30000});
      rain=(await page.locator('[data-rain-status]').textContent())?.trim()??'';
     }
     console.log('RAIN HISTORY',size.name,rain);
     if(rain==='Historie nedostupná')errors.push(size.name+': rain detail chart failed after user retry');
     if(await page.locator('[data-rain-chart] svg').count()===0)
      errors.push(size.name+': rain chart missing SVG after history load');
    }
    if(path==='/kamera/'){
     const controls=await page.evaluate(()=>({
      auto:!!document.querySelector('[data-camera-auto]'),
      fullscreen:!!document.querySelector('[data-camera-fullscreen]'),
      latest:!!document.querySelector('[data-camera-image]')
     }));
     if(!controls.auto||!controls.fullscreen||!controls.latest)
      errors.push(size.name+': missing camera controls');
     await page.waitForFunction(()=>{
      const image=document.querySelector('[data-archive-frames] img');
      return !image||image.complete&&image.naturalWidth>0;
     },null,{timeout:24000}).catch(()=>errors.push(size.name+': first camera preview not decoded; check image 429/404'));
     const preview=await page.evaluate(()=>{
      const image=document.querySelector('[data-archive-frames] img');
      return {exists:!!image,complete:image?.complete??false,width:image?.naturalWidth??0};
     });
     console.log('CAMERA THUMB',size.name,JSON.stringify(preview));
     if(preview.exists&&preview.width===0)errors.push(size.name+': camera image failed to decode');
     if(await page.locator('[data-camera-archive] [data-archive-status]').count()!==1)
      errors.push(size.name+': missing real camera archive gallery');
     if(await page.locator('[data-archive-video]').count()!==1)
      errors.push(size.name+': missing timelapse video selection');
     const mp4=await page.locator('[data-archive-video] option').allTextContents();
     const videoNote=(await page.locator('[data-archive-video-note]').textContent())??'';
     console.log('CAMERA TIMELAPSE',size.name,JSON.stringify({days:mp4.length,available:mp4[0]!=='Žádné video',note:videoNote}));
     if(!videoNote.trim())errors.push(size.name+': camera timelapse status lacks explicit availability explanation');
     if(await page.locator('[data-archive-date]').count()!==1||
      await page.locator('[data-archive-day-frames]').count()!==1)
      errors.push(size.name+': missing date-filtered camera archive');
    }
    if(path==='/mapy/'){
     if(await page.locator('[data-model-temperature]').count()!==1||
      await page.locator('[data-model-wind]').count()!==1)
      errors.push(size.name+': missing Open-Meteo model layer toggles');
     const radarLayer=page.locator('[data-map-radar-visible]');
     if(await radarLayer.count()!==1)errors.push(size.name+': missing map layer toggle');
     else{
      await radarLayer.uncheck();
      const hidden=await page.locator('[data-radar-message]').first().textContent();
      if(!hidden?.includes('vypnutá'))errors.push(size.name+': radar layer toggle did not hide imagery');
      await radarLayer.check();
     }
    }
    if(path==='/stav/'&&await page.locator('[data-monitor-card]').count()!==5)
     errors.push(size.name+': monitoring dashboard must list five independent sources');
    if(path==='/rekordy/'){
     await page.waitForFunction(()=>{
      const state=document.querySelector('[data-records-status]')?.textContent??'';
      return state.includes('Původní data')||state.includes('Rekordy nedostupné');
     },null,{timeout:42000});
     const state=(await page.locator('[data-records-status]').textContent())?.trim()??'';
     if(!state.includes('Původní data'))errors.push(size.name+': provisional climatology records missing: '+state);
     const coverage=await page.locator('[data-records-coverage]').textContent();
     if(!coverage?.includes('teplota'))errors.push(size.name+': records coverage not disclosed');
    }
    if(path==='/puda-ovzdusi/'){
     if(await page.locator('[data-soil-live]').count()!==4)
      errors.push(size.name+': missing live soil-air readings');
     if(await page.locator('[data-soil-trend]').count()!==5)
      errors.push(size.name+': expected five separate PM2.5 and soil-temperature history graphs');
     await page.waitForFunction(()=>[...document.querySelectorAll('[data-soil-trend-status]')]
      .every(el=>!(el.textContent??'').includes('Načítám')),{},{timeout:30000})
      .catch(()=>errors.push(size.name+': soil-air history still loading after 30s'));
     const states=await page.locator('[data-soil-trend-status]').allTextContents();
     console.log('SOIL AIR HISTORY',size.name,JSON.stringify(states));
     if(states.some(state=>state.includes('Nedostupné'))){
      const diag=await page.evaluate(async()=>{
       const now=new Date(),from=new Date(now.getTime()-7*86400000);
       const fields=new URLSearchParams({metric:'pm25_1',from:from.toISOString(),to:now.toISOString(),
        resolution:'hourly',units:'metricwx',dataset:'original',limit:'1000'});
       const out=[];
       for(const [label,route] of [['7d pm25', '/api/v1/history?'+fields],
        ['24h pm25','/api/v1/history?'+new URLSearchParams({metric:'pm25_1',
         from:new Date(now.getTime()-86400000).toISOString(),to:now.toISOString(),
         resolution:'raw',units:'metricwx',dataset:'original',limit:'1000'})]]){
        try{
         const response=await fetch(route,{cache:'no-store'});
         out.push({label,status:response.status,body:(await response.text()).slice(0,350)});
        }catch(error){out.push({label,error:String(error)});}
       }
       return out;
      });
      console.log('SOIL HISTORY DIAGNOSTICS',size.name,JSON.stringify(diag));
     }
     if(states.every(v=>v.includes('Nedostupné')))
      errors.push(size.name+': all three source-backed soil-air history graphs unavailable');
    }
    if(path==='/senzory/'){
     await page.waitForFunction(()=>{
      const status=document.querySelector('[data-channel-status]')?.textContent??'';
      return status.includes('Čerstvost archivu')||
       status.includes('Dostupnost se nepodařilo ověřit');
     },null,{timeout:16000}).catch(()=>errors.push(size.name+': sensor channel provenance unavailable'));
     const channelStatus=(await page.locator('[data-channel-status]').textContent())?.trim()??'';
     console.log('CHANNEL AVAILABILITY',size.name,channelStatus);
     if(!channelStatus.includes('Čerstvost archivu ověřena'))
      errors.push(size.name+': real 24h archive sensor presence query not verified: '+channelStatus);
     const count=await page.locator('[data-channel-cards] .sensor-inventory-card').count();
     if(count!==11)errors.push(size.name+': expected 11 channel evidence cards, found '+count);
     const physical=await page.locator('[data-channel-cards] .sensor-inventory-card').first().textContent();
     if(!physical?.includes('Neověřená'))errors.push(size.name+': physical installation incorrectly marked verified');
     if(await page.locator('[data-sensor-trend]').count()<8)
      errors.push(size.name+': missing real sensor trend containers');
     if(await page.locator('[data-sensor-diagnostics]').count()!==1)
      errors.push(size.name+': missing source-specific signal and battery telemetry');
    }
    if(path==='/klimatologie/'){
     if(await page.locator('[data-solar-evidence]').count()!==1||
      await page.locator('[data-snow-evidence]').count()!==1)
      errors.push(size.name+': missing solar energy and clearly-labelled frost data');
    }
    if(path==='/'){
     if(await page.locator('[data-local-warnings]').count()!==1)
      errors.push(size.name+': missing locality-filtered CHMI alert panel');
    }
    if(state.width>state.viewport+3)errors.push(size.name+' '+path+': horizontal overflow '+state.width+'px > '+state.viewport+'px');
    await page.screenshot({path:out+'/'+size.name+'-'+name+'.png',fullPage:true});
    console.log('OK',size.name,path,state.title,'scrollWidth='+state.width);
    if(path==='/'){
     const modules=await page.evaluate(()=>({
      forecast:document.querySelector('[data-forecast-status]')?.textContent?.trim()??'missing',
      radar:document.querySelector('[data-radar-status]')?.textContent?.trim()??'missing'
     }));
     console.log('THIRD-PARTY MODULES',size.name,JSON.stringify(modules));
    }
   }catch(e){errors.push(size.name+' '+path+': '+String(e));}
  }
  await page.close();
 }
 // Verify new source-aware endpoints without asserting that opt-in collectors are installed.
 for(const [name,path] of [
  ['camera-archive','/api/v1/camera/archive'],
  ['local-chmi','/api/v1/alerts/local'],
  ['sensor-telemetry','/api/v1/diagnostics/sensors'],
  ['solar-2025','/api/v1/climate/solar?year=2025']
 ]){
  try{
   const endpoint=await fetch(base+path,{signal:AbortSignal.timeout(15000)});
   const data=await endpoint.json();
   console.log('SOURCE EXTENSION',name,JSON.stringify({
    status:endpoint.status,sourceStatus:data.status,
    count:data.readings?.length??data.frames?.length??data.alerts?.length??null,
    energy:data.energyKwhM2??null
   }));
   if(![200,503].includes(endpoint.status))errors.push(name+': unexpected HTTP '+endpoint.status);
  }catch(e){errors.push(name+': endpoint exception '+String(e));}
 }
 // Independently check the deployment and read-only API, with no credentials.
 const response=await fetch(base+'/deployment.json',{signal:AbortSignal.timeout(12000)});
 if(!response.ok)errors.push('deployment.json: HTTP '+response.status);
 else{
  const data=await response.json();
  if(!/^[a-f0-9]{40}$/.test(data.commit??''))errors.push('deployment.json: invalid commit');
  else console.log('Publicly deployed commit:',data.commit);
 }
 const health=await fetch(base+'/api/v1/readyz',{signal:AbortSignal.timeout(12000)});
 if(!health.ok)errors.push('readyz: HTTP '+health.status);
 else{
  const state=await health.json();
  if(state.ready!==true)errors.push('readyz: archive not ready');
 }
 // Verify the newly published statistics capability from the deployed API.
 const station=await fetch(base+'/api/v1/station',{signal:AbortSignal.timeout(12000)});
 if(!station.ok)errors.push('station: HTTP '+station.status);
 else{
  const capabilities=(await station.json()).capabilities??[];
  console.log('API CAPABILITIES',JSON.stringify(capabilities));
  if(capabilities.includes('yearly_statistics')){
   const q=new URLSearchParams({
    metric:'outTemp',aggregation:'mean',year:'2025',units:'metricwx',dataset:'original'
   });
   const summary=await fetch(base+'/api/v1/statistics/yearly?'+q,{
    signal:AbortSignal.timeout(25000)
   });
   const data=await summary.json().catch(()=>null);
   console.log('YEARLY 2025 API',JSON.stringify({status:summary.status,value:data?.value,
    valid:data?.completeness?.valid,error:data?.error}));
   if(!summary.ok)errors.push('Yearly statistics advertised but HTTP '+summary.status+
    ' – verify WeeWX archive_day_outTemp table and SELECT grants');
   else if(data?.metric!=='outTemp'||data?.aggregation!=='mean'||
    !Number.isFinite(data?.value)||!Number.isSafeInteger(data?.completeness?.valid)||
    data.completeness.valid<=0)errors.push('Yearly temperature 2025 has invalid or missing data'); 
   const rainQuery=new URLSearchParams({
    metric:'rain',aggregation:'sum',year:'2025',units:'metricwx',dataset:'original'
   });
   const rainResponse=await fetch(base+'/api/v1/statistics/yearly?'+rainQuery,{
    signal:AbortSignal.timeout(25000)
   });
   const rainData=await rainResponse.json().catch(()=>null);
   console.log('YEARLY RAIN 2025 API',JSON.stringify({status:rainResponse.status,
    value:rainData?.value,valid:rainData?.completeness?.valid,error:rainData?.error}));
   if(!rainResponse.ok)errors.push('Yearly rain 2025: HTTP '+rainResponse.status);
   else if(rainData?.metric!=='rain'||rainData?.aggregation!=='sum'||
    !Number.isFinite(rainData?.value)||!Number.isSafeInteger(rainData?.completeness?.valid)||
    rainData.completeness.valid<=0)errors.push('Yearly rain 2025 has invalid or missing data');
  }
 }

}catch(e){errors.push('Preview health: '+String(e));}
finally{await browser.close();}
if(errors.length){
 console.error('VISUAL SMOKE FAILED:\n'+errors.join('\n'));
 process.exitCode=1;
}else console.log('Visual preview smoke passed for 11 routes and both viewports.');
