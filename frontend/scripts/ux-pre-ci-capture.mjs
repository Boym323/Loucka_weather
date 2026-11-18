/**
 * Branch-only visual preview before opening the pull request and its CI checks.
 * All API responses below are isolated browser fixtures. Never touches the
 * station, DB, public DEV API, camera collector or production.
 */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const out='test-results/pre-ci-screenshots';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const readings={
 outTemp:{value:12.4,unit:'degC',quality:'measured',source:'weewx_archive'},
 outHumidity:{value:72,unit:'percent',quality:'measured',source:'weewx_archive'},
 barometer:{value:1018.6,unit:'hPa',quality:'measured',source:'weewx_archive'},
 dewpoint:{value:7.4,unit:'degC',quality:'derived',source:'weewx_archive'}
};
try{
 for(const width of [320,390,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  await ctx.addInitScript(()=>localStorage.setItem('loucka-theme','light'));
  // Deliberately simulate unavailable records to verify graceful, compact
  // fallback rather than repeated empty placeholders in mobile screenshots.
  await ctx.route('**/api/v1/climate/records**',route=>route.fulfill({
   status:503,contentType:'application/json',
   body:JSON.stringify({schemaVersion:'1',error:{code:'TEST_ONLY',message:'Visual fallback fixture'}})
  }));
    await ctx.route('**/api/v1/current**',route=>route.fulfill({
   status:200,contentType:'application/json',
   body:JSON.stringify({schemaVersion:'1',observedAt:new Date().toISOString(),
    stale:false,units:'metricwx',dataset:'original',
    dataRevision:'pre-ci-screenshot-only',readings})
  }));
  const page=await ctx.newPage();
  page.on('pageerror',error=>console.error('BROWSER ERROR',width,error.message));
  for(const [name,path] of [['home','/'],['atlas','/klimatologie/'],['camera','/kamera/']]){
   const response=await page.goto(new URL(path.slice(1),origin).href,{
    waitUntil:'domcontentloaded',timeout:30000});
   if(!response?.ok())throw Error(name+' HTTP '+response?.status());
   if(name==='home'){
    await page.waitForFunction(()=>document.querySelector('.evergreen-hero [data-current-status]')
     ?.textContent?.includes('Poslední měření'),null,{timeout:15000});
    await page.evaluate(()=>{
     const current=document.querySelector('.evergreen-hero [data-current-panel]');
     const status=current?.querySelector('[data-current-status]');
     const provenance=current?.querySelector('[data-current-provenance]');
     if(status)status.textContent='TEST – náhled měření';
     if(provenance)provenance.textContent='Testovací hodnoty pro vizuální náhled, nikoli živá data ze stanice.';
    });
   }
   if(name==='atlas'){
    await page.locator('[data-climate-highlights]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-highlights-status]')?.dataset.state==='error',null,{timeout:10000});
    await page.evaluate(()=>window.scrollTo(0,0));
   }
   if(name==='camera'){
    const controls=await page.evaluate(()=>{
     const root=document.querySelector('.camera-actions');
     return {display:root?getComputedStyle(root).display:null,
      columns:root?getComputedStyle(root).gridTemplateColumns.split(' ').filter(Boolean).length:0,
      links:document.querySelectorAll('.camera-view-navigation a').length,
      archiveBeforeAside:!!document.querySelector('.camera-layout-enhanced > .camera-archive-section'),
      overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    console.log('CAMERA UI REVIEW',width,JSON.stringify(controls));
    if(width<=390&&(controls.display!=='grid'||controls.columns!==2))
     throw Error('mobile camera control grid lost: '+JSON.stringify(controls));
    if(!controls.archiveBeforeAside||controls.links!==3||controls.overflow)
     throw Error('camera navigation or layout regression: '+JSON.stringify(controls));
   }
   if(name==='atlas'){
    const order=await page.evaluate(()=>({
     chapters:document.querySelector('.climate-atlas-grid')?.getBoundingClientRect().top+scrollY,
     highlights:document.querySelector('[data-climate-highlights]')?.getBoundingClientRect().top+scrollY,
     firstChapter:document.querySelector('.climate-atlas-card')?.getBoundingClientRect().top+scrollY,
     fallback:getComputedStyle(document.querySelector('[data-highlights-fallback]')).display,
     width:document.documentElement.scrollWidth
    }));
    console.log('CLIMATE VISUAL HIERARCHY',width,JSON.stringify(order));
    if(!(order.chapters<order.highlights)||order.width>width+1||order.fallback==='none')
     throw Error('Climate chapter order, compact failure or width regressed: '+JSON.stringify(order));
    if(width<=390&&order.firstChapter>730)
     throw Error('First climate chapter is below a short mobile viewport: '+JSON.stringify(order));
   }
   await page.screenshot({path:out+'/'+name+'-'+width+'-overview.png',fullPage:true});
   await page.screenshot({path:out+'/'+name+'-'+width+'-fold.png',fullPage:false});
   if(name==='atlas'){
    const analysis=page.locator('[data-climate-deep-dive]');
    await analysis.locator(':scope > summary').click();
    await page.screenshot({path:out+'/atlas-'+width+'-advanced-summary.png',fullPage:true});
    const years=page.locator('[data-climate-subsection="temperatures"]');
    await years.locator(':scope > summary').click();
    const compare=page.locator('[data-climate-subsection="comparison"]');
    await compare.locator(':scope > summary').click();
    await page.screenshot({path:out+'/atlas-'+width+'-advanced-all.png',fullPage:true});
   }
   // Capture the same rendered layout in dark theme without replacing
   // source data or causing API effects on the station.
   await page.evaluate(()=>localStorage.setItem('loucka-theme','dark'));
   await page.reload({waitUntil:'domcontentloaded'});
   if(name==='atlas'){
    await page.locator('[data-climate-highlights]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-highlights-status]')?.dataset.state==='error',null,{timeout:10000});
    await page.evaluate(()=>window.scrollTo(0,0));
   }
   await page.screenshot({path:out+'/'+name+'-'+width+'-dark-fold.png',fullPage:false});
   await page.screenshot({path:out+'/'+name+'-'+width+'-dark-overview.png',fullPage:true});
   await page.evaluate(()=>localStorage.setItem('loucka-theme','light'));
   const geometry=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    viewport:innerWidth,
    quickY:(document.querySelector('.evergreen-quick-access')?.getBoundingClientRect().top??null),
    heroPresent:!!document.querySelector('.evergreen-hero'),
    atlasGroups:document.querySelectorAll('[data-climate-subsection]').length
   }));
   console.log('PRE-CI SCREENSHOT',name,width,JSON.stringify(geometry));
  }
  await ctx.close();
 }
}finally{await browser.close();}
