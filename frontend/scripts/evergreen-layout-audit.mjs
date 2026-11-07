/**
 * Local, read-only PR layout audit. Values injected below are synthetic fixtures
 * in the isolated Chromium tab, never weather data or requests to the API.
 */
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const url=process.env.LOCAL_PREVIEW_URL||'http://127.0.0.1:4321/';
const widths=[320,390,600,768,1024,1440];
const errors=[];
await mkdir('test-results/layout-audit',{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  // Geometry audit must be deterministic regardless of Loučka sunrise/sunset.
  await page.addInitScript(()=>localStorage.setItem('loucka-theme','light'));

  let loaded=false;
  for(let attempt=0;attempt<20;attempt++){
   try{
    const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:5000});
    if(response?.ok()){loaded=true;break;}
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!loaded){errors.push(width+'px: local preview unavailable');await context.close();continue;}
  await page.evaluate(()=>{
   const values={outTemp:'-18,9',outHumidity:'100',barometer:'1045,3',dewpoint:'-21,2'};
   for(const [id,value] of Object.entries(values)){
    const node=document.querySelector('[data-metric-value="'+id+'"]');
    if(node)node.textContent=value;
   }
  });
  const measure=()=>page.evaluate(()=>{
   const q=selector=>document.querySelector(selector);
   const hero=q('.evergreen-hero'),featured=q('.evergreen-hero .metric-card.featured');
   const reading=q('.evergreen-hero .metric-card.featured .metric-number');
   const columns=getComputedStyle(hero).gridTemplateColumns.split(' ').filter(Boolean).length;
   const metricColumns=getComputedStyle(q('.evergreen-hero .metric-grid')).gridTemplateColumns.split(' ').filter(Boolean).length;
   const rightOf=node=>node?.getBoundingClientRect().right??0;
   const metrics=[...document.querySelectorAll('.evergreen-hero .metric-card')].map(card=>{
    const number=card.querySelector('.metric-number');
    return {id:card.getAttribute('data-metric'),overflow:number?rightOf(number)>rightOf(card)+3:false};
   });
   const font=selector=>parseFloat(getComputedStyle(q(selector)).fontSize);
   return {
    viewport:window.innerWidth,
    scrollWidth:document.documentElement.scrollWidth,
    overflowElements:[...document.querySelectorAll('body *')].filter(el=>{
     const rect=el.getBoundingClientRect();
     return rect.width>0&&rect.right>window.innerWidth+2&&getComputedStyle(el).position!=='fixed';
    }).slice(0,10).map(el=>el.tagName.toLowerCase()+(el.className&&typeof el.className==='string'?'.'+el.className.trim().replace(/\s+/g,'.'):'')),
    heroWidth:hero.getBoundingClientRect().width,
    heroRight:hero.getBoundingClientRect().right,
    columns,metricColumns,
    featuredOverflow:rightOf(reading)>rightOf(featured)+3,
    metrics,
    visibleMetricCount:[...document.querySelectorAll('.evergreen-hero .metric-card')].filter(el=>getComputedStyle(el).display!=='none').length,
    labelFont:font('.evergreen-hero .metric-label'),
    noteFont:font('.evergreen-hero .metric-note'),
    sourceFont:font('.evergreen-hero [data-current-provenance]'),
    windFont:font('.evergreen-hero .wind-speed-pair>div>small'),
    chartFont:font('.evergreen-hero .history-legend'),
    stationFont:font('.evergreen-station-card>p'),
    theme:document.documentElement.dataset.theme,
    cameraTransition:getComputedStyle(q('.evergreen-camera-tile .atlas-media-image img')).transitionDuration
   };
  });
  const light=await measure();
  console.log('LAYOUT',width,JSON.stringify(light));
  if(light.scrollWidth>width+2)errors.push(width+'px: horizontal page overflow '+light.scrollWidth+'; suspects: '+light.overflowElements.join(', '));
  if(light.heroRight>width+2)errors.push(width+'px: hero extends past viewport');
  const expectedCols=width<=760?1:width<=1270?2:3;
  if(light.columns!==expectedCols)errors.push(width+'px: hero columns '+light.columns+' expected '+expectedCols);
  if(width<=600&&light.metricColumns!==3)errors.push(width+'px: compact metric grid needs three columns');
  if(light.visibleMetricCount!==4)errors.push(width+'px: all four real metric cards must remain visible');
  if(light.featuredOverflow||light.metrics.some(metric=>metric.overflow))
   errors.push(width+'px: temperature or companion reading exceeds its card');
  for(const key of ['labelFont','noteFont','sourceFont','windFont','chartFont','stationFont']){
   if(light[key]<12)errors.push(width+'px: '+key+' below 12px ('+light[key]+')');
  }
  if(light.theme!=='light')errors.push(width+'px: default light theme not active');
  await page.screenshot({path:'test-results/layout-audit/home-'+width+'-light.png',fullPage:true});
  if(width===390||width===1440){
   await page.evaluate(()=>localStorage.setItem('loucka-theme','dark'));
   await page.reload({waitUntil:'domcontentloaded'});
   const dark=await page.evaluate(()=>({
    theme:document.documentElement.dataset.theme,
    background:getComputedStyle(document.querySelector('.evergreen-hero')).backgroundColor
   }));
   const chipContrast=await page.evaluate(()=>{
    const parse=color=>(color.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);
    const luminance=color=>{
     const rgb=parse(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
     return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
    };
    const check=selector=>{
     const s=getComputedStyle(document.querySelector(selector));
     const a=luminance(s.color),b=luminance(s.backgroundColor);
     return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    };
    return {
     history:check('.evergreen-hero .history-hero .status-chip'),
     sky:check('.evergreen-spotlight .observatory-sky .observatory-small-tag'),
     year:check('.evergreen-spotlight .observatory-history .observatory-small-tag')
    };
   });
   console.log('DARK CHIP CONTRAST',width,JSON.stringify(chipContrast));
   for(const [name,ratio] of Object.entries(chipContrast)){
    if(ratio<4.5)errors.push(width+'px: '+name+' dark chip contrast '+ratio.toFixed(2)+':1 (<4.5)');
   }
   if(dark.theme!=='dark')errors.push(width+'px: dark theme not restored');
   if(!dark.background.includes('rgba(')&&!dark.background.includes('rgb('))
    errors.push(width+'px: missing dark hero background');
   await page.screenshot({path:'test-results/layout-audit/home-'+width+'-dark.png',fullPage:true});
   await page.emulateMedia({reducedMotion:'reduce'});
   const transition=await page.locator('.evergreen-camera-tile .atlas-media-image img').evaluate(
    img=>getComputedStyle(img).transitionDuration
   );
   if(transition!=='0s')errors.push(width+'px: camera animates in reduced-motion mode: '+transition);
  }
  await context.close();
 }
}finally{await browser.close();}
if(errors.length){
 console.error('Evergreen browser audit failed:\n'+errors.join('\n'));
 process.exitCode=1;
}else{
 console.log('Evergreen browser audit passed at '+widths.join(', ')+'px, including dark and reduced-motion');
}
