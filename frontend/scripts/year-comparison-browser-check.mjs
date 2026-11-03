/**
 * Browser regression over an isolated local build with API fixtures. No fake
 * values are sent to the real weather API or written into any database.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pragueMidnightIso,nextDate} from '../src/shared/domain/statistics.ts';
import {pragueLocalDate} from '../src/shared/domain/year-comparison.ts';
const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const screenshots='test-results/layout-audit';
await mkdir(screenshots,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
const data={
 2024:{'01-01':5,'02-29':-2,'03-01':8},
 2025:{'01-01':0,'01-02':null,'03-01':10}
};
const rain={
 2024:{'01-01':0,'02-29':7,'03-01':3},
 2025:{'01-01':0,'01-02':null,'03-01':5}
};
const point=(year,key,value)=>{
 const day=year+'-'+key;
 return {startTime:pragueMidnightIso(day),endTime:pragueMidnightIso(nextDate(day)),
  value,quality:value===null?'missing':'derived',source:'weewx_daily',
  provenance:value===null?null:'weewx-daily-mean'};
};
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  const historyRequests=[];
  page.on('pageerror',error=>errors.push(width+'px JS: '+error.message));
  await page.route('**/api/v1/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/v1/station'){
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({schemaVersion:'1',capabilities:[]})});
   }
   if(url.pathname==='/api/v1/history'){
    const metric=url.searchParams.get('metric')??'outTemp';
    const year=Number(pragueLocalDate(url.searchParams.get('from')??'')?.slice(0,4));
    historyRequests.push({metric,year});
    const records=(metric==='rain'?rain:data)[year]??{};
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({
      schemaVersion:'1',metric,unit:metric==='rain'?'mm':'°C',
      resolution:'daily',dataRevision:'browser-only-fixture',
      points:Object.entries(records).map(([key,value])=>point(year,key,value))
     })});
   }
   return route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({error:'not part of this isolated browser fixture'})});
  });
  const response=await page.goto(origin+'klimatologie/',{waitUntil:'domcontentloaded'});
  assert.equal(response?.status(),200);
  const section=page.locator('[data-year-comparison]');
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
   const node=document.querySelector('[data-heatmap-count="first"]');
   return Boolean(node?.textContent?.includes('/ 365'));
  },null,{timeout:25000});
  const first=section.locator('[data-heatmap-cells="first"]');
  const second=section.locator('[data-heatmap-cells="second"]');
  assert.equal(await first.locator('.year-heatmap-day').count(),365);
  assert.equal(await second.locator('.year-heatmap-day').count(),366);
  assert.equal(await first.locator('[data-month-day="02-29"]').count(),0);
  assert.equal(await second.locator('[data-month-day="02-29"]').count(),1);
  assert.equal(await first.locator('[data-month-day="01-01"].is-missing').count(),0);
  assert.match(await first.locator('[data-month-day="01-01"]').getAttribute('aria-label')??'',
   /0,0/);
  assert.match(await section.locator('[data-comparison-coverage="matched"]').textContent()??'',
   /2/);
  assert.match(await section.locator('[data-comparison-value="difference"]').textContent()??'',
   /1,5/);
  await second.locator('[data-month-day="02-29"]').click();
  assert.match(await section.locator('[data-compare-picked]').textContent()??'',/2025.*bez platného měření.*2024.*-2,0/s);
  const expectedHeight=await section.locator('[data-compare-chart]').evaluate(
   el=>el.getBoundingClientRect().height);
  assert.ok(expectedHeight>=250,'chart too short at '+width);
  assert.ok(await section.locator('[data-compare-chart] svg').count()>0,'no rendered SVG overlay');
  await section.locator('[data-compare-metric]').selectOption('rain');
  await section.locator('[data-compare-form] button[type="submit"]').click();
  await page.waitForFunction(()=>{
   const label=document.querySelector('[data-comparison-value="first"]')?.textContent??'';
   return label.includes('5,0 mm');
  },null,{timeout:15000});
  assert.equal(await first.locator('[data-month-day="01-01"].is-missing').count(),0);
  assert.equal(await section.locator('.year-compare-swatch').count(),9);
  await page.locator('[data-theme-toggle]').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'horizontal overflow '+overflow+' at '+width);
  assert.equal(historyRequests.filter(r=>r.metric==='outTemp').length,2);
  assert.equal(historyRequests.filter(r=>r.metric==='rain').length,2);
  await page.screenshot({path:screenshots+'/year-compare-'+width+'.png',fullPage:true});
  console.log('YEAR COMPARISON',width,JSON.stringify({
   requests:historyRequests,hasOverlay:true,leapDate:true,zeroNotMissing:true,theme:'dark'
  }));
  await context.close();
 }
}finally{await browser.close();}
if(errors.length)throw Error(errors.join('\n'));
console.log('Year comparison browser QA completed');
