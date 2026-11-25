/**
 * External screenshot and runtime smoke test for the *deployed* preview.
 * Read-only: never modifies the site, GitHub or MariaDB.
 * Produces desktop/mobile screenshots in test-results/preview-screenshots.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import {deploymentRelation} from './deployment-provenance.mjs';

const base=process.env.LOUCKA_PREVIEW_URL || 'https://dev.pocasi-loucka.eu';
const out='test-results/preview-screenshots';
const routes=[
 ['prehled','/'],['aktualne','/aktualne/'],['grafy','/grafy/'],
 ['klimatologie','/klimatologie/'],
 ['atlas-extremy','/klimatologie/extremy/'],['atlas-trendy','/klimatologie/trendy/'],
 ['atlas-sezony','/klimatologie/sezony/'],['atlas-rocenka','/klimatologie/rocenka/'],
 ['kamera','/kamera/'],
 ['mapy','/mapy/'],['senzory','/senzory/'],['rekordy','/rekordy/'],['puda-ovzdusi','/puda-ovzdusi/'],['stav','/stav/'],['o-stanici','/o-stanici/']
];
const sizes=[
 {name:'desktop',width:1440,height:900},
 {name:'mobil',width:390,height:844}
];
const errors=[];
const visitorPerformance=[];
const expectedCommit=process.env.LOUCKA_EXPECT_COMMIT || '';
const checkPublicReady=async()=>{
 try{
  const response=await fetch(base+'/api/v1/readyz?probe='+Date.now(),{
   cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  const data=await response.json().catch(()=>null);
  return response.ok&&data?.ready===true;
 }catch{return false;}
};
const waitForPublishedCommit=async () => {
 const deadline=Date.now()+6*60_000;
 let last='metadata not yet available';
 let observedCommit='';
 let observedRelation='mismatch';
 let lastComparisonAt=0;
 while(Date.now()<deadline){
  try{
   const response=await fetch(base+'/deployment.json?verify='+Date.now(),{
    cache:'no-store',
    signal:AbortSignal.timeout(8000)
   });
   if(response.ok){
    const body=await response.json();
    last=String(body.commit ?? 'unknown');
    // A previous push may be superseded before the 2-minute LXC sync finishes.
    // Verify ancestry against GitHub: never accept a stale or unrelated SHA.
    if(body.commit!==observedCommit||
       (observedRelation==='mismatch'&&Date.now()-lastComparisonAt>30_000)){
     observedCommit=body.commit;
     lastComparisonAt=Date.now();
     observedRelation=await deploymentRelation(expectedCommit,body.commit);
    }
    if(['exact','unconstrained','superseding'].includes(observedRelation)){
     // Publishing the static commit can briefly precede API activation.
     // Require stable readiness before visiting pages, including manual/scheduled runs.
     await new Promise(resolve=>setTimeout(resolve,2000));
     if(await checkPublicReady()){
      await new Promise(resolve=>setTimeout(resolve,1500));
      if(await checkPublicReady()){
       console.log('Confirmed public deploy with ready API:',body.commit,
        observedRelation==='superseding'?'(GitHub-verified descendant of '+expectedCommit+')':
         '('+observedRelation+')');
       return;
      }
     }
     last='API not yet stable after deploying '+body.commit;
    }else last='Deployment '+last+' is '+observedRelation+' vs expected '+(expectedCommit||'current');
   } else last='HTTP '+response.status;
  }catch(e){last=String(e);}
  await new Promise(resolve=>setTimeout(resolve,12000));
 }
 throw new Error('Staging did not deploy ready API for expected '+(expectedCommit||'current')+' within 6 minutes. Last: '+last);
};
await waitForPublishedCommit();
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const size of sizes){
  const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1});
  // Screenshot baseline is intentionally light; auto day/night has its own tests.
  await page.addInitScript(()=>localStorage.setItem('loucka-theme','light'));
  // CI-only lab observers: initialized before each navigation and read locally.
  // This code is injected by Playwright; it is NOT included in Astro bundles.
  await page.addInitScript(()=>{
   const lab={lcpCandidateMs:null,lcpCandidateType:null,clsSessionMax:0,longTaskCount:0,longTaskDurationMs:0};
   window.__louckaVisitorLab=lab;
   try{
    new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      lab.lcpCandidateMs=entry.startTime;
      const tag=entry.element?.tagName?.toLowerCase();
      lab.lcpCandidateType=tag==='img'?'image':
       tag==='h1'||tag==='h2'?'heading':
       tag==='p'||tag==='span'||tag==='div'?'text-or-container':'other';
     }
    }).observe({type:'largest-contentful-paint',buffered:true});
   }catch{/* Unsupported entry type: leave null. */}
   try{
    let sessionStart=-1,previous=-1,sessionValue=0;
    new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      if(entry.hadRecentInput)continue;
      const now=entry.startTime;
      if(sessionStart<0||now-previous>1000||now-sessionStart>5000){
       sessionStart=now;sessionValue=0;
      }
      previous=now;sessionValue+=entry.value;
      lab.clsSessionMax=Math.max(lab.clsSessionMax,sessionValue);
     }
    }).observe({type:'layout-shift',buffered:true});
   }catch{/* Unsupported entry type: leave zero. */}
   try{
    new PerformanceObserver(list=>{
     for(const entry of list.getEntries()){
      lab.longTaskCount++;
      lab.longTaskDurationMs+=entry.duration;
     }
    }).observe({type:'longtask',buffered:true});
   }catch{/* Unsupported entry type: leave zero. */}
  });

  page.on('pageerror',error=>errors.push(size.name+': JavaScript exception: '+error.message));
  for(const [name,path] of routes){
   try{
    const response=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response||response.status()!==200){
     errors.push(size.name+' '+path+': HTTP '+(response?.status()??'no response'));
     continue;
    }
    await page.waitForTimeout(900);
    // Geometry assertions prevent future desktop/mobile visual drift without
    // comparing live weather images or dynamic values pixel-by-pixel.
    if(path==='/'){
     const layout=await page.evaluate(()=>{
      const columns=selector=>{
       const element=document.querySelector(selector);
       return element?getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length:0;
      };
      const hero=document.querySelector('.atlas-hero');
      const firstNav=document.querySelector('.mobile-dock a');
      return {
       defaultTheme:document.documentElement.dataset.theme,
       heroHeight:hero?.getBoundingClientRect().height??0,
       instrumentColumns:columns('.evergreen-hero'),
       glassTransparency:getComputedStyle(hero).backdropFilter,
       landscapeImage:document.querySelector('.evergreen-landscape img')?.getAttribute('src')??'',
       stationCard:document.querySelector('.evergreen-station-card')!==null,
       sourceLabel:document.querySelector('.evergreen-landscape-credit')?.textContent??'',
       windSpeed:document.querySelector('.evergreen-hero [data-wind-value="windSpeed"]')!==null,
       windGust:document.querySelector('.evergreen-hero [data-wind-value="windGust"]')!==null,
       heroChart:document.querySelector('.evergreen-hero [data-history-chart]')!==null,
       observatoryColumns:columns('.observatory-instruments'),
       windInstrument:document.querySelector('.observatory-wind [data-wind-compass]')!==null,
       solarPanel:document.querySelector('[data-solar-cycle]')!==null,
       solarRise:document.querySelector('[data-solar-rise]')?.textContent?.trim()??'',
       moonPhase:document.querySelector('[data-moon-illumination]')?.textContent?.trim()??'',
       pastDayPanel:document.querySelector('[data-day-history]')!==null,
       temperature:document.querySelector('.atlas-hero [data-metric-value="outTemp"]')!==null,
       dataStatus:document.querySelector('.atlas-hero [data-current-status]')!==null,
       forecastColumns:columns('.atlas-forecast .forecast-tabs'),
       dailyColumns:columns('.atlas-hero-daily .daily-brief'),
       analyticsColumns:columns('.atlas-home-analytics'),
       destinations:document.querySelectorAll('.atlas-home-destinations a').length,
       destinationColumns:columns('.atlas-home-destinations'),
       cameraImage:document.querySelector('.atlas-media-image img')!==null,
       radar:document.querySelector('.atlas-radar-tile [data-radar-map]')!==null,
       pictogramCount:document.querySelectorAll('.atlas-forecast [data-forecast-icon] svg').length,
       hasDecorativeHero:document.querySelector('.atlas-hero-backdrop')!==null,
       heroBackground:getComputedStyle(document.querySelector('.atlas-hero')).backgroundImage,
       svgIcons:document.querySelectorAll('.mobile-dock > a svg, .atlas-mobile-more > summary svg').length,
       moreLinks:document.querySelectorAll('.atlas-mobile-more-menu a').length,
       mobileTargetHeight:firstNav?.getBoundingClientRect().height??0,
       chartHeight:document.querySelector('.atlas-main-history .chart-box')?.getBoundingClientRect().height??0
      };
     });
     console.log('EVERGREEN OBSERVATORY GEOMETRY',size.name,JSON.stringify(layout));
     if(layout.defaultTheme!=='light')errors.push(size.name+': fresh visit must default to light theme');
     if(!layout.temperature||!layout.dataStatus)errors.push(size.name+': missing live/archive reading source in hero');
     if(!layout.windInstrument||!layout.solarPanel||!layout.pastDayPanel||!layout.stationCard)
      errors.push(size.name+': approved four-feature observatory design is incomplete');
     if(!layout.windSpeed||!layout.windGust||!layout.heroChart)
      errors.push(size.name+': real anemometer speed/gust or 24h archive chart missing from hero');
     // The chart engine loads only after DOMContentLoaded. Verify its SVG
     // and a real completed archive request, not merely placeholder markup.
     const toggle=page.locator('[data-home-expert-toggle]');
     const collapsed=await toggle.isVisible();
     if(collapsed){
      if(await toggle.getAttribute('aria-expanded')!=='false')errors.push(size.name+': compact home should start collapsed');
      await toggle.click();
      await page.locator('.evergreen-hero [data-history-chart]').scrollIntoViewIfNeeded();
     }
     const chartPainted=await page.waitForFunction(()=>{
      const root=document.querySelector('.evergreen-hero [data-history-chart]');
      const status=root?.querySelector('[data-chart-status]')?.textContent??'';
      return !!root?.querySelector('[data-chart-canvas] svg') &&
       /naměřených bodů/.test(status);
     },null,{timeout:16000}).then(()=>true).catch(()=>false);
     if(!chartPainted)
      errors.push(size.name+': deferred homepage history chart did not paint a real archive SVG');
     if(collapsed){await toggle.click();await page.evaluate(()=>window.scrollTo(0,0));}
     // Source identity and freshness caution are the contract; the public
     // wording was simplified in PR #114 and must not fail on that copy edit.
     const sourceIdentified=layout.sourceLabel.includes('západní kamery');
     const freshnessCaution=/čas pořízení snímku není ověřen|snímek nemusí být právě pořízený/i.test(layout.sourceLabel);
     if(layout.landscapeImage!=='https://webcam.pocasi-loucka.eu/zapadni_kamera.jpg'||
      !sourceIdentified||!freshnessCaution)
      errors.push(size.name+': panorama must be authentic and source/freshness clearly labelled');
     if(!layout.solarRise||layout.solarRise==='—'||!layout.moonPhase||layout.moonPhase==='—')
      errors.push(size.name+': astronomical cycle did not calculate');
     if(!layout.cameraImage||!layout.radar)errors.push(size.name+': camera or radar is missing');
     if(layout.hasDecorativeHero||layout.heroBackground.includes('url('))errors.push(size.name+': measurement hero must not use a fake landscape image');
     if(layout.pictogramCount!==6)errors.push(size.name+': forecast must have six consistent SVG pictograms');
     if(layout.destinations!==6)errors.push(size.name+': expected six meaningful destination links');
     if(layout.heroHeight<290)errors.push(size.name+': weather hero is too short');
     if(size.name==='mobil'){
      if(layout.forecastColumns!==3)errors.push('Mobile forecast should use three readable columns');
      if(layout.dailyColumns!==3)errors.push('Mobile daily summary should use three columns');
      if(layout.analyticsColumns!==1)errors.push('Mobile analytical modules must stack');
      if(layout.observatoryColumns!==1)errors.push('Mobile camera, sky, history and station cards must stack');
      if(layout.instrumentColumns!==1)errors.push('Mobile hero must use one responsive column');
      const quick=await page.evaluate(()=>({
       count:document.querySelectorAll('.evergreen-quick-access a').length,
       visibleTop:(document.querySelector('.evergreen-quick-access')?.getBoundingClientRect().top??Infinity)+window.scrollY,
       inHero:!!document.querySelector('.evergreen-hero > .evergreen-quick-access'),
       forecastTop:document.querySelector('#pocasi-predpoved')?.getBoundingClientRect().top??0,
       cameraTop:document.querySelector('#pocasi-kamera')?.getBoundingClientRect().top??0,
       links:[...document.querySelectorAll('.evergreen-quick-access a')].every(a=>!!document.querySelector(a.getAttribute('href')??''))
      }));
      if(quick.count!==3||!quick.links||!quick.inHero||quick.visibleTop>850||quick.forecastTop>=quick.cameraTop)
       errors.push(size.name+': mobile quick links or practical-information order regressed');
      if(layout.destinationColumns!==2)errors.push('Mobile destinations should use two columns at 390px');
      if(layout.svgIcons!==5)errors.push('Mobile dock must contain five SVG navigation icons');
      if(layout.moreLinks!==7)errors.push('Mobile More menu must expose remaining seven pages');
      if(layout.mobileTargetHeight<44)errors.push('Mobile dock touch targets must be at least 44px');
     }else{
      if(layout.analyticsColumns!==3)errors.push('Desktop weather / forecast / context should show three columns');
      if(layout.observatoryColumns!==4)errors.push('Desktop observatory requires four distinct feature cards');
      if(layout.instrumentColumns!==3)errors.push('Desktop glass hero should have temperature, anemometer and graph columns');
      if(layout.destinationColumns!==3)errors.push('Desktop destinations should use three columns');
      if(layout.chartHeight<145)errors.push('Desktop integrated 24h chart must remain legible');
     }
    }
    // A short climate landing page keeps expert analyses behind a disclosure.
    // Open it before checking the original rich charts and source data.
    if(path==='/klimatologie/'){
     const disclosure=page.locator('[data-climate-deep-dive]');
     if(await disclosure.count()!==1){
      errors.push(size.name+': missing advanced climate disclosure');
     }else{
      if(await disclosure.evaluate(el=>el.open))errors.push(size.name+': expert charts must start collapsed');
      await disclosure.locator(':scope > summary').click();
      if(!await disclosure.evaluate(el=>el.open))errors.push(size.name+': climate expert panel did not expand');
     }
     if(size.name==='mobil'&&await page.locator('[data-climate-mobile-chapter]').count()!==1)
      errors.push(size.name+': missing mobile climate chapter selector');
    }
    // The year comparison is part of the existing climatology route (no extra route).
    if(path==='/klimatologie/'){
     const compare=await page.evaluate(()=>({
      visible:document.querySelector('[data-year-comparison]')!==null,
      allYears:document.querySelector('[data-all-years-temperature]')!==null,
      allYearsChart:document.querySelector('[data-temperature-chart]')!==null,
      allYearsMode:document.querySelector('[data-temperature-resolution]')!==null,
      allYearsHighlight:document.querySelector('[data-temperature-highlight]')!==null,
      first:document.querySelector('[data-compare-first]')!==null,
      second:document.querySelector('[data-compare-second]')!==null,
      metric:document.querySelector('[data-compare-metric]')!==null,
      chart:document.querySelector('[data-compare-chart]')!==null,
      calendarA:document.querySelector('[data-heatmap-cells="first"]')!==null,
      calendarB:document.querySelector('[data-heatmap-cells="second"]')!==null
     }));
     if(Object.values(compare).some(value=>!value))
      errors.push(size.name+': climatology missing two-year heatmap and overlay controls');
    }
    // Shared layout regression assertions across non-homepage routes.
    if(['/klimatologie/','/mapy/','/senzory/','/puda-ovzdusi/','/stav/','/kamera/'].includes(path)){
     const geometry=await page.evaluate(()=>{
      const columns=(selector)=>{
       const el=document.querySelector(selector);
       return el?getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length:0;
      };
      const broken=[...document.querySelectorAll('.camera-archive-thumb img')].filter(img=>
       img.complete && img.naturalWidth===0 && !img.hidden && getComputedStyle(img).display!=='none'
      ).length;
      return {
       climate:columns('.climate-grid'),
       map:columns('.map-page-layout'),
       channel:columns('.sensor-directory-list'),
       sensorRows:document.querySelectorAll('.sensor-directory-entry').length,
       sensorEvidenceGroups:document.querySelectorAll('.sensor-advanced-group').length,
       sensorEvidenceClosed:[...document.querySelectorAll('.sensor-advanced-group')].every(el=>!el.open),
       soil:columns('.soil-air-grid'),
       monitor:columns('.monitor-grid'),
       statusLinks:document.querySelectorAll('.status-explainer-grid a').length,
       brokenCameraThumbnails:broken
      };
     });
     console.log('SECONDARY VISUAL GEOMETRY',size.name,path,JSON.stringify(geometry));
     if(geometry.brokenCameraThumbnails)errors.push(size.name+' '+path+': broken-image thumbnails visible');
     if(path==='/stav/'&&geometry.statusLinks!==3)errors.push('Status page needs 3 diagnostic links');
     if(path==='/senzory/'){
      if(geometry.sensorRows!==8)errors.push(size.name+': sensor directory must list all eight known archive channels');
      if(geometry.sensorEvidenceGroups!==3||!geometry.sensorEvidenceClosed)
       errors.push(size.name+': specialist sensor evidence should start in three collapsed groups');
      const input=page.locator('[data-sensor-search]');
      await input.fill('pm25');
      const remaining=await page.locator('.sensor-directory-entry:not([hidden])').count();
      if(remaining!==1)errors.push(size.name+': sensor search did not filter to PM2.5');
      await input.fill('');
      const row=page.locator('.sensor-directory-entry').first();
      await row.locator('summary').click();
      if(!(await row.evaluate(el=>el.open)))errors.push(size.name+': sensor detail did not open');
      await row.locator('summary').click();
     }
     if(size.name==='mobil'){
      if(path==='/klimatologie/'&&geometry.climate!==1)errors.push('Mobile climate dashboard must stack cards');
      if(path==='/mapy/'&&geometry.map!==1)errors.push('Mobile map sidebar must stack');
      if(path==='/senzory/'&&geometry.channel!==1)errors.push('Mobile sensor evidence must be readable in one column');
      if(path==='/puda-ovzdusi/'&&geometry.soil!==1)errors.push('Mobile soil/air charts must use one column');
      if(path==='/stav/'&&geometry.monitor!==1)errors.push('Mobile monitoring cards must stack');
     }else{
      if(path==='/klimatologie/'&&geometry.climate!==2)errors.push('Desktop climate cards must form two columns');
      if(path==='/senzory/'&&geometry.channel!==2)errors.push('Desktop sensor directory must form two readable columns');
      if(path==='/stav/'&&geometry.monitor<3)errors.push('Desktop monitoring cards too narrow');
     }
    }
    if(path==='/klimatologie/'){
     // Rich annual statistics now load only when a visitor reaches them.
     // Scroll before asserting real API paints, not the placeholder markup.
     await page.locator('[data-climate-dashboard]').scrollIntoViewIfNeeded({timeout:12000});
     await page.waitForFunction(()=>{
      const status=document.querySelector('[data-climate-status]')?.textContent??'';
      const chart=document.querySelector('[data-chart-status="temperature"]')?.textContent??'';
      return !status.includes('Načítám') && !status.includes('Ověřuji') &&
       (status.includes('nedostupné')||(!chart.includes('Načítám') && !chart.includes('Ověřuji')));
     },null,{timeout:30000}).catch(()=>console.log('Climate chart still pending after 30 seconds'));
     const info=await page.evaluate(()=>({
      overall:document.querySelector('[data-climate-status]')?.textContent,
      temp:document.querySelector('[data-chart-status="temperature"]')?.textContent,
      annual:document.querySelector('[data-years-status]')?.textContent
     }));
     console.log('CLIMATE RUNTIME',size.name,JSON.stringify(info));
     const climate=await page.evaluate(()=>({
      overall:document.querySelector('[data-climate-status]')?.textContent?.trim()??'',
      statuses:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,document.querySelector('[data-chart-status="'+name+'"]')?.textContent?.trim()??''
      ])),
      annual:document.querySelector('[data-years-status]')?.textContent?.trim()??'',
      summary:{
       temperature:document.querySelector('[data-summary="temperature"]')?.textContent?.trim()??'',
       rain:document.querySelector('[data-summary="rain"]')?.textContent?.trim()??''
      },
      svgs:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,document.querySelector('[data-chart="'+name+'"] svg')!==null
      ])),
      validMonths:Object.fromEntries(['temperature','rain','wind'].map(name=>[
       name,Number(document.querySelector('[data-chart="'+name+'"]')?.getAttribute('data-valid-months')??0)
      ]))
     }));
     console.log('CLIMATE VERIFIED',size.name,JSON.stringify(climate));
     for(const metric of ['temperature','rain','wind']){
      if(await page.locator('[data-climate-trend="'+metric+'"] svg').count()!==1)
       errors.push(size.name+': missing six-year '+metric+' trend chart');
     }
     if(!climate.overall.startsWith('Rok '))
      errors.push(size.name+': climatology API failed: '+climate.overall);
     for(const [metric,status] of Object.entries(climate.statuses)){
      if(status!=='12 z 12 měsíců')
       errors.push(size.name+': '+metric+' climate chart missing data: '+status);
      if(!climate.svgs[metric])
       errors.push(size.name+': '+metric+' chart SVG not rendered');
      if(climate.validMonths[metric]!==12)
       errors.push(size.name+': '+metric+' missing months '+climate.validMonths[metric]+'/12 for complete year 2025');
     }
     if(climate.annual!=='Údaje dostupné')
      errors.push(size.name+': annual climate table not ready: '+climate.annual);
     for(const [metric,value] of Object.entries(climate.summary)){
      if(!/[0-9]/.test(value)||value==='—')
       errors.push(size.name+': '+metric+' annual summary missing: '+value);
     }
    }
    if(path==='/grafy/'){
     for(const period of ['today','yesterday','7d','30d','this-year','year']){
      if(await page.locator('[data-advanced-history] [data-period="'+period+'"]').count()!==1)
       errors.push(size.name+': missing friendly history period '+period);
     }
    }
    if(path==='/klimatologie/'){
     // Real-source historical moments are lazy and must be checked after scroll.
     await page.locator('[data-climate-highlights]').scrollIntoViewIfNeeded({timeout:12000});
     const highlightReady=await page.waitForFunction(()=>{
      const status=document.querySelector('[data-highlights-status]');
      return status?.dataset.state==='warning'||status?.dataset.state==='error';
     },null,{timeout:16000}).then(()=>true).catch(()=>false);
     const highlights=await page.evaluate(()=>({
      state:document.querySelector('[data-highlights-status]')?.dataset.state??'pending',
      count:document.querySelectorAll('.atlas-highlight-card').length,
      maximum:document.querySelector('[data-highlight-value="maxTemp"]')?.textContent?.trim()??'',
      minimum:document.querySelector('[data-highlight-value="minTemp"]')?.textContent?.trim()??'',
      caution:document.querySelector('[data-highlight-note="maxDailyRain"]')?.textContent?.trim()??''
     }));
     console.log('LIVE CLIMATE HIGHLIGHTS',size.name,JSON.stringify(highlights));
     if(!highlightReady||highlights.state!=='warning'||highlights.count!==4||
      !/[0-9]/.test(highlights.maximum)||!/[0-9]/.test(highlights.minimum))
      errors.push(size.name+': historical highlights not populated from original API');
    }
    // Both comparison views load only when scrolled into the viewport.
    // DOM existence and a reachable API endpoint do not prove the charts rendered.
    if(path==='/klimatologie/'){
     const temperatures=page.locator('[data-climate-subsection="temperatures"]');
     if(!await temperatures.evaluate(el=>el.open))
      await temperatures.locator(':scope > summary').click();
     await page.locator('[data-all-years-temperature]').scrollIntoViewIfNeeded({timeout:12000});
     const allYearsReady=await page.waitForFunction(()=>{
      const root=document.querySelector('[data-all-years-temperature]');
      const status=root?.querySelector('[data-temperature-status]')?.textContent?.trim()??'';
      const svg=root?.querySelector('[data-temperature-chart] svg');
      const years=root?.querySelectorAll('[data-temperature-year]').length??0;
      const summary=root?.querySelector('[data-temperature-summary]')?.textContent??'';
      return status.startsWith('Předběžná historická data')&&svg!==null&&years>=5&&summary.includes('Zobrazeno');
     },null,{timeout:45000}).then(()=>true).catch(()=>false);
     if(!allYearsReady){
      const state=await page.evaluate(()=>({
       status:document.querySelector('[data-temperature-status]')?.textContent?.trim(),
       svg:!!document.querySelector('[data-temperature-chart] svg'),
       years:document.querySelectorAll('[data-temperature-year]').length,
       summary:document.querySelector('[data-temperature-summary]')?.textContent?.trim()
      }));
      errors.push(size.name+': all-years chart not rendered: '+JSON.stringify(state));
     }else console.log('LIVE ALL-YEARS TEMPERATURE',size.name,'real API and SVG verified');

     const comparison=page.locator('[data-climate-subsection="comparison"]');
     if(!await comparison.evaluate(el=>el.open))
      await comparison.locator(':scope > summary').click();
     await page.locator('[data-year-comparison]').scrollIntoViewIfNeeded({timeout:12000});
     const comparisonReady=await page.waitForFunction(()=>{
      const root=document.querySelector('[data-year-comparison]');
      const status=root?.querySelector('[data-compare-status]')?.textContent?.trim()??'';
      const first=root?.querySelectorAll('[data-heatmap-cells="first"] .year-heatmap-day').length??0;
      const second=root?.querySelectorAll('[data-heatmap-cells="second"] .year-heatmap-day').length??0;
      const svg=root?.querySelector('[data-compare-chart] svg');
      return status.startsWith('Historické údaje · předběžné')&&first>=365&&second>=365&&svg!==null;
     },null,{timeout:45000}).then(()=>true).catch(()=>false);
     if(!comparisonReady){
      const state=await page.evaluate(()=>({
       status:document.querySelector('[data-compare-status]')?.textContent?.trim(),
       first:document.querySelectorAll('[data-heatmap-cells="first"] .year-heatmap-day').length,
       second:document.querySelectorAll('[data-heatmap-cells="second"] .year-heatmap-day').length,
       svg:!!document.querySelector('[data-compare-chart] svg')
      }));
      errors.push(size.name+': year comparison not rendered: '+JSON.stringify(state));
     }else console.log('LIVE YEAR COMPARISON',size.name,'real heatmaps and SVG verified');
    }
    const state=await page.evaluate(()=>({
     title:document.title,
     brand:!!document.querySelector('.brand'),
     main:!!document.querySelector('main'),
     width:document.documentElement.scrollWidth,
     viewport:window.innerWidth
    }));
    if(!state.brand||!state.main)errors.push(size.name+' '+path+': missing layout');
    const dock=await page.evaluate(()=>{
     const element=document.querySelector('.mobile-dock');
     return {exists:!!element,display:element?getComputedStyle(element).display:'none'};
    });
    if(!dock.exists)errors.push(size.name+' '+path+': missing mobile dock markup');
    else if(size.name==='mobil'&&dock.display==='none')errors.push('mobile dock hidden on '+path);
    else if(size.name==='desktop'&&dock.display!=='none')errors.push('mobile dock visible on desktop '+path);
    if(path==='/grafy/'){
     await page.waitForFunction(()=>{
      const state=document.querySelector('[data-rain-status]')?.textContent??'';
      return state.includes('platných intervalů')||state.includes('Bez potvrzených intervalů')||
       state.includes('Historie nedostupná');
     },null,{timeout:30000});
     let rain=(await page.locator('[data-rain-status]').textContent())?.trim()??'';
     if(rain==='Historie nedostupná'){
      await page.locator('[data-rain-retry]').click();
      await page.waitForFunction(()=>{
       const state=document.querySelector('[data-rain-status]')?.textContent??'';
       return state.includes('platných intervalů')||state.includes('Bez potvrzených intervalů')||
        state.includes('Historie nedostupná');
      },null,{timeout:30000});
      rain=(await page.locator('[data-rain-status]').textContent())?.trim()??'';
     }
     console.log('RAIN HISTORY',size.name,rain);
     if(rain==='Historie nedostupná')errors.push(size.name+': rain detail chart failed after user retry');
     if(await page.locator('[data-rain-chart] svg').count()===0)
      errors.push(size.name+': rain chart missing SVG after history load');
    }
    if(path==='/kamera/'){
     const controls=await page.evaluate(()=>({
      auto:!!document.querySelector('[data-camera-auto]'),
      fullscreen:!!document.querySelector('[data-camera-fullscreen]'),
      latest:!!document.querySelector('[data-camera-image]')
     }));
     if(!controls.auto||!controls.fullscreen||!controls.latest)
      errors.push(size.name+': missing camera controls');
     const cameraUx=await page.evaluate(()=>({
      archiveLink:!!document.querySelector('.camera-view-navigation a[href="#camera-photos"]'),
      timelapseLink:!!document.querySelector('.camera-view-navigation a[href="#camera-timelapse-title"]'),
      archiveTarget:!!document.getElementById('camera-photos'),
      timelapseTarget:!!document.getElementById('camera-timelapse-title'),
      refresh:!!document.querySelector('[data-archive-video-refresh]'),
      errorFallback:!!document.querySelector('[data-camera-image-fallback]')
     }));
     if(Object.values(cameraUx).some(v=>!v))
      errors.push(size.name+': camera archive anchors, live refresh or safe image fallback missing');
     // A public JPEG may be rate-limited or unavailable. A correctly rendered
     // fallback is a valid UI state; an unresolved spinner or broken icon is not.
     await page.waitForFunction(()=>{
      const image=document.querySelector('[data-archive-frames] img');
      if(!image)return true;
      const note=image.nextElementSibling?.textContent??'';
      return image.naturalWidth>0||note.includes('Náhled není dostupný');
     },null,{timeout:24000}).catch(()=>errors.push(size.name+': camera thumbnail remained unresolved (no image or fallback)'));
     const preview=await page.evaluate(()=>{
      const image=document.querySelector('[data-archive-frames] img');
      const note=image?.nextElementSibling?.textContent??'';
      return {
       exists:!!image,complete:image?.complete??false,width:image?.naturalWidth??0,
       fallback:note.includes('Náhled není dostupný'),hidden:image?.hidden??false,
       link:!!image?.closest('a[href^="/api/v1/camera/frames/"]')
      };
     });
     console.log('CAMERA THUMB',size.name,JSON.stringify(preview));
     if(preview.exists&&preview.width===0&&(!preview.fallback||!preview.hidden||!preview.link))
      errors.push(size.name+': missing safe fallback for unavailable camera image');
     if(preview.fallback)console.warn('Camera image source temporarily unavailable; verified clickable fallback:',size.name);
     if(await page.locator('[data-camera-archive] [data-archive-status]').count()!==1)
      errors.push(size.name+': missing real camera archive gallery');
     if(await page.locator('[data-archive-video]').count()!==1)
      errors.push(size.name+': missing timelapse video selection');
     const mp4=await page.locator('[data-archive-video] option').allTextContents();
     const videoNote=(await page.locator('[data-archive-video-note]').textContent())??'';
     console.log('CAMERA TIMELAPSE',size.name,JSON.stringify({days:mp4.length,available:mp4[0]!=='Žádné video',note:videoNote}));
     if(!videoNote.trim())errors.push(size.name+': camera timelapse status lacks explicit availability explanation');
     // A dropdown entry does not prove the video stream is seekable.
     // Request only 32 bytes and check a real 206, never download whole MP4.
     const selectedVideo=await page.locator('[data-archive-video]').inputValue();
     if(/^\/api\/v1\/camera\/timelapse\/\d{4}-\d{2}-\d{2}(?:-v\d{10})?\.mp4$/.test(selectedVideo)){
      const range=await page.evaluate(async url=>{
       try{
        const response=await fetch(url,{headers:{Range:'bytes=0-31'}});
        const bytes=await response.arrayBuffer();
        return {status:response.status,
         contentRange:response.headers.get('content-range'),
         acceptRanges:response.headers.get('accept-ranges'),
         contentType:response.headers.get('content-type'),
         bytes:bytes.byteLength};
       }catch{return {status:0,contentRange:null,acceptRanges:null,contentType:null,bytes:0};}
      },selectedVideo);
      console.log('CAMERA VIDEO RANGE',size.name,JSON.stringify(range));
      if(range.status!==206||!/^bytes 0-31\/[0-9]+$/.test(range.contentRange??'')||
       range.acceptRanges!=='bytes'||!range.contentType?.includes('video/mp4')||range.bytes!==32)
       errors.push(size.name+': camera MP4 byte-range playback failed');
      // A successful HTTP range proves transport only. Exercise the native
      // browser decoder where the test Chromium advertises H.264 support.
      const playback=await page.locator('[data-archive-player]').evaluate(async video=>{
       const supports=video.canPlayType('video/mp4; codecs="avc1.42E01E"');
       const earlyError=video.error?.code??null;
       if(!supports)return {supported:false,started:false,earlyError,mediaError:null,
        readyState:video.readyState,networkState:video.networkState};
       video.muted=true;
       let timeout;
       try{
        await Promise.race([
         video.play(),
         new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('timeout')),12000);})
        ]);
        return {supported:true,started:video.readyState>=2,
         earlyError,mediaError:video.error?.code??null,
         readyState:video.readyState,networkState:video.networkState};
       }catch{
        return {supported:true,started:false,earlyError,mediaError:video.error?.code??null,
         readyState:video.readyState,networkState:video.networkState};
       }finally{
        if(timeout!==undefined)clearTimeout(timeout);
        video.pause();
       }
      });
      console.log('CAMERA VIDEO PLAYBACK',size.name,JSON.stringify(playback));
      if(playback.earlyError!==null)errors.push(size.name+': camera player errored before user started playback');
      if(playback.supported&&!playback.started)
       errors.push(size.name+': camera MP4 playback did not start in Chromium');
     }
     if(await page.locator('[data-archive-date]').count()!==1||
      await page.locator('[data-archive-day-frames]').count()!==1)
      errors.push(size.name+': missing date-filtered camera archive');
    }
    if(path==='/mapy/'){
     if(await page.locator('[data-model-temperature]').count()!==1||
      await page.locator('[data-model-wind]').count()!==1)
      errors.push(size.name+': missing Open-Meteo model layer toggles');
     const radarLayer=page.locator('[data-map-radar-visible]');
     if(await radarLayer.count()!==1)errors.push(size.name+': missing map layer toggle');
     else{
      await radarLayer.uncheck();
      const hidden=await page.locator('[data-radar-message]').first().textContent();
      if(!hidden?.includes('vypnuté'))errors.push(size.name+': radar layer toggle did not hide imagery');
      await radarLayer.check();
     }
    }
    if(path==='/stav/'&&await page.locator('[data-monitor-card]').count()!==5)
     errors.push(size.name+': monitoring dashboard must list five independent sources');
    if(path==='/rekordy/'){
     await page.waitForFunction(()=>{
      const state=document.querySelector('[data-records-status]');
      return state?.classList.contains('warning')||state?.classList.contains('error');
     },null,{timeout:42000});
     const recordState=await page.locator('[data-records-status]').evaluate(el=>({
      preliminary:el.classList.contains('warning'),message:el.textContent?.trim()??''
     }));
     if(!recordState.preliminary)errors.push(size.name+': provisional climatology records missing: '+recordState.message);
     const coverage=await page.locator('[data-records-coverage]').textContent();
     if(!coverage?.includes('teplota'))errors.push(size.name+': records coverage not disclosed');
     const maximum=(await page.locator('[data-record-value="maxTemp"]').textContent())?.trim()??'';
     if(!maximum||maximum==='—')errors.push(size.name+': temperature record value was not painted');
    }
    if(path==='/puda-ovzdusi/'){
     if(await page.locator('[data-soil-live]').count()!==4)
      errors.push(size.name+': missing live soil-air readings');
     if(await page.locator('[data-soil-trend]').count()!==5)
      errors.push(size.name+': expected five separate PM2.5 and soil-temperature history graphs');
     await page.waitForFunction(()=>[...document.querySelectorAll('[data-soil-trend-status]')]
      .every(el=>!(el.textContent??'').includes('Načítám')),{},{timeout:30000})
      .catch(()=>errors.push(size.name+': soil-air history still loading after 30s'));
     const states=await page.locator('[data-soil-trend-status]').allTextContents();
     console.log('SOIL AIR HISTORY',size.name,JSON.stringify(states));
     if(states.some(state=>state.includes('Nedostupné'))){
      const diag=await page.evaluate(async()=>{
       const now=new Date(),from=new Date(now.getTime()-7*86400000);
       const fields=new URLSearchParams({metric:'pm25_1',from:from.toISOString(),to:now.toISOString(),
        resolution:'hourly',units:'metricwx',dataset:'original',limit:'1000'});
       const out=[];
       for(const [label,route] of [['7d pm25', '/api/v1/history?'+fields],
        ['24h pm25','/api/v1/history?'+new URLSearchParams({metric:'pm25_1',
         from:new Date(now.getTime()-86400000).toISOString(),to:now.toISOString(),
         resolution:'raw',units:'metricwx',dataset:'original',limit:'1000'})]]){
        try{
         const response=await fetch(route,{cache:'no-store'});
         out.push({label,status:response.status,body:(await response.text()).slice(0,350)});
        }catch(error){out.push({label,error:String(error)});}
       }
       return out;
      });
      console.log('SOIL HISTORY DIAGNOSTICS',size.name,JSON.stringify(diag));
     }
     if(states.every(v=>v.includes('Nedostupné')))
      errors.push(size.name+': all three source-backed soil-air history graphs unavailable');
    }
    if(path==='/senzory/'){
     await page.waitForFunction(()=>{
      const status=document.querySelector('[data-channel-status]')?.textContent??'';
      return status.includes('Čerstvost archivu')||
       status.includes('Dostupnost se nepodařilo ověřit');
     },null,{timeout:16000}).catch(()=>errors.push(size.name+': sensor channel provenance unavailable'));
     const channelStatus=(await page.locator('[data-channel-status]').textContent())?.trim()??'';
     console.log('CHANNEL AVAILABILITY',size.name,channelStatus);
     if(!channelStatus.includes('Čerstvost archivu ověřena'))
      errors.push(size.name+': real 24h archive sensor presence query not verified: '+channelStatus);
     const count=await page.locator('[data-channel-cards] .sensor-inventory-card').count();
     if(count!==11)errors.push(size.name+': expected 11 channel evidence cards, found '+count);
     const physical=await page.locator('[data-channel-cards] .sensor-inventory-card').first().textContent();
     if(!physical?.includes('Neověřená'))errors.push(size.name+': physical installation incorrectly marked verified');
     if(await page.locator('[data-sensor-trend]').count()<8)
      errors.push(size.name+': missing real sensor trend containers');
     if(await page.locator('[data-sensor-diagnostics]').count()!==1)
      errors.push(size.name+': missing source-specific signal and battery telemetry');
    }
    if(path==='/klimatologie/'){
     if(await page.locator('[data-solar-evidence]').count()!==1||
      await page.locator('[data-snow-evidence]').count()!==1)
      errors.push(size.name+': missing solar energy and clearly-labelled frost data');
    }
    if(path==='/'){
     if(await page.locator('[data-local-warnings]').count()!==1)
      errors.push(size.name+': missing locality-filtered CHMI alert panel');
    }
    if(state.width>state.viewport+3)errors.push(size.name+' '+path+': horizontal overflow '+state.width+'px > '+state.viewport+'px');
    if(path==='/'){
     await page.waitForFunction(()=>{
      const status=document.querySelector('[data-day-history-status]')?.textContent??'';
      return status.length>0&&!status.includes('Ověřuji úplnost');
     },null,{timeout:7000}).catch(()=>console.log('Historical comparison is still loading or unavailable'));
     const status=await page.locator('[data-day-history-status]').textContent();
     console.log('SAME DAY HISTORY',size.name,status?.trim());
    }
    // Passive lab snapshot from this EXISTING page visit: no extra API requests.
    // Do not interpret these as field Core Web Vitals or SQL timing.
    const sample=await page.evaluate(()=>{
     const nav=performance.getEntriesByType('navigation')[0];
     const fcp=performance.getEntriesByType('paint')
      .find(entry=>entry.name==='first-contentful-paint');
     const api=performance.getEntriesByType('resource')
      .filter(entry=>entry.name.startsWith(location.origin+'/api/v1/')&&
       entry.initiatorType==='fetch'&&entry.responseEnd>0);
     const round=n=>Number.isFinite(n)&&n>=0?Math.round(n*100)/100:null;
     const elapsed=api.map(entry=>entry.duration).filter(n=>Number.isFinite(n)&&n>=0)
      .sort((a,b)=>a-b);
     const lab=window.__louckaVisitorLab;
     // Only resource categories and elapsed times are saved, never resource URLs
     // (which can contain IPs, access tokens or personal query parameters).
     const resourceBottlenecks=performance.getEntriesByType('resource')
      .filter(entry=>Number.isFinite(entry.duration)&&entry.duration>0&&entry.responseEnd>0)
      .sort((a,b)=>b.duration-a.duration).slice(0,5)
      .map(entry=>({
       category:['img','script','link','css','fetch','xmlhttprequest','iframe'].includes(entry.initiatorType)
        ?entry.initiatorType:'other',
       scope:entry.name.startsWith(location.origin+'/')?'same-origin':'external',
       durationMs:round(entry.duration)
      }));
     return {
      ttfbMs:nav?round(nav.responseStart-nav.requestStart):null,
      domContentLoadedMs:nav?round(nav.domContentLoadedEventEnd-nav.startTime):null,
      navigationDurationMs:nav?round(nav.duration):null,
      firstContentfulPaintMs:fcp?round(fcp.startTime):null,
      lcpCandidateMs:lab?.lcpCandidateMs==null?null:round(lab.lcpCandidateMs),
      lcpCandidateType:lab?.lcpCandidateType??null,
      clsSessionMaxSoFar:lab?Math.round(lab.clsSessionMax*10000)/10000:null,
      longTaskCount:lab?.longTaskCount??null,
      longTaskDurationMs:lab?round(lab.longTaskDurationMs):null,
      resourceBottlenecks,
      navigationTransferBytes:nav?.transferSize??null,
      apiFetchCount:elapsed.length,
      climateDashboardFetchCount:api.filter(entry=>
       new URL(entry.name).pathname==='/api/v1/climate/dashboard').length,
      apiFetchP95Ms:elapsed.length?round(elapsed[Math.ceil(.95*elapsed.length)-1]):null
     };
    });
    visitorPerformance.push({viewport:size.name,route:path,...sample});
    console.log('VISITOR LAB TIMING',size.name,path,JSON.stringify(sample));
    if(path==='/klimatologie/'){
     // Baseline after PR #119: 10 fetches in a full desktop/mobile smoke,
     // including lazy charts and historical comparisons. Permit normal
     // variation/retries but reject accidental return to 58+ stat requests.
     if(sample.apiFetchCount>20)
      errors.push(size.name+': climate API request budget exceeded: '+sample.apiFetchCount+' > 20');
     if(sample.climateDashboardFetchCount!==1)
      errors.push(size.name+': expected exactly one batched climate dashboard fetch, found '+
       sample.climateDashboardFetchCount);
    }
    // Interactions can scroll the viewport. Reset before full-page screenshots
    // so sticky navigation is captured at its real top-of-page position.
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.mouse.move(1,1);
    await page.waitForTimeout(120);
    await page.screenshot({path:out+'/'+size.name+'-'+name+'.png',fullPage:true});
    console.log('OK',size.name,path,state.title,'scrollWidth='+state.width);
    if(path==='/'){
     const modules=await page.evaluate(()=>({
      forecast:document.querySelector('[data-forecast-status]')?.textContent?.trim()??'missing',
      radar:document.querySelector('[data-radar-status]')?.textContent?.trim()??'missing'
     }));
     console.log('THIRD-PARTY MODULES',size.name,JSON.stringify(modules));
    }
   }catch(e){errors.push(size.name+' '+path+': '+String(e));}
  }
  await page.close();
 }
 // Verify new source-aware endpoints without asserting that opt-in collectors are installed.
 for(const [name,path] of [
  ['camera-archive','/api/v1/camera/archive'],
  ['local-chmi','/api/v1/alerts/local'],
  ['sensor-telemetry','/api/v1/diagnostics/sensors'],
  ['solar-2025','/api/v1/climate/solar?year=2025']
 ]){
  try{
   const endpoint=await fetch(base+path,{signal:AbortSignal.timeout(15000)});
   const data=await endpoint.json();
   console.log('SOURCE EXTENSION',name,JSON.stringify({
    status:endpoint.status,sourceStatus:data.status,
    count:data.readings?.length??data.frames?.length??data.alerts?.length??null,
    energy:data.energyKwhM2??null
   }));
   if(![200,503].includes(endpoint.status))errors.push(name+': unexpected HTTP '+endpoint.status);
  }catch(e){errors.push(name+': endpoint exception '+String(e));}
 }
 // Verify the real same-origin all-years API in staging; DOM presence alone
 // cannot prove that the backend has been deployed.
 try{
  const endpoint=await fetch(base+'/api/v1/climate/temperature-years?units=metricwx&dataset=original',{
   cache:'no-store',signal:AbortSignal.timeout(30000)
  });
  if(!endpoint.ok)errors.push('temperature-years: missing staged API, HTTP '+endpoint.status);
  else{
   const body=await endpoint.json();
   const valid=body.schemaVersion==='1'&&body.metric==='outTemp'&&
    body.dataset==='original'&&body.qcStatus==='original_unverified'&&
    body.firstYear===2009&&Array.isArray(body.points)&&body.points.length>0;
   if(!valid)errors.push('temperature-years: invalid staged temperature series');
   else console.log('STAGED TEMPERATURE YEARS',JSON.stringify({
    points:body.points.length,firstYear:body.firstYear,endsBefore:body.endsBefore
   }));
  }
 }catch(e){errors.push('temperature-years API check: '+String(e));}
 // Independently check the deployment and read-only API, with no credentials.
 const response=await fetch(base+'/deployment.json',{signal:AbortSignal.timeout(12000)});
 if(!response.ok)errors.push('deployment.json: HTTP '+response.status);
 else{
  const data=await response.json();
  if(!/^[a-f0-9]{40}$/.test(data.commit??''))errors.push('deployment.json: invalid commit');
  else console.log('Publicly deployed commit:',data.commit);
 }
 const health=await fetch(base+'/api/v1/readyz',{signal:AbortSignal.timeout(12000)});
 if(!health.ok)errors.push('readyz: HTTP '+health.status);
 else{
  const state=await health.json();
  if(state.ready!==true)errors.push('readyz: archive not ready');
 }
 // Verify the newly published statistics capability from the deployed API.
 const station=await fetch(base+'/api/v1/station',{signal:AbortSignal.timeout(12000)});
 if(!station.ok)errors.push('station: HTTP '+station.status);
 else{
  const capabilities=(await station.json()).capabilities??[];
  console.log('API CAPABILITIES',JSON.stringify(capabilities));
  if(capabilities.includes('yearly_statistics')){
   const q=new URLSearchParams({
    metric:'outTemp',aggregation:'mean',year:'2025',units:'metricwx',dataset:'original'
   });
   const summary=await fetch(base+'/api/v1/statistics/yearly?'+q,{
    signal:AbortSignal.timeout(25000)
   });
   const data=await summary.json().catch(()=>null);
   console.log('YEARLY 2025 API',JSON.stringify({status:summary.status,value:data?.value,
    valid:data?.completeness?.valid,error:data?.error}));
   if(!summary.ok)errors.push('Yearly statistics advertised but HTTP '+summary.status+
    ' – verify WeeWX archive_day_outTemp table and SELECT grants');
   else if(data?.metric!=='outTemp'||data?.aggregation!=='mean'||
    !Number.isFinite(data?.value)||!Number.isSafeInteger(data?.completeness?.valid)||
    data.completeness.valid<=0)errors.push('Yearly temperature 2025 has invalid or missing data'); 
   const rainQuery=new URLSearchParams({
    metric:'rain',aggregation:'sum',year:'2025',units:'metricwx',dataset:'original'
   });
   const rainResponse=await fetch(base+'/api/v1/statistics/yearly?'+rainQuery,{
    signal:AbortSignal.timeout(25000)
   });
   const rainData=await rainResponse.json().catch(()=>null);
   console.log('YEARLY RAIN 2025 API',JSON.stringify({status:rainResponse.status,
    value:rainData?.value,valid:rainData?.completeness?.valid,error:rainData?.error}));
   if(!rainResponse.ok)errors.push('Yearly rain 2025: HTTP '+rainResponse.status);
   else if(rainData?.metric!=='rain'||rainData?.aggregation!=='sum'||
    !Number.isFinite(rainData?.value)||!Number.isSafeInteger(rainData?.completeness?.valid)||
    rainData.completeness.valid<=0)errors.push('Yearly rain 2025 has invalid or missing data');
  }
 }

}catch(e){errors.push('Preview health: '+String(e));}
finally{await browser.close();}
await writeFile(out+'/visitor-performance.json',JSON.stringify({
 schemaVersion:1,measuredAtUtc:new Date().toISOString(),
 expectedDevCommit:expectedCommit||null,environment:'headless-chromium-single-visit',
 scope:'public-dev-existing-visual-smoke',notFieldWebVitals:true,noExtraRequests:true,
 incomplete:errors.length>0,
 limitations:'One lab navigation per route/viewport. LCP is an interim candidate at snapshot time, CLS is an observed session-window maximum so far, INP is not measured; resource timings can omit cache/buffered entries. Neither field Core Web Vitals, real-user p75 nor backend/SQL timings.',
 samples:visitorPerformance
},null,2)+'\n','utf8');
console.log('VISITOR LAB TIMINGS saved:',visitorPerformance.length,'page samples');
if(errors.length){
 console.error('VISUAL SMOKE FAILED:\n'+errors.join('\n'));
 process.exitCode=1;
}else console.log('Visual preview smoke passed for 11 routes and both viewports.');
