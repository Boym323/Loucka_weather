/** Keep the number and unit readable as a single typographic group. */
export function renderMetricDisplay(target:HTMLElement,value:string,unit:string){
 target.textContent=value;
 if(!unit)return;
 const suffix=document.createElement('span');
 suffix.className='inline-metric-unit';
 suffix.textContent=' '+unit;
 target.append(suffix);
}
