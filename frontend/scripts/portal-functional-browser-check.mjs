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
const alert={headline:'Testovací výstraha – sníh',event:'Sníh',severity:'Severe',onset:dates[1]+'T12:00:00+01:00',expires:dates[1]+'T18:00:00+01:00',description:'Kontrolovaný test',instruction:'Testovací údaj'};
try{
 for(const width of [390,1440])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.addInitScript(t=>localStorage.setItem('loucka-theme',t),theme);
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   if(url.hostname==='api.open-meteo.com')return json(url.searchParams.has('hourly')?{hourly,hourly_units:{temperature_2m:'°C',precipitation:'mm',precipitation_probability:'%',wind_speed_10m:'m/s'}}:{daily});
   if(url.pathname==='/api/v1/alerts/local')return json({status:'verified',alerts:[alert],checkedAt:new Date().toISOString()});
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
  await page.goto(new URL('predpoved/',origin).href,{waitUntil:'domcontentloaded'});
  await page.locator('.portal-meteogram svg').waitFor();
  assert.equal(await page.locator('.portal-hour-table thead th').count(),25);
  assert.match(await page.locator('.portal-hour-table').textContent(),/—/);
  await page.locator('[data-forecast-warning="1"]').waitFor();
  assert.equal(await page.locator('[data-forecast-warning="1"]').textContent(),'1 výstraha');
  assert.equal(await page.locator('[data-forecast-warning="0"]').isVisible(),false);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await page.screenshot({path:out+'/forecast-'+width+'-'+theme+'.png',fullPage:true});
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
