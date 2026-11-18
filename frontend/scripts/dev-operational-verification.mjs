/**
 * Read-only external DEV smoke check. Intended to execute in a GitHub-hosted
 * runner so it reaches the actual public DEV hostname, not a local mock.
 * This script changes no API values, GitHub branches or station data.
 */
import {chromium, webkit} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const base='https://dev.pocasi-loucka.eu';
const expected='b11765d4985485d40a838fbe54f94645ec515b09';
const out='test-results/dev-operational-verify';
await mkdir(out,{recursive:true});
const checks=[];
const info={base, expected, startedAt:new Date().toISOString()};
const assert=(condition,reason)=>{if(!condition)throw Error(reason);};
async function check(name, fn, critical=true){
 try{const data=await fn();checks.push({name,result:'PASS',data});console.log('PASS '+name+' '+JSON.stringify(data??{}));return data;}
 catch(error){const message=error?.message??String(error);checks.push({name,result:critical?'FAIL':'UNVERIFIED',error:message});console.error((critical?'FAIL ':'UNVERIFIED ')+name+' '+message);return null;}
}
const req=async (path,opts={})=>fetch(base+path,{cache:'no-store',signal:AbortSignal.timeout(20000),...opts});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const deployment=await check('published commit and ready API',async()=>{
 const meta=await req('/deployment.json?fresh='+Date.now());
 assert(meta.status===200,'deployment.json HTTP '+meta.status);
 const m=await meta.json();
 assert(m.commit===expected,'DEV running '+m.commit+' instead of '+expected);
 const ready=await req('/api/v1/readyz');
 assert(ready.status===200,'readyz HTTP '+ready.status);
 const health=await ready.json();
 assert(health.ready===true,'API not ready: '+JSON.stringify(health));
 return {commit:m.commit,ready:true,deployedAt:m.deployedAt};
});
await wait(350);
await check('DEV robots policy',async()=>{
 const response=await req('/');
 assert(response.status===200,'root HTTP '+response.status);
 const robots=response.headers.get('x-robots-tag')??'';
 assert(robots.includes('noindex'),'missing noindex header: '+robots);
 return {http:response.status,robots};
});
await wait(350);
await check('live and archive data API',async()=>{
 const current=await req('/api/v1/current?units=metricwx&dataset=original');
 assert(current.status===200,'current HTTP '+current.status);
 const doc=await current.json();
 assert(doc.schemaVersion==='1'&&doc.readings&&doc.observedAt,'invalid archive JSON');
 await wait(400);
 const live=await req('/api/v1/live/current');
 assert(live.status===200,'live HTTP '+live.status);
 const v=await live.json();
 assert(v.state==='live'&&v.source==='gw3000_live','live gateway not live: '+v.state);
 return {archiveObservedAt:doc.observedAt,stale:doc.stale,archiveReadings:Object.keys(doc.readings).length,
  liveReceivedAt:v.receivedAt,liveMetrics:Object.keys(v.readings??{}).length};
});
await wait(350);
const archive=await check('camera archive and real MP4 byte ranges',async()=>{
 const resp=await req('/api/v1/camera/archive');
 assert(resp.status===200,'camera archive HTTP '+resp.status);
 const data=await resp.json();
 assert(data.status==='ok'&&Array.isArray(data.videos),'invalid camera archive JSON');
 const choice=data.videos.find(v=>typeof v?.url==='string'&&/\.mp4$/.test(v.url));
 assert(choice,'no MP4 available');
 assert(/^\/api\/v1\/camera\/timelapse\/\d{4}-\d{2}-\d{2}(?:-v\d{10})?\.mp4$/.test(choice.url),'invalid MP4 path');
 const r=await req(choice.url,{headers:{Range:'bytes=0-31'}});
 const buf=Buffer.from(await r.arrayBuffer());
 assert(r.status===206,'Range response '+r.status);
 assert(buf.length===32,'Range bytes '+buf.length);
 assert((r.headers.get('content-range')??'').startsWith('bytes 0-31/'),'invalid Content-Range');
 assert((r.headers.get('content-type')??'').includes('video/mp4'),'unexpected content type');
 return {videoCount:data.videos.length,date:choice.date,kind:choice.state,url:choice.url,
  rangeStatus:r.status,range:r.headers.get('content-range'),bytes:buf.length};
});
if(archive){
 await wait(450);
 await check('downloadable H264 MP4 validated by ffprobe',async()=>{
  const resp=await req(archive.url);
  assert(resp.status===200,'full MP4 HTTP '+resp.status);
  const body=Buffer.from(await resp.arrayBuffer());
  assert(body.length>1024,'MP4 too short: '+body.length);
  const target=out+'/tested-timelapse.mp4';
  await writeFile(target,body);
  const json=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
   'format=duration:stream=codec_name,pix_fmt,width,height','-of','json',target],{encoding:'utf8',timeout:15000}));
  const stream=json.streams?.find(x=>x.codec_name==='h264');
  assert(stream,'no H264 stream');
  assert(stream.width>0&&stream.height>0,'invalid dimensions');
  assert(Number(json.format?.duration)>0,'no video duration');
  return {bytes:body.length,codec:stream.codec_name,width:stream.width,height:stream.height,
   pixelFormat:stream.pix_fmt,durationSeconds:Number(json.format.duration)};
 });
}

let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of [320,390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900}});
  const page=await ctx.newPage();
  await check('home, mobile shortcut position and overflow '+width+'px',async()=>{
   const resp=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:30000});
   assert(resp?.status()===200,'root HTTP '+resp?.status());
   await page.locator('.evergreen-hero').waitFor();
   const state=await page.evaluate(()=>{
    const q=s=>document.querySelector(s);
    const pos=s=>{const x=q(s);return x?x.getBoundingClientRect().top+window.scrollY:null};
    return {scrollWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,
     quickTop:pos('.evergreen-quick-access'),windTop:pos('.evergreen-wind'),
     quickDisplay:getComputedStyle(q('.evergreen-quick-access')).display};
   });
   assert(state.scrollWidth<=width+1,'horizontal overflow '+state.scrollWidth);
   if(width<=390){
    assert(state.quickTop!==null&&state.quickTop<850,'shortcuts below the fold at '+state.quickTop);
    assert(state.quickTop<state.windTop,'wind before quick shortcuts');
    assert(state.quickDisplay!=='none','hidden quick nav');
   }
   if(width===390)await page.screenshot({path:out+'/home-390.png',fullPage:true});
   return state;
  });
  await check('climate landing, sections and deep link '+width+'px',async()=>{
   const resp=await page.goto(base+'/klimatologie/',{waitUntil:'domcontentloaded',timeout:30000});
   assert(resp?.status()===200,'climate HTTP '+resp?.status());
   const before=await page.evaluate(()=>({
    main:document.querySelector('[data-climate-deep-dive]')?.open,
    groups:document.querySelectorAll('[data-climate-subsection]').length,
    overflow:document.documentElement.scrollWidth>innerWidth+1
   }));
   assert(before.main===false&&before.groups===3,'climate advanced sections wrong '+JSON.stringify(before));
   assert(!before.overflow,'climate page overflows');
   if(width===390)await page.screenshot({path:out+'/climate-closed-390.png',fullPage:true});
   await page.goto(base+'/klimatologie/#srovnani-let',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>{
    const main=document.querySelector('[data-climate-deep-dive]');
    const nested=document.querySelector('[data-climate-subsection="comparison"]');
    return main?.open&&nested?.open;
   },null,{timeout:10000});
   const details=await page.evaluate(()=>({
    main:document.querySelector('[data-climate-deep-dive]')?.open,
    compare:document.querySelector('[data-climate-subsection="comparison"]')?.open
   }));
   if(width===390)await page.screenshot({path:out+'/climate-deeplink-390.png',fullPage:false});
   return {before,after:details};
  });
  if(width===390){
   await check('active mobile Klima dock in climate subchapter',async()=>{
    await page.goto(base+'/klimatologie/trendy/',{waitUntil:'domcontentloaded',timeout:30000});
    const current=await page.locator('.mobile-dock a[href="/klimatologie/"]').getAttribute('aria-current');
    assert(current==='page','aria-current '+current);
    return {ariaCurrent:current};
   });
   await check('camera UI, video selector and refresh control',async()=>{
    const resp=await page.goto(base+'/kamera/',{waitUntil:'domcontentloaded',timeout:30000});
    assert(resp?.status()===200,'camera page HTTP '+resp?.status());
    await page.waitForFunction(()=>!document.querySelector('[data-archive-video]')?.disabled,null,{timeout:15000});
    const details=await page.evaluate(()=>({
     videos:document.querySelector('[data-archive-video]')?.options.length,
     playerSrc:document.querySelector('[data-archive-player]')?.getAttribute('src'),
     refresh:!!document.querySelector('[data-archive-video-refresh]'),
     size:document.documentElement.scrollWidth
    }));
    assert(details.refresh&&details.videos>0&&details.playerSrc,'camera component did not populate');
    assert(details.size<=391,'camera overflows');
    await page.screenshot({path:out+'/camera-390.png',fullPage:true});
    return details;
   });
  }
  await ctx.close();
 }
}finally{await browser?.close();}

await check('WebKit H264 capability and loaded metadata',async()=>{
 let wk;
 try{
  wk=await webkit.launch({headless:true});
  const page=await wk.newPage();
  await page.goto(base+'/kamera/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>Boolean(document.querySelector('[data-archive-player]')?.getAttribute('src')),null,{timeout:15000});
  const data=await page.evaluate(async()=>{
   const v=document.querySelector('[data-archive-player]');
   const support=v.canPlayType('video/mp4; codecs="avc1.42E01E"');
   v.muted=true;v.preload='auto';
   v.load();
   const meta=await new Promise(resolve=>{
    const report=(reason)=>resolve({reason,readyState:v.readyState,error:v.error?.code??null,
     width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime});
    if(v.readyState>=1){report('metadata-ready');return;}
    v.addEventListener('loadedmetadata',()=>report('metadata-ready'),{once:true});
    v.addEventListener('error',()=>report('media-error'),{once:true});
    setTimeout(()=>report('metadata-timeout'),12000);
   });
   return {support,meta};
  });
  if(data.meta.reason!=='metadata-ready')
   throw Error('WebKit could not load video metadata: '+JSON.stringify(data));
  return data;
 }finally{await wk?.close();}
},false);

info.finishedAt=new Date().toISOString();
info.tests=checks;
info.failures=checks.filter(x=>x.result==='FAIL').length;
info.unverified=checks.filter(x=>x.result==='UNVERIFIED').length;
await writeFile(out+'/operational-report.json',JSON.stringify(info,null,2));
console.log('SUMMARY '+JSON.stringify({passed:checks.filter(x=>x.result==='PASS').length,
 failures:info.failures,unverified:info.unverified,expectedCommit:expected}));
if(info.failures)process.exitCode=1;
