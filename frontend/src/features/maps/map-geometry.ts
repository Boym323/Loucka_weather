export type Geo={lat:number;lon:number};
export type Pixel={x:number;y:number};
export type View={center:Geo;zoom:number;scale:number;width:number;height:number};
export const station:Geo={lat:49.170035,lon:17.876076};
export function project(p:Geo,zoom:number):Pixel{
 const size=256*2**zoom,lat=Math.max(-85.05112878,Math.min(85.05112878,p.lat));
 return {x:(p.lon+180)/360*size,y:(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size};
}
export function unproject(p:Pixel,zoom:number):Geo{
 const size=256*2**zoom;
 return {lon:p.x/size*360-180,lat:Math.atan(Math.sinh(Math.PI*(1-2*p.y/size)))*180/Math.PI};
}
export function screenPosition(p:Geo,view:View):Pixel{
 const c=project(view.center,view.zoom),a=project(p,view.zoom);
 return {x:view.width/2+(a.x-c.x)*view.scale,y:view.height/2+(a.y-c.y)*view.scale};
}
export function screenGeo(p:Pixel,view:View):Geo{
 const c=project(view.center,view.zoom);
 return unproject({x:c.x+(p.x-view.width/2)/view.scale,y:c.y+(p.y-view.height/2)/view.scale},view.zoom);
}
export function sampleGrid(view:View){
 const cols=view.width>=950?7:view.width>=550?5:3;
 const rows=view.height>=500?5:3;
 const points=Array.from({length:cols*rows},(_,i)=>screenGeo({x:(i%cols)/(cols-1)*view.width,y:Math.floor(i/cols)/(rows-1)*view.height},view));
 return {cols,rows,points};
}
/** Bilinear interpolation only within a sampled cell with all four valid vertices. */
export function interpolate(values:(number|null)[],cols:number,rows:number,x:number,y:number):number|null{
 if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||cols<2||rows<2)return null;
 const gx=x*(cols-1),gy=y*(rows-1),i=Math.min(cols-2,Math.floor(gx)),j=Math.min(rows-2,Math.floor(gy)),u=gx-i,v=gy-j;
 const a=values[j*cols+i],b=values[j*cols+i+1],c=values[(j+1)*cols+i],d=values[(j+1)*cols+i+1];
 if([a,b,c,d].some(n=>typeof n!=='number'||!Number.isFinite(n)))return null;
 return a!*(1-u)*(1-v)+b!*u*(1-v)+c!*(1-u)*v+d!*u*v;
}
export const temperatureStops=[[-30,[65,30,145]],[-15,[53,79,184]],[0,[65,177,218]],[10,[76,183,106]],[20,[247,218,79]],[30,[240,118,44]],[40,[181,39,48]]] as const;
export function temperatureColor(t:number):number[]{
 const a=temperatureStops;
 if(t<=a[0][0])return [...a[0][1]];
 for(let i=1;i<a.length;i++){const lo=a[i-1]!,hi=a[i]!;if(t<=hi[0]){const w=(t-lo[0])/(hi[0]-lo[0]);return lo[1].map((v,j)=>Math.round(v+(hi[1][j]!-v)*w));}}
 return [...a[a.length-1]![1]];
}
