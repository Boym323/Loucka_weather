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
 const unit=metric==='rain'?'mm':metric==='windSpeed'?'m/s':'°C';
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
    metric==='windSpeed'?2+i*.07:10+i*.2;
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
  maxDailyRain:{value:32.5,unit:'mm',localDate:'2023-08-26',quality:'unverified_original'},
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
 return {
  schemaVersion:'1',metric,unit:metric==='rain'?'mm':'°C',
  resolution:'daily',dataRevision:'browser-daily-only',
  points:dates.map((date,i)=>({
   startTime:pragueMidnightIso(date),
   endTime:pragueMidnightIso(new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10)),
   value:metric==='rain'?(i%7===0?2.5:0):15+Math.sin(i/17)*7,
   quality:'derived',source:'weewx_daily',provenance:'browser-only'
  }))
 };
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
    }
    if(path.endsWith('/sezony/')){
     await page.waitForFunction(()=>
      document.querySelector('[data-season-status]')?.textContent?.includes('Srovnání originálního')
      ,null,{timeout:20000});
     assert.ok(await page.locator('[data-season-chart] svg').count()>0);
     assert.match(await page.locator('[data-season-matched]').textContent()??'',/\d+ \/ \d+/);
     await page.locator('[data-season-kind]').selectOption('winter');
     await page.locator('[data-season-form] button').click();
     await page.waitForFunction(()=>
      document.querySelector('[data-season-title="second"]')?.textContent?.includes('Zima')
      &&document.querySelector('[data-season-status]')?.textContent?.includes('Srovnání originálního')
      ,null,{timeout:20000});
    }
    if(path.endsWith('/rocenka/')){
     await page.waitForFunction(()=>document.querySelector('[data-yearbook-print]')?.disabled===false,
      null,{timeout:24000});
     assert.equal(await page.locator('[data-yearbook-title]').textContent(),'2025');
     assert.equal(await page.locator('[data-yearbook-months] tr').count(),12);
     assert.match(await page.locator('[data-yearbook-story]').textContent()??'',/měsíc|Měsíční/);
    }
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    assert.ok(overflow<=2,path+' horizontal overflow '+overflow+' at '+viewport.width);
    if(path==='/klimatologie/rocenka/'||path==='/klimatologie/'){
     await page.screenshot({path:target+'/atlas-'+(path.endsWith('rocenka/')?'yearbook':'index')+
      '-'+viewport.name+'-'+theme+'.png',fullPage:true});
    }
   }
   assert.equal(exceptions.length,0,'Unhandled JS: '+exceptions.join('; '));
   console.log('ATLAS BROWSER',viewport.name,theme,'5 routes, real-data-shaped isolated fixtures OK');
   await context.close();
  }
 }
}finally{await browser.close();}
