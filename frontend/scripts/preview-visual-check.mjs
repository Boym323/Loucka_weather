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
 ['mapy','/mapy/'],['senzory','/senzory/'],['o-stanici','/o-stanici/']
];
const sizes=[
 {name:'desktop',width:1440,height:900},
 {name:'mobil',width:390,height:844}
];
const errors=[];
const expectedCommit=process.env.LOUCKA_EXPECT_COMMIT || '';
const waitForPublishedCommit=async () => {
 if(!expectedCommit)return;
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
    if(body.commit===expectedCommit){
     console.log('Confirmed public deploy:',expectedCommit);
     return;
    }
   } else last='HTTP '+response.status;
  }catch(e){last=String(e);}
  await new Promise(resolve=>setTimeout(resolve,12000));
 }
 throw new Error('Staging did not deploy expected '+expectedCommit+' within 6 minutes. Last: '+last);
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
    }
    const state=await page.evaluate(()=>({
     title:document.title,
     brand:!!document.querySelector('.brand'),
     main:!!document.querySelector('main'),
     width:document.documentElement.scrollWidth,
     viewport:window.innerWidth
    }));
    if(!state.brand||!state.main)errors.push(size.name+' '+path+': missing layout');
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
  }
 }

}catch(e){errors.push('Preview health: '+String(e));}
finally{await browser.close();}
if(errors.length){
 console.error('VISUAL SMOKE FAILED:\n'+errors.join('\n'));
 process.exitCode=1;
}else console.log('Visual preview smoke passed for 8 routes and both viewports.');
