/**
 * Final visual QA on a local Astro preview, never on weather API/DB.
 * Explicit viewport and theme checks; screenshot values are not verified
 * meteorological readings and must not be described as live data.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

const base=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const coreRoutes=['/','/aktualne/','/grafy/','/kamera/','/klimatologie/'];
const routes=[...coreRoutes,'/rekordy/','/senzory/','/mapy/','/puda-ovzdusi/','/stav/','/o-stanici/','/klimatologie/extremy/','/klimatologie/trendy/','/klimatologie/sezony/','/klimatologie/rocenka/'];
const widths=[320,390,768,1024,1328,1440,1920];
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
       introHeight:(document.querySelector('.evergreen-intro,.page-intro,.atlas-edition-hero')?.getBoundingClientRect().height??0),
       h1Width:head?.width??0,h1Left:head?.left??0,h1Right:head?.right??0,
       introTextSize:introductory?parseFloat(getComputedStyle(introductory).fontSize):null,
       actions:actions.map(el=>({height:Math.round(el.getBoundingClientRect().height),name:el.tagName.toLowerCase()})),
       dockVisible:!!document.querySelector('.mobile-dock')&&getComputedStyle(document.querySelector('.mobile-dock')).display!=='none',
       spotlight:(()=>{
        const root=document.querySelector('.evergreen-home .evergreen-spotlight');
        if(!root)return null;
        const selectors=['.evergreen-camera-tile','.observatory-sky','.observatory-history','.evergreen-station-card'];
        return selectors.map(s=>{
         const el=root.querySelector(s);
         if(!el)return null;
         const r=el.getBoundingClientRect();
         return {top:Math.round(r.top),left:Math.round(r.left),width:Math.round(r.width)};
        });
       })()
      };
     });
     assert.equal(result.theme,theme,'theme selected');
     const contrast=await page.evaluate(()=>{
      const style=getComputedStyle(document.documentElement);
      const rgb=token=>{
       const value=style.getPropertyValue(token).trim();
       const match=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
       if(!match)throw new Error('Unresolved or unsupported color token: '+token+'='+value);
       const hex=match[1].length===3?[...match[1]].map(c=>c+c).join(''):match[1];
       return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
      };
      const lum=values=>values.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
      const pairs=[['--text','--panel'],['--muted','--panel'],['--muted','--panel-2'],['--teal','--panel']];
      if(lum(rgb('--text'))===lum(rgb('--panel')))throw new Error('Text and panel tokens resolve to identical luminance');
      const result=pairs.map(([a,b])=>{const x=lum(rgb(a)),y=lum(rgb(b));return {pair:a+'/'+b,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};});
      return result;
     });
     for(const item of contrast)assert.ok(item.ratio>=4.5,'token contrast below 4.5:1 '+JSON.stringify(item));
     assert.ok(result.scrollWidth<=width+2,'horizontal overflow at '+width+' '+path+': '+JSON.stringify(result));
     assert.ok(result.h1Text>0&&result.h1Font>=27,'missing or unreadable page heading');
     assert.ok(result.h1Font<=40,'page heading should not dominate the data: '+path);
     if(path==='/')assert.ok(result.introHeight<=105,'homepage identity strip too tall: '+result.introHeight);
     if(width>=1024)assert.ok(result.introHeight<=145,'desktop introduction too tall: '+path+' '+result.introHeight);
     else assert.ok(result.introHeight<=240,'mobile introduction too tall: '+path+' '+result.introHeight);
     assert.ok(result.h1Left>=-2&&result.h1Right<=width+2,'heading clipped: '+path);
     if(path!=='/'&&result.introTextSize!==null)
      assert.ok(result.introTextSize>=14,'intro copy too small: '+path);
     for(const action of (coreRoutes.includes(path)?result.actions:[]))
      assert.ok(action.height>=43,'touch control below 44px: '+path+' '+JSON.stringify(action));
     if(width<=390)assert.ok(result.dockVisible,'mobile dock missing');
     if(path.startsWith('/klimatologie')&&width<=760){
      assert.equal(await page.locator('.climate-atlas-nav').isVisible(),false,'duplicate mobile atlas navigation');
      assert.equal(await page.locator('.climate-mobile-chapters').isVisible(),true,'mobile chapter selector missing');
     }
     if(path==='/'){
      const shortcut=page.locator('[data-mobile-alert-shortcut]');
      if(width<=760){
       await shortcut.waitFor({state:'visible',timeout:10000});
       assert.match(await shortcut.textContent()??'',/Stav výstrah ČHMÚ nelze ověřit/);
       assert.equal(await page.locator('[data-home-expert-toggle]').getAttribute('aria-expanded'),'false');
       assert.equal(await page.locator('#home-history').isVisible(),false);
       assert.ok(await page.evaluate(()=>document.querySelector('[data-mobile-alert-shortcut]').getBoundingClientRect().bottom<document.querySelector('[data-home-hero]').getBoundingClientRect().top),'warning shortcut before instruments');
      }else assert.equal(await shortcut.isVisible(),false,'mobile-only warning shortcut on desktop');
      assert.ok(await page.evaluate(()=>document.querySelector('#pocasi-predpoved').getBoundingClientRect().top<document.querySelector('#pocasi-kamera').getBoundingClientRect().top),'forecast should precede camera');
      const boxes=result.spotlight;
      assert.ok(boxes?.length===4&&boxes.every(Boolean),'four observatory cards are present');
      assert.ok(boxes.every(b=>b.width>140),'instrument cards are not squeezed');
      const near=(a,b)=>Math.abs(a.top-b.top)<=3;
      if(width>=1271){
       assert.ok(boxes.every(b=>near(b,boxes[0])),'1328/1440 desktop must put all four instruments in one balanced row');
       assert.ok(boxes.every((b,i)=>i===0||b.left>boxes[i-1].left+50),'desktop instruments must be ordered across columns');
      }else if(width>760){
       assert.ok(near(boxes[0],boxes[1])&&near(boxes[2],boxes[3]),'tablet must use balanced two-by-two cards');
       assert.ok(boxes[2].top>boxes[0].top+30,'tablet row 2 must follow row 1');
      }else{
       assert.ok(boxes.every((b,i)=>i===0||b.top>boxes[i-1].top+30),'mobile instruments stack in source order');
      }
     }
     if((width===390&&(path==='/'||path==='/kamera/'))||(width===1328&&path==='/')){
      await page.screenshot({
       path:out+'/'+(path==='/'?'home':'camera')+'-'+width+'-'+theme+'.png',
       fullPage:width===1328,animations:'disabled'
      });
     }
     if(width===390||width===1440){
      const slug=path==='/'?'home':path.replace(/^\/|\/$/g,'').replaceAll('/','-');
      await page.screenshot({path:out+'/route-'+slug+'-'+width+'-'+theme+'.png',fullPage:true,animations:'disabled'});
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
 console.log('Design QA: '+routes.length*widths.length*themes.length+' viewport/theme/route checks PASS');
}
