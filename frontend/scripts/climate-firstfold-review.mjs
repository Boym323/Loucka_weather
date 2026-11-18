/** Fast isolated screenshot review for the climate atlas, no weather writes. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const out='test-results/climate-firstfold-review';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  await context.route('**/api/v1/climate/records**',route=>route.fulfill({
   status:503,contentType:'application/json',body:'{"error":{"code":"VISUAL_TEST_ONLY"}}'
  }));
  const page=await context.newPage();
  for(const theme of ['light','dark']){
   const resp=await page.goto('http://127.0.0.1:4321/klimatologie/',{waitUntil:'domcontentloaded',timeout:30000});
   if(!resp?.ok())throw Error('climate HTTP '+resp?.status());
   await page.evaluate(selected=>localStorage.setItem('loucka-theme',selected),theme);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('[data-climate-highlights]').scrollIntoViewIfNeeded({timeout:12000});
   await page.waitForFunction(()=>document.querySelector('[data-highlights-status]')?.dataset.state==='error',null,{timeout:12000});
   await page.evaluate(()=>window.scrollTo(0,0));
   const info=await page.evaluate(()=>{
    const y=s=>document.querySelector(s)?.getBoundingClientRect().top+scrollY;
    return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
     chaptersY:y('.climate-atlas-grid'),firstChapterY:y('.climate-atlas-card'),
     highlightsY:y('[data-climate-highlights]'),
     fallbackVisible:!!document.querySelector('[data-highlights-fallback]')?.offsetWidth,
     gridHidden:document.querySelector('.atlas-highlights-grid')?.hidden,
     title:document.querySelector('#atlas-chapters-title')?.textContent?.trim(),
     theme:document.documentElement.dataset.theme};
   });
   console.log('CLIMATE FIRSTFOLD',width,theme,JSON.stringify(info));
   if(info.scrollWidth>width+1||!(info.firstChapterY<info.highlightsY)||
      !info.fallbackVisible||!info.gridHidden||info.theme!==theme)
    throw Error('climate visual regression '+JSON.stringify(info));
   if(width<=390&&info.firstChapterY>730)
    throw Error('first chapter too low '+JSON.stringify(info));
   await page.screenshot({path:out+'/atlas-'+width+'-'+theme+'-fold.png',fullPage:false});
   await page.screenshot({path:out+'/atlas-'+width+'-'+theme+'-page.png',fullPage:true});
  }
  await context.close();
 }
}finally{await browser.close();}
