import type {PeriodRollup} from '../domain/climate-atlas.ts';

export interface MonthPlotData{month:number;value:number|null;coverage:number}
/** Thin layer separating evidence/coverage decisions from SVG rendering. */
export function yearbookPlotData(
 months:readonly ({month:number}&PeriodRollup)[],minimumCoverage=.8
):MonthPlotData[]{
 return months.map(m=>({
  month:m.month,
  coverage:m.coverage,
  value:m.value!==null&&Number.isFinite(m.value)&&m.coverage>=minimumCoverage?
   m.value:null
 }));
}
const labels=['Led','Úno','Bře','Dub','Kvě','Čvn','Čvc','Srp','Zář','Říj','Lis','Pro'];
const fullNames=['leden','únor','březen','duben','květen','červen','červenec',
 'srpen','září','říjen','listopad','prosinec'];
export function drawYearbookBars(
 target:HTMLElement,months:readonly MonthPlotData[],kind:'temperature'|'rain'
):void{
 target.replaceChildren();
 const valid=months.filter(m=>m.value!==null&&(kind!=='rain'||m.value>=0));
 if(!valid.length){
  target.textContent='Pro žádný měsíc nejsou k dispozici dostatečně pokrytá denní data.';
  return;
 }
 const ns='http://www.w3.org/2000/svg';
 const element=(tag:string)=>document.createElementNS(ns,tag);
 const svg=element('svg');
 svg.setAttribute('viewBox','0 0 760 260');
 svg.setAttribute('role','img');
 svg.setAttribute('aria-label',kind==='temperature'?
  'Průměrné měsíční teploty z dostupných dnů':'Úhrny měsíčních srážek z dostupných dnů');
 const title=element('title');
 title.textContent=(kind==='temperature'?'Teploty':'Srážky')+
  ' po měsících s minimálně 80% denním pokrytím';
 svg.append(title);
 const values=valid.map(m=>m.value as number);
 let low=Math.min(0,...values),high=Math.max(0,...values);
 if(low===high)high=low+1;
 const padding=(high-low)*.10;
 if(kind==='rain'){low=0;high+=padding;}
 else{low-=padding;high+=padding;}
 const y=(value:number)=>211-(value-low)/(high-low)*185;
 const baseline=y(0);
 for(let tick=0;tick<=4;tick++){
  const value=low+(high-low)*tick/4;
  const line=element('line');
  for(const [name,n] of Object.entries({x1:40,x2:745,y1:y(value),y2:y(value)}))
   line.setAttribute(name,String(n));
  line.setAttribute('class','chart-grid');
  svg.append(line);
  const label=element('text');
  label.setAttribute('class','chart-axis');
  label.setAttribute('x','1');label.setAttribute('y',String(y(value)+4));
  label.textContent=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1}).format(value);
  svg.append(label);
 }
 const base=element('line');
 for(const [name,n] of Object.entries({x1:40,x2:745,y1:baseline,y2:baseline}))
  base.setAttribute(name,String(n));
 base.setAttribute('class','atlas-chart-zero');svg.append(base);
 months.forEach(month=>{
  const x=49+(month.month-1)*58;
  const bar=element('rect');bar.setAttribute('x',String(x));
  bar.setAttribute('width','32');bar.setAttribute('rx','3');
  if(month.value===null||(kind==='rain'&&month.value<0)){
   bar.setAttribute('y','24');bar.setAttribute('height','187');
   bar.setAttribute('class','atlas-chart-missing');
  }else{
   const end=y(month.value);
   const top=Math.min(end,baseline);
   bar.setAttribute('y',String(top));
   bar.setAttribute('height',String(Math.max(2,Math.abs(end-baseline))));
   bar.setAttribute('class',kind==='temperature'?'atlas-chart-temp-bar':'atlas-chart-rain-bar');
  }
  const hint=element('title');
  hint.textContent=fullNames[month.month-1]+': '+
   (month.value===null?'nedostatečné podklady':
    new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1}).format(month.value)+
    (kind==='temperature'?' °C':' mm'))+
   '; pokrytí '+Math.round(month.coverage*100)+' %';
  bar.append(hint);
  svg.append(bar);
  const label=element('text');
  label.setAttribute('class','chart-axis');
  label.setAttribute('x',String(x+16));
  label.setAttribute('y','239');
  label.setAttribute('text-anchor','middle');
  label.textContent=labels[month.month-1];
  svg.append(label);
 });
 target.append(svg);
}
