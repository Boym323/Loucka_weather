import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const out='test-results/map-model';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of [320,390,768,1440,1920])for(const theme of ['light','dark']){
  const ctx=await browser.newContext({viewport:{width,height:900}});
  await ctx.addInitScript(t=>localStorage.setItem('loucka-theme',t),theme);
  let calls=0;
  await ctx.route('**/*',route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='api.open-meteo.com'){calls++;const n=u.searchParams.get('latitude').split(',').length;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(Array.from({length:n},(_,i)=>({current:{temperature_2m:i-4,wind_speed_10m:i+7,wind_direction_10m:270},current_units:{temperature_2m:'°C',wind_speed_10m:'km/h',wind_direction_10m:'°'}})))});
   }
   if(u.origin!==new URL(base).origin||u.pathname.startsWith('/api/v1/'))return route.abort();
   return route.continue();
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('mapy/',base).href,{waitUntil:'domcontentloaded'});
  await page.locator('[data-model-temperature]').check();
  await page.locator('.model-temperature-canvas').waitFor();
  await page.locator('[data-model-wind]').check();
  assert.ok(await page.locator('.model-wind-arrow').count()>0);
  const geometry=await page.evaluate(()=>{
   const layer=document.querySelector('.model-overlay');
   const boxes=[...layer.querySelectorAll('button')].map(e=>e.getBoundingClientRect());
   return {sibling:layer.parentElement.matches('[data-radar-map]'),overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top)),width:document.documentElement.scrollWidth};
  });
  assert.ok(geometry.sibling&&!geometry.overlap&&geometry.width<=width+2,JSON.stringify(geometry));
  assert.ok(await page.locator('.model-point-row').count()>=9);assert.equal(calls,1);
  await page.locator('[data-map-action="in"]').click();
  assert.match(await page.locator('[data-map-zoom]').textContent(),/Zoom 8.*radar zvětšen/);
  assert.equal(await page.locator('.model-overlay').isVisible(),false);
  await page.locator('[data-model-refresh]').click();await page.locator('.model-temperature-canvas').waitFor();
  assert.equal(calls,2);
  await page.locator('[data-model-list] summary').click();assert.equal(await page.locator('.model-point-row').first().isVisible(),true);
  await page.locator('[data-model-list] summary').click();
  await page.screenshot({path:out+'/map-'+width+'-'+theme+'.png',fullPage:true});
  await page.locator('[data-model-temperature]').uncheck();
  assert.equal(await page.locator('.model-temperature-canvas').count(),0);
  await page.locator('[data-model-wind]').uncheck();assert.equal(await page.locator('.model-overlay').isVisible(),false);
  assert.deepEqual(errors,[]);await ctx.close();
 }
 console.log('Map QA: 10 viewport/theme combinations, dynamic sampling, layers, zoom and no overlapping arrows PASS');
}finally{await browser.close();}
