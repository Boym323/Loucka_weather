/**
 * Read-only synthetic mobile performance lab against the public DEV homepage.
 * Browser-only CPU/network emulation approximates a weaker 4G phone.
 * NOT PSI Lighthouse scoring, field Core Web Vitals, or a backend benchmark.
 * Data are anonymous browser timing categories only; never log URLs,
 * camera content, meteorological values, IPs or visitor identifiers.
 */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.LOUCKA_PREVIEW_URL||'https://dev.pocasi-loucka.eu';
const expected=process.env.LOUCKA_EXPECT_COMMIT||'';
const out='test-results/preview-screenshots/mobile-slow4g-lab.json';
const repetitions=3;
const profile={
 viewport:{width:390,height:844},
 cpuThrottlingRate:4,
 latencyMs:150,
 downloadKbps:1600,
 uploadKbps:750
};
const round=n=>Number.isFinite(n)?Math.round(n*10)/10:null;
const median=values=>{
 const ordered=values.filter(Number.isFinite).sort((a,b)=>a-b);
 return ordered.length?round(ordered[Math.floor(ordered.length/2)]):null;
};
const json=await fetch(new URL('/deployment.json',base),{cache:'no-store',signal:AbortSignal.timeout(12000)})
 .then(async response=>{
  if(!response.ok)throw new Error('Cannot verify public DEV deployment');
  return response.json();
 });
if(!/^[a-f0-9]{40}$/.test(json.commit??''))
 throw new Error('Unverifiable deployed commit');
if(expected&&expected!==json.commit)
 throw new Error('DEV is not at this exact Git SHA; no mixed-revision comparison');
const ready=await fetch(new URL('/api/v1/readyz',base),{signal:AbortSignal.timeout(12000)})
 .then(async response=>response.ok&&(await response.json()).ready===true).catch(()=>false);
if(!ready)throw new Error('DEV readiness failed, skipping performance measurement');
const samples=[],failures=[];
const browser=await chromium.launch({headless:true});
try{
 for(let run=1;run<=repetitions;run++){
  const context=await browser.newContext({
   viewport:profile.viewport,deviceScaleFactor:2,isMobile:true,hasTouch:true,
   colorScheme:'light'
  });
  const page=await context.newPage();
  const session=await context.newCDPSession(page);
  try{
   await session.send('Network.enable');
   await session.send('Network.setCacheDisabled',{cacheDisabled:true});
   await session.send('Network.emulateNetworkConditions',{
    offline:false,latency:profile.latencyMs,
    downloadThroughput:profile.downloadKbps*1000/8,
    uploadThroughput:profile.uploadKbps*1000/8,
    connectionType:'cellular4g'
   });
   await session.send('Emulation.setCPUThrottlingRate',{rate:profile.cpuThrottlingRate});
   await page.addInitScript(()=>{
    const state={lcp:null,kind:null,cls:0,longTasks:0};
    window.__louckaSlowLab=state;
    try{
     new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
       state.lcp=entry.startTime;
       const tag=entry.element?.tagName?.toLowerCase();
       state.kind=tag==='img'?'image':tag==='h1'||tag==='h2'?'heading':'other';
      }
     }).observe({type:'largest-contentful-paint',buffered:true});
    }catch{/* Browser may not support the observer. */}
    try{
     let start=-1,last=-1,total=0;
     new PerformanceObserver(list=>{
      for(const entry of list.getEntries()){
       if(entry.hadRecentInput)continue;
       if(start<0||entry.startTime-last>1000||entry.startTime-start>5000){
        start=entry.startTime;total=0;
       }
       last=entry.startTime;total+=entry.value;
       state.cls=Math.max(state.cls,total);
      }
     }).observe({type:'layout-shift',buffered:true});
    }catch{/* Browser may not support the observer. */}
    try{
     new PerformanceObserver(list=>{
      state.longTasks+=list.getEntries().length;
     }).observe({type:'longtask',buffered:true});
    }catch{/* Browser may not support the observer. */}
   });
   const response=await page.goto(new URL('/',base).href,{
    waitUntil:'domcontentloaded',timeout:45000
   });
   if(response?.status()!==200)throw new Error('Homepage HTTP is not 200');
   // Never assume a camera screenshot is live: only test binary load state.
   const imageReady=await page.waitForFunction(()=>{
    const img=document.querySelector('.evergreen-landscape img');
    return !!img?.complete&&img.naturalWidth>0;
   },null,{timeout:18000}).then(()=>true).catch(()=>false);
   await page.waitForTimeout(1400);
   const metric=await page.evaluate(()=>{
    const navigation=performance.getEntriesByType('navigation')[0];
    const fcp=performance.getEntriesByType('paint').find(e=>e.name==='first-contentful-paint');
    const resources=performance.getEntriesByType('resource')
     .filter(e=>e.duration>0)
     .map(e=>({
      type:e.initiatorType||'other',
      scope:e.name.startsWith(location.origin)?'same-origin':'external',
      ms:Math.round(e.duration)
     })).sort((a,b)=>b.ms-a.ms).slice(0,5);
    const state=window.__louckaSlowLab||{};
    return {
     ttfbMs:navigation?.responseStart??null,
     fcpMs:fcp?.startTime??null,
     lcpCandidateMs:state.lcp??null,
     lcpCandidateKind:state.kind??null,
     clsObservedSoFar:state.cls??null,
     longTaskCount:state.longTasks??null,
     slowResourceClasses:resources
    };
   });
   const record={
    run,ttfbMs:round(metric.ttfbMs),fcpMs:round(metric.fcpMs),
    lcpCandidateMs:round(metric.lcpCandidateMs),
    lcpCandidateKind:metric.lcpCandidateKind,
    clsObservedSoFar:round(metric.clsObservedSoFar),
    longTaskCount:metric.longTaskCount,
    cameraImageLoaded:imageReady,
    slowResourceClasses:metric.slowResourceClasses
   };
   samples.push(record);
   console.log('MOBILE SLOW4G LAB',JSON.stringify(record));
  }catch(e){
   failures.push({run,error:e instanceof Error?e.message:'unknown synthetic-lab failure'});
   console.error('MOBILE SLOW4G LAB FAILED',run);
  }finally{await context.close();}
 }
}finally{await browser.close();}
const report={
 schemaVersion:1,
 measuredAtUtc:new Date().toISOString(),
 deployedCommit:json.commit,
 environment:'github-actions-headless-chromium-isolated-cold-browser',
 profile,readOnly:true,fieldWebVitals:false,lighthouseEquivalent:false,
 sampleCount:samples.length,
 medians:{
  ttfbMs:median(samples.map(s=>s.ttfbMs)),
  fcpMs:median(samples.map(s=>s.fcpMs)),
  lcpCandidateMs:median(samples.map(s=>s.lcpCandidateMs))
 },
 samples,failures,
 notes:'Synthetic CDP CPU/network emulation, not Lighthouse scoring or real-user p75. LCP candidate measured after camera image load or bounded timeout; CLS is observed-so-far. No INP/CrUX. Resource classes contain no URLs.'
};
await mkdir('test-results/preview-screenshots',{recursive:true});
await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log('MOBILE SLOW4G LAB SUMMARY',JSON.stringify({
 deployedCommit:report.deployedCommit,medianFcpMs:report.medians.fcpMs,
 medianLcpCandidateMs:report.medians.lcpCandidateMs,samples:samples.length,
 failures:failures.length
}));
if(samples.length!==repetitions||samples.some(s=>s.fcpMs===null||s.lcpCandidateMs===null))
 process.exitCode=1;
