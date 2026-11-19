/**
 * Final visual QA on a local Astro preview, never on weather API/DB.
 * Explicit viewport and theme checks; screenshot values are not verified
 * meteorological readings and must not be described as live data.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const routes=['/','/aktualne/','/grafy/','/kamera/','/klimatologie/'];
const widths=[320,390,1440];
const themes=['light','dark'];
const out='test-results/design-final';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const failures=[];
try{
 for(const width of widths){
  for(const theme of themes){
   const context=await browser.newContext({
    viewport:{width,height:900},colorScheme:theme,
    reducedMotion:'reduce'
   });
   await context.addInitScript(chosen=>{
    try{localStorage.setItem('loucka-theme',chosen);}catch{}
   },theme);
   // Deliberately unavailable API: screens must still remain readable.
   await context.route('**/api/v1/**',route=>route.fulfill({
    status:503,contentType:'application/json',
    body:JSON.stringify({schemaVersion:'1',error:{code:'TEMPORARILY_UNAVAILABLE',message:'Browser-only fixture'}})
   }));
   for(const path of routes){
    const page=await context.newPage();
    try{
     const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:30000});
     assert.equal(response?.status(),200,path+' HTTP');
     await page.evaluate(()=>document.fonts.ready);
     const result=await page.evaluate(()=>{
      const h1=document.querySelector('h1');
      const head=h1?.getBoundingClientRect();
      const introductory=document.querySelector('.page-intro p');
      const actions=[
       ...document.querySelectorAll(
        '.camera-view-navigation a,.camera-actions button,.camera-actions a,.chart-tab,.history-table-alternative>summary'
       )
      ].filter(el=>el.getClientRects().length>0).slice(0,18);
      return {
       theme:document.documentElement.dataset.theme,
       viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,
       h1Text:(h1?.textContent||'').trim().length,
       h1Font:h1?parseFloat(getComputedStyle(h1).fontSize):0,
       h1Width:head?.width??0,h1Left:head?.left??0,h1Right:head?.right??0,
       introTextSize:introductory?parseFloat(getComputedStyle(introductory).fontSize):null,
       actions:actions.map(el=>({height:Math.round(el.getBoundingClientRect().height),name:el.tagName.toLowerCase()})),
       dockVisible:!!document.querySelector('.mobile-dock')&&getComputedStyle(document.querySelector('.mobile-dock')).display!=='none'
      };
     });
     assert.equal(result.theme,theme,'theme selected');
     assert.ok(result.scrollWidth<=width+2,'horizontal overflow at '+width+' '+path+': '+JSON.stringify(result));
     assert.ok(result.h1Text>0&&result.h1Font>=27,'missing or unreadable page heading');
     assert.ok(result.h1Left>=-2&&result.h1Right<=width+2,'heading clipped: '+path);
     if(path!=='/'&&result.introTextSize!==null)
      assert.ok(result.introTextSize>=14,'intro copy too small: '+path);
     for(const action of result.actions)
      assert.ok(action.height>=43,'touch control below 44px: '+path+' '+JSON.stringify(action));
     if(width<=390)assert.ok(result.dockVisible,'mobile dock missing');
     if(width===390&&(path==='/'||path==='/kamera/')){
      await page.screenshot({
       path:out+'/'+(path==='/'?'home':'camera')+'-'+width+'-'+theme+'.png',
       fullPage:false,animations:'disabled'
      });
     }
     if(path==='/aktualne/'&&width===390){
      // Synthetic 200% root text sizing is a layout stress test,
      // not a substitute for native text-only zoom in Safari.
      await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      const zoom=await page.evaluate(()=>({
       width:document.documentElement.scrollWidth,viewport:innerWidth,
       heading:document.querySelector('h1')?.getBoundingClientRect().right
      }));
      assert.ok(zoom.width<=width+2,'overflow in enlarged-text stress test');
      assert.ok((zoom.heading??0)<=width+2,'enlarged-text heading clipped');
     }
     console.log('DESIGN FINAL QA',path,width,theme,'PASS');
    }catch(error){
     failures.push({path,width,theme,reason:error instanceof Error?error.message:'unknown'});
     console.error('DESIGN FINAL QA FAIL',path,width,theme);
    }finally{await page.close();}
   }
   await context.close();
  }
 }
}finally{await browser.close();}
if(failures.length){
 console.error('Design QA failures',JSON.stringify(failures));
 process.exitCode=1;
}else{
 console.log('Design QA: 30 viewport/theme/route checks, captions, controls and synthetic text stress PASS');
}
