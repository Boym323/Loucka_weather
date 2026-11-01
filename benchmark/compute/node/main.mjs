import fs from 'node:fs';
import process from 'node:process';
import {performance} from 'node:perf_hooks';
const empty=()=>[0,0,0,0,0,null,null,0,0,0,0,0,0,0,0,0];
function add(a,p){
 const m=Number(p[1]);a[0]++;if(p[8]==='R')a[1]++;a[2]+=m;
 if(p[3]!=='-'){const v=Number(p[3]);a[3]+=v*m;a[4]+=m;a[5]=a[5]===null?v:Math.min(a[5],v);a[6]=a[6]===null?v:Math.max(a[6],v);}
 if(p[4]!=='-'){a[7]++;a[8]+=Number(p[4]);}
 if(p[5]!=='-' && p[6]!=='-') {const sp=Number(p[5]),r=Number(p[6])*Math.PI/180;a[9]++;a[10]+=Math.sin(r)*sp*m;a[11]+=Math.cos(r)*sp*m;a[12]+=m;}
 if(p[7]!=='-'){a[13]++;a[14]+=m;a[15]+=Number(p[7])*m;}
}
function clean(a){const h=Math.hypot(a[10],a[11]);return {rows:a[0],reconstructed:a[1],minutes:a[2],tempMinutes:a[4],tempC:a[4]?a[3]/a[4]:null,tempMin:a[5],tempMax:a[6],rainN:a[7],rainMm:a[7]?a[8]:null,windN:a[9],windVectorMs:a[12]?h/a[12]:null,windDir:h>1e-9?((Math.atan2(a[10],a[11])*180/Math.PI)%360+360)%360:null,humidN:a[13],humidPct:a[14]?a[15]/a[14]:null};}
function compute(raw){const daily=new Map(),monthly=new Map(),yearly=new Map(),total=empty();
 const lines=raw.split('\n');
 for(let i=1;i<lines.length;i++){
  if(!lines[i])continue;const p=lines[i].replace(/\r$/,'').split('\t');if(p.length!==9)throw new Error('bad row '+i);
  const day=p[2];for(const [map,key] of [[daily,day],[monthly,day.slice(0,7)],[yearly,day.slice(0,4)]]) {let a=map.get(key);if(!a){a=empty();map.set(key,a);}add(a,p);}add(total,p);
 }
 const groups=map=>Object.fromEntries([...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>[k,clean(v)]));
 return {total:clean(total),daily:groups(daily),monthly:groups(monthly),yearly:groups(yearly)};
}
const raw=fs.readFileSync(process.argv[2],'utf8');const iterations=Number(process.argv[3]);let result;
const t=performance.now();for(let i=0;i<iterations;i++)result=compute(raw);
console.log(JSON.stringify({backend:'node',iterations,ms_per_iteration:(performance.now()-t)/iterations,result}));
