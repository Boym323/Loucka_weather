/** Controlled local fixtures only; never calls the production archive. */
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const origin=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const out='test-results/portal-functional';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dates=Array.from({length:6},(_,i)=>new Date(Date.parse(day+'T12:00:00Z')+i*86400000).toISOString().slice(0,10));
const hour=Math.floor(Date.now()/3600000)*3600;
const daily={time:dates,weather_code:[0,3,71,61,3,0],temperature_2m_max:[5,4,3,2,1,5],temperature_2m_min:[0,-1,-2,-3,0,1],precipitation_sum:[0,0,2,5,0,0]};
const hourly={time:Array.from({length:30},(_,i)=>hour+i*3600),temperature_2m:Array.from({length:30},(_,i)=>i===3?null:2+i/10),precipitation:Array.from({length:30},(_,i)=>i===3?null:i%3),precipitation_probability:Array(30).fill(20),wind_speed_10m:Array(30).fill(3)};
const alert={headline:'Testovací výstraha – sníh',event:'Sníh',severity:'Severe',onset:dates[1]+'T12:00:00+01:00',expires:dates[1]+'T18:00:00+01:00',description:'Kontrolovaný test. Další podrobnosti.',instruction:'Testovací údaj'};
// Only browser-fixture timers are accelerated; real production requests are never made.
async function checkWarningRefresh(page,setResponse,resetResponse,strip){
 const entry=page.locator('.local-alert-entry');
 const summary=entry.locator('summary');
 await summary.focus();
 await summary.press('Enter');
 assert.equal(await entry.locator('details').evaluate(e=>e.open),true);
 const original=await summary.elementHandle();
 const checked=page.locator('.local-alert-checked');
 const oldChecked=await checked.textContent();
 await page.evaluate(()=>window.__refreshWarningFixture());
 await page.waitForFunction(old=>document.querySelector('.local-alert-checked')?.textContent!==old,oldChecked);
 assert.ok(await original.evaluate(e=>e.isConnected&&e===document.activeElement),'identical alert must retain its focused DOM node');
 assert.equal(await entry.locator('details').evaluate(e=>e.open),true);
 setResponse([{...alert,instruction:'Aktualizované doporučení'}]);
 await page.evaluate(()=>window.__refreshWarningFixture());
 await page.waitForFunction(()=>document.querySelector('.local-alert-entry details')?.textContent.includes('Aktualizované doporučení'));
 assert.equal(await entry.locator('details').evaluate(e=>e.open),true);
 assert.ok(await summary.evaluate(e=>e===document.activeElement),'changed matching alert restores keyboard focus');
 if(strip){
  const extreme={...alert,event:'Extrémní vítr',headline:'Extrémní vítr',severity:'Extreme',
   onset:new Date(Date.now()-60000).toISOString(),expires:new Date(Date.now()+3600000).toISOString()};
  setResponse([{...alert,instruction:'Aktualizované doporučení'},extreme]);
  await page.evaluate(()=>window.__refreshWarningFixture());
  const extremeEntry=page.locator('.local-alert-entry[data-level="extreme"]');
  await extremeEntry.waitFor();
  assert.equal(await extremeEntry.locator('details').evaluate(e=>e.open),true);
 }
 // Keep an explicitly expired alert in the upstream response, not just an empty list.
 const expired={...alert,onset:new Date(Date.now()-7200000).toISOString(),
  expires:new Date(Date.now()-3600000).toISOString()};
 setResponse([expired]);
 await page.evaluate(()=>window.__refreshWarningFixture());
 await page.waitForFunction(()=>document.querySelector('[data-alert-status]')?.textContent==='Bez výstrahy');
 assert.equal(await entry.count(),0);
 assert.ok(await page.locator('[data-alert-status]').evaluate(e=>e===document.activeElement));
 // Recover, then fail while a visitor is reading the alert details.
 setResponse([alert]);
 await page.evaluate(()=>window.__refreshWarningFixture());
 await summary.waitFor();
 await summary.focus();
 await summary.press('Enter');
 assert.equal(await entry.locator('details').evaluate(e=>e.open),true);
 setResponse(null);
 await page.evaluate(()=>window.__refreshWarningFixture());
 await page.waitForFunction(()=>document.querySelector('[data-alert-status]')?.textContent==='Stav nelze ověřit');
 assert.equal(await entry.count(),0);
 assert.ok(await page.locator('[data-alert-status]').evaluate(e=>e===document.activeElement),'unavailable state restores focus');
 resetResponse();
}
try{
 for(const width of [390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(t=>{
   localStorage.setItem('loucka-theme',t);
   const timers=[];
   const original=window.setInterval.bind(window);
   window.setInterval=(fn,delay,...args)=>{
    if(delay===300000&&typeof fn==='function')timers.push(()=>fn(...args));
    return original(fn,delay,...args);
   };
   window.__refreshWarningFixture=()=>timers.forEach(fn=>fn());
  },theme);
  let alertResponse=[alert],revision=0;
  const setResponse=next=>{alertResponse=next;};
  const resetResponse=()=>{alertResponse=[alert];};
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(url.hostname==='api.open-meteo.com')return json(url.searchParams.has('hourly')?{hourly,hourly_units:{temperature_2m:'°C',precipitation:'mm',precipitation_probability:'%',wind_speed_10m:'m/s'}}:{daily});
   if(url.pathname==='/api/v1/alerts/local')return alertResponse===null?json({status:'unavailable',alerts:[]}):
    json({status:'verified',alerts:alertResponse,checkedAt:new Date(Date.now()+60000*(revision++)).toISOString()});
   if(url.pathname==='/api/v1/statistics/daily'){
    const metric=url.searchParams.get('metric'),aggregation=url.searchParams.get('aggregation');
    return json({schemaVersion:'1',metric,aggregation,unit:metric==='rain'?'mm':'°C',value:metric==='rain'?0:aggregation==='min'?-2:7,quality:'derived',source:'weewx_daily',dataRevision:'fixture',completeness:{valid:288,fraction:1},timeCoverage:{fraction:1}});
   }
   if(url.pathname.startsWith('/api/v1/'))return route.fulfill({status:503,body:'fixture unavailable'});
   if(url.origin!==new URL(origin).origin)return route.abort();
   return route.continue();
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('.portal-meteogram svg').waitFor();
  assert.equal(await page.locator('.portal-hour-table thead th').count(),13);
  assert.equal(await page.locator('.portal-hour-details').evaluate(e=>e.open),false);
  await page.locator('.portal-hour-details summary').click();
  assert.equal(await page.locator('.portal-hour-table').isVisible(),true);
  await page.locator('.portal-hour-details summary').click();
  await page.locator('[data-forecast-warning="1"]').waitFor();
  assert.equal(await page.locator('[data-local-warnings]').count(),1);
  const warning=page.locator('.local-alert-entry');
  assert.equal(await warning.getAttribute('data-validity'),'upcoming');
  await warning.locator('summary').click();
  assert.ok(await warning.locator('details').evaluate(e=>e.open));
  assert.match(await warning.locator('details').textContent(),/Testovací údaj/);
  await warning.locator('summary').click();
  assert.equal(await page.locator('.portal-measurements [data-archive-trends]').count(),1);
  assert.equal(await page.locator('.portal-measurements [data-wind-compass]').count(),1);
  assert.equal(await page.locator('[data-wind-compass]').count(),1);
  assert.equal(await page.locator('.portal-measurements [data-metric-value="windSpeed"]').count(),0);
  const quick=await page.evaluate(()=>{
   const top=s=>document.querySelector(s).getBoundingClientRect().top;
   return {wind:top('[data-wind-compass]'),radar:top('#pocasi-radar'),history:top('.portal-history'),alertHeight:document.querySelector('.portal-warning').getBoundingClientRect().height};
  });
  assert.ok(quick.wind<quick.radar&&quick.radar<quick.history,'quick-view order '+JSON.stringify(quick));
  assert.ok(quick.alertHeight<200,'collapsed future warning dominates the page '+JSON.stringify(quick));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.screenshot({path:out+'/portal-'+width+'-'+theme+'.png',fullPage:true});
  await checkWarningRefresh(page,setResponse,resetResponse,true);
  await page.goto(new URL('predpoved/',origin).href,{waitUntil:'domcontentloaded'});
  await page.locator('.portal-meteogram svg').waitFor();
  assert.equal(await page.locator('.portal-hour-table thead th').count(),25);
  assert.match(await page.locator('.portal-hour-table').textContent(),/—/);
  await page.locator('[data-forecast-warning="1"]').waitFor();
  assert.equal(await page.locator('[data-forecast-warning="1"]').textContent(),'1 výstraha');
  assert.equal(await page.locator('[data-forecast-warning="0"]').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.screenshot({path:out+'/forecast-'+width+'-'+theme+'.png',fullPage:true});
  await checkWarningRefresh(page,setResponse,resetResponse,false);
  await page.goto(new URL('historie-den/',origin).href,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('[data-calendar-value="0"]')?.textContent?.includes('°C'));
  await page.locator('[name="date"]').fill('2024-06-15');
  await page.locator('[data-calendar-form] button').click();
  await page.waitForFunction(()=>document.querySelector('[data-calendar-graph]')?.getAttribute('href')?.includes('2024-06-15'));
  await page.waitForFunction(()=>document.querySelector('[data-calendar-value="2"]')?.textContent?.includes('mm'));
  assert.match(await page.locator('[data-calendar-value="2"]').textContent(),/0,0 mm/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.screenshot({path:out+'/calendar-'+width+'-'+theme+'.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Portal functional QA: 4 viewport/theme combinations, hourly data, warning overlap and historical calendar PASS');
}finally{await browser.close();}
