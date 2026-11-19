/**
 * Smoke that checks actual emitted stylesheets after Astro build. Weather APIs
 * are not measured here; all observations are local read-only browser state.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
try{
 for(const path of ['/','/aktualne/','/grafy/']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:25000});
  assert.equal(response?.status(),200,path+' must be available');
  const result=await page.evaluate(()=>({
   hasStyles:(()=>{
    const walk=rules=>{
     for(const rule of rules){
      if(rule.selectorText?.split(',').some(s=>s.trim()==='.evergreen-home'))return true;
      if(rule.cssRules&&walk(rule.cssRules))return true;
     }
     return false;
    };
    for(const sheet of document.styleSheets){
     try{if(walk(sheet.cssRules))return true;}catch{}
    }
    return false;
   })(),
   hasHome:!!document.querySelector('.evergreen-home'),
   homeToken:document.querySelector('.evergreen-home')?
    getComputedStyle(document.querySelector('.evergreen-home')).getPropertyValue('--evergreen-ink').trim():
    null
  }));
  console.log('HOME CSS ROUTE',path,JSON.stringify(result));
  assert.equal(result.hasStyles,path==='/','evergreen style bleed on '+path);
  assert.equal(result.hasHome,path==='/','evergreen DOM outside homepage');
  if(path==='/')assert.ok(result.homeToken?.length>0,'homepage CSS token was not applied');
  await page.close();
 }
}finally{await browser.close();}
