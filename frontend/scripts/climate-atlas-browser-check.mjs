/**
 * Offline Astro browser regression of the Atlas. Fixtures exist only inside
 * Chromium: never write to GW3000, WeeWX or MariaDB.
 */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pragueMidnightIso} from '../src/shared/domain/statistics.ts';
import {pragueLocalDate} from '../src/shared/domain/year-comparison.ts';
import {calendarDates} from '../src/shared/domain/climate-atlas.ts';

const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const target='test-results/layout-audit';
await mkdir(target,{recursive:true});
const yearly=(metric)=>{
 const unit=metric==='rain'?'mm':metric==='windSpeed'?'m/s':metric==='outHumidity'?'%':'°C';
 return {
  schemaVersion:'1',metric,aggregation:metric==='rain'?'sum':'mean',
  units:'metricwx',dataset:'original',source:'weewx_daily',
  qcStatus:'original_unverified',startsAt:'2009-01-01',
  endsBefore:'2026-11-07',dataRevision:'browser-only-'+metric,
  years:Array.from({length:18},(_,i)=>{
   const year=2009+i;
   const ongoing=year===2026;
   const calendarDays=new Date(Date.UTC(year+1,0,0)).getUTCDate()===31?
    (new Date(Date.UTC(year,1,29)).getUTCMonth()===1?366:365):365;
   const elapsedDays=ongoing?310:calendarDays;
   const validDays=year===2014?10:Math.floor(elapsedDays*.96);
   const value=metric==='rain'?500+i*8:
    metric==='windSpeed'?2+i*.07:metric==='outHumidity'?70+i*.2:10+i*.2;
   return {year,calendarDays,elapsedDays,sourceRows:validDays,
    validDays,invalidDays:0,missingDays:elapsedDays-validDays,
    completenessFraction:validDays/elapsedDays,timeCoverageFraction:validDays/elapsedDays,
    value,unit,method:metric==='rain'?'sum':'time_weighted_mean',
    periodStatus:ongoing?'in_progress':'finished',qcStatus:'original_unverified',
    source:'weewx_daily'};
  })
 };
};
const records={
 schemaVersion:'1',status:'preliminary',dataset:'original',
 records:{
  minTemp:{value:-18.2,unit:'°C',localDate:'2012-02-06',quality:'unverified_original'},
  maxTemp:{value:36.5,unit:'°C',localDate:'2015-08-08',quality:'unverified_original'},
  maxDailyRain:{value:32.5,unit:'mm',localDate:'2021-07-25',quality:'unverified_original'},
  maxWindGust:{value:23.5,unit:'m/s',localDate:'2020-03-10',quality:'unverified_original'}
 },
 dayTypes:{frost:430,ice:121,summer:310,tropical:45},
 coverage:{temperatureDays:5800,rainDays:5600,windDays:5300,calendarDays:6400}
};
const daily=(url)=>{
 const metric=url.searchParams.get('metric');
 const first=pragueLocalDate(url.searchParams.get('from')??'');
 const last=pragueLocalDate(url.searchParams.get('to')??'');
 if(!metric||!first||!last)throw Error('Invalid requested dates');
 const dates=calendarDates(first,last);
 const rainGapFixture=metric==='rain'&&first==='2021-01-01'&&last==='2022-01-01';
 return {
  schemaVersion:'1',metric,unit:metric==='rain'?'mm':metric==='outHumidity'?'%':'°C',
  resolution:'daily',dataRevision:'browser-daily-only',
  points:dates.map((date,i)=>({
   startTime:pragueMidnightIso(date),
   endTime:pragueMidnightIso(new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)),
   value:metric==='rain'?(rainGapFixture&&i===0?null:rainGapFixture&&i===1?-1:i%7===0?2.5:0):metric==='outHumidity'?(i===0?null:i===1?0:70+Math.sin(i/17)*7):15+Math.sin(i/17)*7,
   quality:(metric==='outHumidity'||rainGapFixture)&&i===0?'missing':'derived',source:'weewx_daily',provenance:'browser-only'
  }))
 };
};
const temperatureYears=()=>{
 const points=[];
 for(let year=2023;year<=2026;year++){
  const from=year+'-01-01';
  const end=year===2026?'2026-11-07':(year+1)+'-01-01';
  for(const date of calendarDates(from,end)){
   const next=new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   const seconds=(Date.parse(pragueMidnightIso(next))-Date.parse(pragueMidnightIso(date)))/1000;
   points.push({date,year:Number(date.slice(0,4)),monthDay:date.slice(5),
    value:10+(year-2023)*1.5+Math.sin(Number(date.slice(5,7))*1.2)*6,
    validSeconds:seconds,expectedSeconds:seconds,quality:'derived'});
  }
 }
 return {schemaVersion:'1',metric:'outTemp',unit:'°C',dataset:'original',
  source:'weewx_daily',qcStatus:'original_unverified',firstYear:2009,
  endsBefore:'2026-11-07',dataRevision:'synthetic-browser-only',points};
};
const raw=(url)=>{
 const from=Date.parse(url.searchParams.get('from')??'');
 const to=Date.parse(url.searchParams.get('to')??'');
 const metric=url.searchParams.get('metric');
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>26*3600000)
  throw Error('Invalid historical day');
 const points=[];
 for(let t=from;t<to;t+=300000){
  points.push({startTime:new Date(t).toISOString(),
   endTime:new Date(Math.min(to,t+300000)).toISOString(),
   value:metric==='rain'?(points.length%20===0?1.4:0):10+Math.sin(points.length/26)*5,
   quality:'derived',source:'weewx_archive',provenance:'browser-only'});
 }
 return {schemaVersion:'1',metric,unit:metric==='rain'?'mm':metric==='windGust'?'m/s':'°C',
  resolution:'raw',dataRevision:'browser-raw-fixture',points};
};
const routes=['/klimatologie/','/klimatologie/extremy/','/klimatologie/trendy/',
 '/klimatologie/sezony/','/klimatologie/rocenka/'];
const browser=await chromium.launch({headless:true});
try{
 for(const viewport of [{name:'mobil',width:390},{name:'desktop',width:1440}]){
  for(const theme of ['light','dark']){
   const context=await browser.newContext({viewport:{width:viewport.width,height:900}});
   await context.route('**/api/v1/**',async route=>{
    const u=new URL(route.request().url());
    let result;
    try{
     if(u.pathname==='/api/v1/climate/records')result=records;
     else if(u.pathname==='/api/v1/climate/annual-matrix')
      result=yearly(u.searchParams.get('metric'));
     else if(u.pathname==='/api/v1/climate/temperature-years')
      result=temperatureYears();
     else if(u.pathname==='/api/v1/history'&&u.searchParams.get('resolution')==='raw')
      result=raw(u);
     else if(u.pathname==='/api/v1/history'&&u.searchParams.get('resolution')==='daily')
      result=daily(u);
     else if(u.pathname==='/api/v1/station')
      result={schemaVersion:'1',capabilities:[]};
     else result={error:'outside isolated browser fixture'};
     await route.fulfill({status:result.error?404:200,contentType:'application/json',
      body:JSON.stringify(result)});
    }catch(e){
     await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:String(e)})});
    }
   });
   const page=await context.newPage();
   await page.addInitScript(mode=>localStorage.setItem('loucka-theme',mode),theme);
   const exceptions=[];
   page.on('pageerror',e=>exceptions.push(e.message));
   for(const path of routes){
    const response=await page.goto(new URL(path.replace(/^\//,''),origin).href,{
     waitUntil:'domcontentloaded',timeout:25000});
    assert.equal(response?.status(),200,path+' should load');
    assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
    assert.equal(await page.locator('.climate-atlas-nav a').count(),5);
    // An old .atlas-hero grid once displaced and clipped the large heading.
    const heading=await page.locator('.atlas-edition-hero h1').evaluate(node=>{
     const rect=node.getBoundingClientRect();
     const hero=node.closest('.atlas-edition-hero').getBoundingClientRect();
     return {left:rect.left,heroLeft:hero.left,right:rect.right,heroRight:hero.right};
    });
    assert.ok(heading.left-heading.heroLeft<=100,
     path+' heading displaced by legacy hero layout: '+JSON.stringify(heading));
    assert.ok(heading.right<=heading.heroRight+2,
     path+' title overflows editorial hero '+JSON.stringify(heading));
    if(path==='/klimatologie/'){
     assert.equal(await page.locator('.climate-atlas-card').count(),4);
     assert.equal(await page.locator('#teplota-vsechny-roky').count(),1);
     assert.equal(await page.locator('#srovnani-let').count(),1);
    }
    if(path.endsWith('/extremy/')){
     await page.waitForFunction(()=>
      document.querySelector('[data-extreme-value="minTemp"]')?.textContent?.includes('-18,2')
      ,null,{timeout:12000});
     assert.equal(await page.locator('[data-extreme-timeline] tr').count(),4);
     assert.match(await page.locator('[data-extreme-date="maxDailyRain"]').textContent()??'',/známé omezení/);
     assert.match(await page.locator('[data-extreme-timeline]').textContent()??'',/Červenec 2021/);
     assert.equal(await page.locator('[data-extreme-cards] li').count(),4);
     const onPhone=viewport.width<650;
     const cardsMode=await page.locator('[data-extreme-cards]').evaluate(
      element=>getComputedStyle(element).display);
     assert.equal(cardsMode,onPhone?'grid':'none');
     await page.locator((onPhone?'[data-extreme-cards]':'[data-extreme-timeline]')+
      ' [data-extreme-metric="minTemp"]').click();
     await page.waitForFunction(()=>
      document.querySelector('[data-extreme-day-status]')?.textContent?.includes('platných intervalů'),
      null,{timeout:12000});
     assert.ok(await page.locator('[data-extreme-day-chart] svg').count()>0);
     assert.match(await page.locator('[data-extreme-day-meta]').textContent()??'',
      /originální|Původní/i);
    }
    if(path.endsWith('/trendy/')){
     await page.waitForFunction(()=>
      document.querySelector('[data-trend-rows] tr')?.textContent?.includes('2026')
      ,null,{timeout:12000});
     assert.equal(await page.locator('[data-trend-rows] tr').count(),18);
     assert.ok(await page.locator('[data-trend-chart] svg').count()>0);
     assert.notEqual((await page.locator('[data-trend-slope]').textContent())?.trim(),'—');
     await page.locator('[data-trend-metric]').selectOption('rain');
     await page.locator('[data-trend-form] button').click();
     await page.waitForFunction(()=>
      document.querySelector('[data-trend-status]')?.textContent?.includes('Originální')
      &&document.querySelector('[data-trend-rows]')?.textContent?.includes('mm')
      ,null,{timeout:12000});
     const rainYearRow=page.locator('[data-trend-rows] tr').filter({has:page.getByRole('cell',{name:'2021',exact:true})});
     assert.match(await rainYearRow.textContent()??'',/Známé omezení · mimo trend/);
     await page.locator('[data-rain-year]').selectOption('2021');
     await page.locator('[data-rain-form] button').click();
     await page.waitForFunction(()=>document.querySelector('[data-rain-available]')?.textContent==='363 / 365',null,{timeout:12000});
     assert.equal(await page.locator('[data-rain-months] tr').count(),12);
     assert.equal(await page.locator('[data-rain-wet-dry]').textContent(),'52 / 311');
     assert.equal(await page.locator('[data-rain-months] tr').first().locator('td').nth(3).textContent(),'1');
     assert.equal(await page.locator('[data-rain-months] tr').first().locator('td').nth(4).textContent(),'1');
     assert.match(await page.locator('[data-rain-risk]').textContent()??'',/Červenec 2021/);
     await page.locator('[data-rain-year]').selectOption('2024');
     await page.locator('[data-rain-form] button').click();
     await page.waitForFunction(()=>document.querySelector('[data-rain-available]')?.textContent==='366 / 366',null,{timeout:12000});
     assert.equal(await page.locator('[data-rain-risk]').isVisible(),false);
     await page.locator('[data-rh-year]').selectOption('2022');
     await page.locator('[data-rh-form] button').click();
     await page.waitForFunction(()=>document.querySelector('[data-rh-available]')?.textContent==='363 / 365'
      &&document.querySelector('[data-rh-time]')?.textContent?.includes('%'),null,{timeout:12000});
     assert.equal(await page.locator('[data-rh-months] tr').count(),12);
     assert.equal(await page.locator('[data-rh-months] tr').first().locator('td').nth(1).textContent(),'1');
     assert.equal(await page.locator('[data-rh-months] tr').first().locator('td').nth(2).textContent(),'1');
     assert.equal(await page.locator('[data-rh-2022]').isVisible(),true);
     await page.locator('[data-rh-year]').selectOption('2024');
     await page.locator('[data-rh-form] button').click();
     await page.waitForFunction(()=>document.querySelector('[data-rh-available]')?.textContent==='364 / 366',null,{timeout:12000});
     assert.equal(await page.locator('[data-rh-2022]').isVisible(),false);
    }
    if(path.endsWith('/sezony/')){
     await page.waitForFunction(()=>
      document.querySelector('[data-season-status]')?.textContent?.includes('Srovnání originálního')
      ,null,{timeout:20000});
     assert.ok(await page.locator('[data-season-chart] svg').count()>0);
     assert.match(await page.locator('[data-season-matched]').textContent()??'',/\d+ \/ \d+/);
     await page.waitForFunction(()=>
      document.querySelector('[data-ranking-status]')?.textContent?.includes('Porovnatelných'),
      null,{timeout:20000});
     assert.ok(await page.locator('[data-ranking-rows] tr').count()>=2);
     assert.match(await page.locator('[data-ranking-rows]').textContent()??'',/Léto 2025/);
     await page.locator('[data-ranking-rows] [data-rank-year="2024"]').click();
     await page.waitForFunction(()=>
      document.querySelector('[data-season-first]')?.value==='2024',
      null,{timeout:12000});
     await page.locator('[data-season-kind]').selectOption('winter');
     await page.locator('[data-season-form] button').click();
     await page.waitForFunction(()=>
      document.querySelector('[data-season-title="second"]')?.textContent?.includes('Zima')
      &&document.querySelector('[data-season-status]')?.textContent?.includes('Srovnání originálního')
      ,null,{timeout:20000});
     await page.waitForFunction(()=>
      document.querySelector('[data-ranking-rows]')?.textContent?.includes('Zima 2024/2025')
      ,null,{timeout:12000});
    }
    if(path.endsWith('/rocenka/')){
     await page.waitForFunction(()=>document.querySelector('[data-yearbook-print]')?.disabled===false,
      null,{timeout:24000});
     assert.equal(await page.locator('[data-yearbook-title]').textContent(),'2025');
     assert.equal(await page.locator('[data-yearbook-months] tr').count(),12);
     assert.match(await page.locator('[data-yearbook-story]').textContent()??'',/měsíc|Měsíční/);
     assert.equal(await page.locator('[data-yearbook-temp-chart] svg').count(),1);
     assert.equal(await page.locator('[data-yearbook-rain-chart] svg').count(),1);
     assert.equal(await page.locator('[data-yearbook-temp-chart] .atlas-chart-temp-bar').count(),12);
     assert.equal(await page.locator('[data-yearbook-rain-chart] .atlas-chart-rain-bar').count(),12);
     assert.equal((await page.locator('[data-yearbook-rain-chart] .chart-axis').first().textContent())?.trim(),'0',
      'rainfall visual scale starts at zero, not negative precipitation');
     await page.emulateMedia({media:'print'});
     assert.equal(await page.locator('.site-header').evaluate(e=>getComputedStyle(e).display),'none');
     assert.equal(await page.locator('.atlas-yearbook').evaluate(e=>getComputedStyle(e).display)!=='none',true);
     await page.emulateMedia({media:'screen'});
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=2,path+' horizontal overflow '+overflow+' at '+viewport.width);
    // Reset scroll position after interactive click so sticky header is not
    // frozen halfway down a full-page screenshot.
    await page.evaluate(()=>window.scrollTo({top:0,left:0,behavior:'instant'}));
    // Keep reviewable captures of every atlas chapter, not just the landing.
    await page.screenshot({path:target+'/atlas-'+
     (path==='/klimatologie/'?'index':path.split('/').filter(Boolean).at(-1))+
     '-'+viewport.name+'-'+theme+'.png',fullPage:true});
   }
   assert.equal(exceptions.length,0,'Unhandled JS: '+exceptions.join('; '));
   console.log('ATLAS BROWSER',viewport.name,theme,'5 routes, real-data-shaped isolated fixtures OK');
   await context.close();
  }
 }
}finally{await browser.close();}
