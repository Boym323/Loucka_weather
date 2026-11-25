import type {HourlyPoint} from '../../shared/domain/hourly-forecast';
import {formatValue} from '../../shared/domain/metrics';
/** Shared time axis, separate temperature and rain scales; never bridge a missing hour. */
export function drawMeteogram(points:HourlyPoint[]):HTMLElement{
 const figure=document.createElement('figure');figure.className='portal-meteogram';
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 235');svg.setAttribute('role','img');svg.setAttribute('aria-label','Modelový průběh teploty a hodinových srážek. Přesné hodnoty jsou v následující tabulce.');
 const add=(tag:string,attrs:Record<string,string|number>,text?:string)=>{
  const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;svg.append(e);return e;
 };
 const temp=points.flatMap(p=>p.temperature===null?[]:[p.temperature]);
 const rain=points.flatMap(p=>p.precipitation===null?[]:[p.precipitation]);
 const lo=temp.length?Math.floor(Math.min(...temp)-1):0,hi=temp.length?Math.ceil(Math.max(...temp)+1):1;
 const rainMax=rain.length?Math.max(1,...rain):1;
 const start=points[0]?.time??0,span=Math.max(3600000,(points.at(-1)?.time??start)-start);
 const x=(t:number)=>50+(t-start)/span*645;
 const y=(t:number)=>108-(t-lo)/Math.max(1,hi-lo)*80;
 add('text',{x:4,y:14,class:'meteogram-axis'},'°C');add('text',{x:4,y:132,class:'meteogram-axis'},'mm');
 for(const v of [lo,(lo+hi)/2,hi]){if(temp.length){add('line',{x1:45,x2:704,y1:y(v),y2:y(v),class:'meteogram-grid'});add('text',{x:39,y:y(v)+4,'text-anchor':'end',class:'meteogram-axis'},formatValue(v,0));}}
 add('line',{x1:45,x2:704,y1:196,y2:196,class:'meteogram-grid'});
 if(rain.length)add('text',{x:39,y:147,'text-anchor':'end',class:'meteogram-axis'},formatValue(rainMax,1));
 let path='',last=-Infinity;
 const flush=()=>{if(path){add('path',{d:path,class:'meteogram-line',fill:'none'});path='';}};
 const fmt=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 points.forEach((p,i)=>{
  if(p.temperature===null||p.time-last!==3600000)flush();
  if(p.temperature!==null){path+=(path?' L':'M')+x(p.time)+' '+y(p.temperature);add('circle',{cx:x(p.time),cy:y(p.temperature),r:2.5,class:'meteogram-point'});}
  if(p.precipitation!==null){const h=p.precipitation/rainMax*50;add('rect',{x:x(p.time)-Math.min(9,230/points.length),y:196-h,width:Math.min(18,460/points.length),height:h,rx:2,class:'meteogram-rain'});}
  if(i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0)add('text',{x:x(p.time),y:219,'text-anchor':'middle',class:'meteogram-axis'},fmt.format(p.time));
  last=p.time;
 });
 flush();
 figure.append(svg);
 const note=document.createElement('figcaption');note.textContent='Teplota (křivka) · hodinové srážky (sloupce). Chybějící hodnoty nejsou nulové.';figure.append(note);return figure;
}
