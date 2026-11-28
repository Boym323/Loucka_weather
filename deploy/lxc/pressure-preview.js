"use strict";
const $=id=>document.getElementById(id);
const canvas=$("chart"),ctx=canvas.getContext("2d");
const toggles=[...document.querySelectorAll("[data-layer]")];
const layers=[{idx:1,color:"#cbd5e1",dash:[],name:"Archiv"},
 {idx:2,color:"#60a5fa",dash:[5,4],name:"Rekonstrukce"},
 {idx:3,color:"#38d9a9",dash:[],name:"Regionální reference"}];
let points=[],range=null,request=null;
const dateTime=t=>new Date(t*1000).toISOString().slice(0,16).replace("T"," ");
const fmt=v=>v===null?"—":v.toLocaleString("cs-CZ",{maximumFractionDigits:2});
function draw(){
 const w=canvas.clientWidth,h=canvas.clientHeight;
 if(!w||!h||!ctx)return;
 const dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
 ctx.fillStyle="#a9becf";ctx.font="12px system-ui";
 if(!range||!points.length){ctx.fillText("Žádné načtené hodnoty",18,30);return;}
 const selected=layers.filter(l=>toggles.some(t=>t.checked&&Number(t.dataset.layer)===l.idx));
 let lo=Infinity,hi=-Infinity;
 for(const p of points)for(const l of selected)if(Number.isFinite(p[l.idx])){lo=Math.min(lo,p[l.idx]);hi=Math.max(hi,p[l.idx]);}
 if(!Number.isFinite(lo)){ctx.fillText("Pro vybrané vrstvy nejsou hodnoty.",18,30);return;}
 lo=Math.floor(lo-1);hi=Math.ceil(hi+1);const left=49,right=w-10,top=14,bottom=h-29;
 const x=t=>left+(t-range[0])/(range[1]-range[0])*(right-left);
 const y=v=>bottom-(v-lo)/(hi-lo)*(bottom-top);
 ctx.textAlign="right";for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4;ctx.strokeStyle="#304256";ctx.beginPath();ctx.moveTo(left,y(v));ctx.lineTo(right,y(v));ctx.stroke();ctx.fillStyle="#a9becf";ctx.fillText(v.toFixed(1),left-6,y(v)+4);}
 ctx.textAlign="center";for(let i=0;i<=3;i++){const t=range[0]+(range[1]-range[0])*i/3;ctx.fillText(dateTime(t).slice(5,16),Math.max(left+10,Math.min(right-35,x(t))),h-7);}
 for(const l of selected){
  ctx.strokeStyle=l.color;ctx.fillStyle=l.color;ctx.lineWidth=1.6;ctx.setLineDash(l.dash);
  let prev=null;
  for(const p of points){
   const v=p[l.idx];
   if(!Number.isFinite(v)){if(l.idx!==3||prev?.[6]!=="ERA5_HOURLY_PHYSICAL_REANALYSIS")prev=null;continue;}
   // For hourly ERA5 skip the intervening 5-minute empty slots, not missing hours.
   // Never bridge unavailable intervals, protected windows, source transitions or known archive source break.
   const step=l.idx===3&&p[6]==="ERA5_HOURLY_PHYSICAL_REANALYSIS"?3600:300;
   const boundary=Date.parse("2019-04-26T14:45:00Z")/1000;
   const same=prev&&p[0]-prev[0]===step&&
      !(prev[0]<boundary&&p[0]>=boundary)&&
      (l.idx!==3||prev[6]===p[6]);
   if(same){ctx.beginPath();ctx.moveTo(x(prev[0]),y(prev[l.idx]));ctx.lineTo(x(p[0]),y(v));ctx.stroke();}
   else{ctx.beginPath();ctx.arc(x(p[0]),y(v),1.7,0,2*Math.PI);ctx.fill();}
   prev=p;
  }
  ctx.setLineDash([]);
 }
}
function render(){
 const counts=[1,2,3,4].map(i=>points.filter(p=>Number.isFinite(p[i])).length);
 $("summary").textContent=points.length+" časových záznamů · archiv "+counts[0]+" · rekonstrukce "+counts[1]+" · regionální reference "+counts[2]+" · regionální odhady chybějících hodnot "+counts[3]+".";
 const body=$("rows");body.replaceChildren();
 const frag=document.createDocumentFragment();
 for(const p of points){const tr=document.createElement("tr");for(const value of [dateTime(p[0]),fmt(p[1]),fmt(p[2]),fmt(p[3]),fmt(p[4]),[p[6]==="ERA5_HOURLY_PHYSICAL_REANALYSIS"?"ERA5":p[6]==="CHMI_10MIN_TRANSFERRED_REFERENCE"?"ČHMÚ":"",p[5]?p[5]/60+" min":"",p[8]].filter(Boolean).join(" · ")||"—"]){const td=document.createElement("td");td.textContent=value;tr.append(td);}frag.append(tr);}
 body.append(frag);draw();
}
function clear(){request?.abort();request=null;points=[];range=null;$("token").value="";$("digest").textContent="";$("status").textContent="Odpojeno.";$("load").disabled=false;render();}
$("clear").addEventListener("click",clear);
$("form").addEventListener("submit",async e=>{
 e.preventDefault();request?.abort();const active=new AbortController();request=active;
 $("load").disabled=true;$("status").textContent="Načítám…";
 points=[];range=null;$("digest").textContent="";render();
 try{
  const from=$("date").value,days=Number($("days").value);
  const query=new URLSearchParams({from,days:String(days)});
  const response=await fetch("/dev/pressure-preview/data?"+query,{signal:active.signal,credentials:"omit",cache:"no-store",headers:{Authorization:"Bearer "+$("token").value}});
  if(!response.ok)throw Error(response.status===401?"Neplatný přístupový token.":response.status===422?"Vyber platné období.":"Náhled není dostupný.");
  const data=await response.json();
  if(data.schema!=="pressure-preview-v1"||data.approved!==false||data.unit!=="hPa"||data.timezone!=="UTC"||data.from!==from||data.days!==days||!Array.isArray(data.points))throw Error("Nesprávný formát dat.");
  if(request!==active)return;
  points=data.points;const start=Date.parse(from+"T00:00:00Z")/1000;range=[start,start+days*86400];
  $("digest").textContent="SHA-256 snapshotu: "+data.releaseSha256;
  $("status").textContent="Načteno. Všechny odhady jsou neschválené.";render();
 }catch(error){if(request===active){$("status").textContent=error.message||"Náhled není dostupný.";}}
 finally{if(request===active){request=null;$("load").disabled=false;}}
});
toggles.forEach(t=>t.addEventListener("change",draw));
new ResizeObserver(draw).observe(canvas);
draw();
