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
   if(url.pathname==='/api/v1/climate/temperature-years'){
    // Synthetic historical sequence only in this isolated Chromium test.
    const points=[];
    for(let year=2009;year<=2026;year++){
     for(let month=1;month<=3;month++){
      if(year===2009&&month<3)continue;
      const days=new Date(Date.UTC(year,month,0)).getUTCDate();
      for(let day=1;day<=days;day++){
       if(year===2011&&month===2&&day<20)continue;
       const date=year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
       const following=new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
       const seconds=(Date.parse(pragueMidnightIso(following))-
        Date.parse(pragueMidnightIso(date)))/1000;
       const partial=year===2017&&month===2&&day===12;
       const value=Number(((year-2016)*.42+
        Math.sin((day/31+month)*1.8)*4+(month-1)*3).toFixed(2));
       points.push({date,year,monthDay:date.slice(5),value,
        validSeconds:partial?3600:seconds,expectedSeconds:seconds,
        quality:partial?'partial':'derived'});
      }
     }
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     schemaVersion:'1',metric:'outTemp',unit:'°C',dataset:'original',
     source:'weewx_daily',qcStatus:'original_unverified',
     firstYear:2009,endsBefore:'2026-11-03',
     dataRevision:'browser-fixture-temperature',points
    })});
   }
   if(url.pathname==='/api/v1/climate/annual-matrix'){
    const metric=url.searchParams.get('metric')??'outTemp';
    const unit=metric==='rain'?'mm':metric==='outHumidity'?'%':'°C';
    const years=Array.from({length:18},(_,i)=>{
     const year=2009+i;const inSample=year===2024||year===2025;
     const n=year===2024?366:365;
     return {year,calendarDays:n,elapsedDays:year===2026?306:n,
      sourceRows:inSample?3:0,validDays:inSample?2:0,
      invalidDays:0,missingDays:inSample?n-2:year===2026?306:n,
      completenessFraction:inSample?2/n:0,timeCoverageFraction:inSample?2/n:0,
      value:inSample?(metric==='rain'?0:11.5):null,unit,
      method:metric==='rain'?'sum':'time_weighted_mean',
      periodStatus:year===2026?'in_progress':'finished',
      qcStatus:'original_unverified',source:'weewx_daily'};
    });
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({schemaVersion:'1',metric,aggregation:metric==='rain'?'sum':'mean',
      units:'metricwx',dataset:'original',source:'weewx_daily',qcStatus:'original_unverified',
      startsAt:'2009-01-01',endsBefore:'2026-11-03',
      dataRevision:'browser-fixture',years})});
   }
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
  // The mobile climate menu must expose all sections without a horizontal strip.
  const quickNav=page.locator('[data-climate-quick-nav]');
  if(width===390){
   assert.equal(await quickNav.isVisible(),true);
   assert.equal(await page.locator('.climate-tabs').isVisible(),false);
   await quickNav.locator('summary').click();
   assert.equal(await quickNav.locator('nav a').count(),10);
   await quickNav.locator('a[href="#teplota-vsechny-roky"]').click();
   assert.equal(await quickNav.evaluate(el=>el.open),false);
  }else{
   assert.equal(await quickNav.isVisible(),false);
   assert.equal(await page.locator('.climate-tabs').isVisible(),true);
  }
  const all=page.locator('[data-all-years-temperature]');
  assert.equal(await all.count(),1);
  await all.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>
   document.querySelectorAll('[data-temperature-year]').length===18,
   null,{timeout:25000});
  assert.equal(await all.locator('[data-temperature-highlight] option').count(),18);
  assert.equal(await all.locator('[data-temperature-chart] svg').count(),1);
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/18 z 18/);
  const chartLabel=await all.locator('[data-temperature-chart]').getAttribute('aria-label');
  assert.match(chartLabel??'',/2009–2026/);
  await all.locator('[data-temperature-resolution]').selectOption('monthly');
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/měsíční/);
  await all.locator('[data-temperature-highlight]').selectOption('2024');
  await all.locator('[data-temperature-show-all]').uncheck();
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/1 z 18/);
  await all.locator('[data-temperature-filter] summary').click();
  await all.locator('[data-temperature-year="2025"]').check();
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/2 z 18/);
  await all.locator('[data-temperature-select-all]').click();
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/18 z 18/);
  await all.locator('[data-temperature-resolution]').selectOption('daily');
  assert.match(await all.locator('[data-temperature-summary]').textContent()??'',/denní/);
  await all.locator('[data-temperature-average]').uncheck();
  await all.locator('[data-temperature-range]').uncheck();
  await all.locator('[data-temperature-average]').check();
  await all.locator('[data-temperature-range]').check();
  assert.equal(await all.locator('[data-temperature-chart] svg').count(),1);
  console.log('ALL YEARS TEMP',width,'18 years, daily/monthly, filters, baseline/range, SVG');
  const section=page.locator('[data-year-comparison]');
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>{
   const node=document.querySelector('[data-heatmap-count="first"]');
   return Boolean(node?.textContent?.includes('/ 365'));
  },null,{timeout:25000});
  await page.waitForFunction(()=>{
   const body=document.querySelector('[data-annual-rows]');
   return body?.querySelectorAll('tr').length===18;
  },null,{timeout:10000});
  const annual=section.locator('[data-annual-rows]');
  assert.equal(await annual.locator('tr').count(),18);
  assert.match(await annual.locator('tr').first().textContent()??'',/2026/);
  assert.match(await annual.locator('tr').filter({hasText:'2025'}).first().textContent()??'',/2 \/ 365/);
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
  // Arrow-down follows the same calendar day, clamped for shorter months.
  await first.locator('[data-month-day="01-31"]').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('data-month-day')),'02-28');
  await second.locator('[data-month-day="02-29"]').click();
  assert.match(await section.locator('[data-compare-picked]').textContent()??'',/2025.*bez platného měření.*2024.*-2,0/s);
  const expectedHeight=await section.locator('[data-compare-chart]').evaluate(
   el=>el.getBoundingClientRect().height);
  assert.ok(expectedHeight>=250,'chart too short at '+width);
  assert.ok(await section.locator('[data-compare-chart] svg').count()>0,'no rendered SVG overlay');
  assert.ok(await section.locator('[data-compare-metric] option').count()>=35);
  await section.locator('[data-compare-metric]').selectOption('rain');
  await section.locator('[data-compare-form] button[type="submit"]').click();
  await page.waitForFunction(()=>{
   const label=document.querySelector('[data-comparison-value="first"]')?.textContent??'';
   return label.includes('5,0 mm');
  },null,{timeout:15000});
  assert.equal(await first.locator('[data-month-day="01-01"].is-missing').count(),0);
  assert.equal(await section.locator('.year-compare-swatch').count(),9);
  await page.locator('[data-theme-picker] summary').click();
  await page.locator('[data-theme-choice="dark"]').click();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  assert.equal(await page.locator('html').getAttribute('data-theme-preference'),'dark');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'horizontal overflow '+overflow+' at '+width);
  // ClimateDashboard's separate frost evidence also requests daily outTemp.
  const comparedYears=historyRequests.filter(r=>r.metric==='outTemp').map(r=>r.year);
  assert.ok(comparedYears.includes(2024)&&comparedYears.includes(2025));
  assert.ok(comparedYears.length>=2&&comparedYears.length<=4,
   'unexpected temperature request burst: '+JSON.stringify(historyRequests));
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
