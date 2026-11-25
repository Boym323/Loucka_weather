/** Pre-PR responsive visual guard with clearly labelled isolated weather fixture. */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
await mkdir('test-results/p1-visual-review',{recursive:true});
try{
 for(const width of [320,390,1440]){
  for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width,height:850}});
   await context.addInitScript(selected=>localStorage.setItem('loucka-theme',selected),theme);
   await context.route('**/api/v1/current**',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({schemaVersion:'1',observedAt:new Date().toISOString(),stale:false,
     units:'metricwx',dataset:'original',dataRevision:'test-only',
     readings:{outTemp:{value:12.4,quality:'measured',unit:'degC',source:'weewx_archive'},
      outHumidity:{value:72,quality:'measured',unit:'percent',source:'weewx_archive'},
      barometer:{value:1018.6,quality:'measured',unit:'hPa',source:'weewx_archive'},
      dewpoint:{value:7.4,quality:'derived',unit:'degC',source:'weewx_archive'}}})
   }));
   const page=await context.newPage();
   const response=await page.goto('http://127.0.0.1:4321/prehled-klasicky/',{waitUntil:'domcontentloaded',timeout:30000});
   assert.equal(response?.status(),200);
   await page.waitForFunction(()=>document.querySelector('.evergreen-hero [data-current-status]')?.textContent?.includes('Poslední měření'),null,{timeout:10000});
   await page.evaluate(()=>{
    const panel=document.querySelector('[data-current-panel]');
    if(panel){
     const status=panel.querySelector('[data-current-status]');
     const note=panel.querySelector('[data-current-provenance]');
     if(status)status.textContent='TEST – syntetická měření';
     if(note)note.textContent='TESTOVACÍ DATA – pouze vizuální kontrola, nikoli aktuální počasí v Loučce.';
    }
    document.documentElement.style.scrollBehavior='auto';scrollTo(0,0);
   });
   const geometry=await page.evaluate(()=>({
    width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
    theme:document.documentElement.dataset.theme,
    quickY:document.querySelector('.evergreen-quick-access')?.getBoundingClientRect().top+scrollY,
    windY:document.querySelector('.evergreen-wind')?.getBoundingClientRect().top+scrollY
   }));
   assert.ok(geometry.scrollWidth<=width+1,JSON.stringify(geometry));
   assert.equal(geometry.theme,theme);
   if(width<=390){assert.ok(geometry.quickY<850);assert.ok(geometry.quickY<geometry.windY);}
   console.log('P1 VISUAL',width,theme,JSON.stringify(geometry));
   await page.screenshot({path:'test-results/p1-visual-review/home-'+width+'-'+theme+'.png',fullPage:false});
   await context.close();
  }
 }
}finally{await browser.close();}
