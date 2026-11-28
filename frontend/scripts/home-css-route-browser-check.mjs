/**
 * Smoke that checks actual emitted stylesheets after Astro build. Weather APIs
 * are not measured here; all observations are local read-only browser state.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const browser=await chromium.launch({headless:true});
try{
 for(const path of ['/','/prehled-novy/','/prehled-klasicky/','/aktualne/','/grafy/','/senzory/','/stav/','/kamera/','/klimatologie/','/historie-den/','/mapy/','/predpoved/','/rekordy/','/puda-ovzdusi/','/o-stanici/','/klimatologie/extremy/','/klimatologie/trendy/','/klimatologie/sezony/','/klimatologie/rocenka/']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/api/v1/**',route=>route.fulfill({status:503,body:'fixture unavailable'}));
  const response=await page.goto(new URL(path,base).href,{waitUntil:'domcontentloaded',timeout:25000});
  assert.equal(response?.status(),200,path+' must be available');
  const result=await page.evaluate(()=>({
   hasStyles:(()=>{
    const walk=rules=>{
     for(const rule of rules){
      if(rule.selectorText?.split(',').some(s=>s.trim()==='.evergreen-home') &&
       rule.style?.getPropertyValue('--evergreen-ink')?.trim())return true;
      if(rule.cssRules&&walk(rule.cssRules))return true;
     }
     return false;
    };
    for(const sheet of document.styleSheets){
     try{if(walk(sheet.cssRules))return true;}catch{}
    }
    return false;
   })(),
   hasWindStyles:(()=>{
    const walk=rules=>Array.from(rules).some(rule=>
     !!rule.style?.getPropertyValue('--wind-v2-ink')?.trim()||
     !!rule.cssRules&&walk(rule.cssRules));
    for(const sheet of document.styleSheets){
     try{if(walk(sheet.cssRules))return true;}catch{}
    }
    return false;
   })(),
   hasHistoryTableStyles:(()=>{
    const walk=rules=>Array.from(rules).some(rule=>
     rule.selectorText==='.history-table-alternative'&&rule.style?.getPropertyValue('margin-top')==='12px'||
     !!rule.cssRules&&walk(rule.cssRules));
    for(const sheet of document.styleSheets){
     try{if(walk(sheet.cssRules))return true;}catch{}
    }
    return false;
   })(),
   hasHistoryTable:!!document.querySelector('.history-table-alternative'),
   historyTableGeometry:(()=>{
    const table=document.querySelector('.history-table-alternative');
    if(!table)return null;
    const summary=table.querySelector('summary'),scroll=table.querySelector('.table-scroll');
    return {margin:getComputedStyle(table).marginTop,summaryMinHeight:getComputedStyle(summary).minHeight,
     scroll:getComputedStyle(scroll).overflowX,tableMinWidth:getComputedStyle(table.querySelector('table')).minWidth};
   })(),
   hasWind:!!document.querySelector('[data-wind-compass]'),
   windToken:document.querySelector('[data-wind-compass]')?
    getComputedStyle(document.querySelector('[data-wind-compass]')).getPropertyValue('--wind-v2-ink').trim():null,
   hasHome:!!document.querySelector('.evergreen-home'),
   homeToken:document.querySelector('.evergreen-home')?
    getComputedStyle(document.querySelector('.evergreen-home')).getPropertyValue('--evergreen-ink').trim():
    null
  }));
  console.log('HOME CSS ROUTE',path,JSON.stringify(result));
  assert.equal(result.hasStyles,path==='/prehled-klasicky/','evergreen style bleed on '+path);
  assert.equal(result.hasHome,path==='/prehled-klasicky/','evergreen DOM outside homepage');
  if(path==='/prehled-klasicky/')assert.ok(result.homeToken?.length>0,'homepage CSS token was not applied');
  const expectedWind=['/','/prehled-novy/','/prehled-klasicky/','/aktualne/'].includes(path);
  assert.equal(result.hasWind,expectedWind,'unexpected wind component '+path);
  assert.equal(result.hasWindStyles,expectedWind,'wind stylesheet presence '+path);
  if(expectedWind)assert.ok(result.windToken?.length>0,'wind CSS token not applied '+path);
  assert.equal(result.hasHistoryTableStyles,result.hasHistoryTable,'history table CSS/component mismatch '+path);
  if(path==='/grafy/')assert.ok(result.hasHistoryTable,'advanced history table missing');
  if(result.hasHistoryTable)assert.deepEqual(result.historyTableGeometry,{margin:'12px',summaryMinHeight:'44px',scroll:'auto',tableMinWidth:'520px'},'history table geometry '+path);
  await page.close();
 }
}finally{await browser.close();}
