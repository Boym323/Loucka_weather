/** Local-only, bounded operator dashboard; never added to the public Fastify API. */
import type {FastifyInstance} from 'fastify';

const HTML=String.raw`<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Loučka · Kontrola rekonstrukce RH 2022</title>
<link rel="stylesheet" href="/dev/rh-preview/style.css">
<script src="/dev/rh-preview/app.js" defer></script>
</head>
<body>
<main class="layout">
  <header class="topline">
    <div><p class="eyebrow">POČASÍ LOUČKA / EXPERIMENTÁLNÍ ATLAS</p>
    <h1>Porovnání vlhkosti <span>2022</span></h1>
    <p class="subtitle">Původní záznamy WeeWX vs. historické návrhy rekonstrukce. Jen ke kontrole, nikoli pro produkci.</p></div>
    <strong class="status-badge">Neschválená data</strong>
  </header>
  <section class="panel controls" aria-labelledby="controls-title">
    <h2 id="controls-title">Otevřít soukromý náhled</h2>
    <form id="form">
      <div class="control-grid">
        <label class="token-col">Přístupový token
          <input id="token" type="password" placeholder="Jednorázově vlož token" autocomplete="off" spellcheck="false" minlength="32" required>
          <small>Pouze v paměti této stránky; neukládá se do URL ani do prohlížeče.</small>
        </label>
        <label>Počáteční den v UTC
          <input id="date" type="date" min="2022-01-01" max="2022-12-31" value="2022-04-26" required>
        </label>
        <label>Rozsah
          <select id="days"><option value="1">1 den</option><option value="3">3 dny</option><option value="5">5 dní</option></select>
        </label>
      </div>
      <div class="actions">
        <button type="submit" id="load">Načíst porovnání</button>
        <button type="button" id="disconnect" class="secondary">Odpojit a vymazat zobrazení</button>
        <span id="state" role="status" aria-live="polite">Čeká na soukromý přístupový token.</span>
      </div>
    </form>
  </section>
  <section class="summary" aria-label="Souhrn výřezu">
    <div class="stat"><span>Originální RH</span><strong id="count-original">—</strong><small>záznamů s hodnotou</small></div>
    <div class="stat"><span>Experimentální odhady</span><strong id="count-experimental">—</strong><small>odlišené od originálu</small></div>
    <div class="stat"><span>Zneplatněné RH</span><strong id="count-invalidated">—</strong><small>v náhledu zůstávají NULL</small></div>
    <div class="stat"><span>Chybějící RH</span><strong id="count-missing">—</strong><small>v originálu; neplatí pro chybějící časové intervaly</small></div>
  </section>
  <section class="panel figure" aria-labelledby="graph-title">
    <div class="figure-heading">
      <div><h2 id="graph-title">Průběh relativní vlhkosti</h2><p class="micro">Zdrojové časy jsou UTC; body představují konce intervalů WeeWX (start, end].</p></div>
      <div class="switcher" role="group" aria-label="Zobrazená datová řada">
        <button type="button" class="chosen" data-mode="both" aria-pressed="true">Porovnání</button>
        <button type="button" data-mode="original" aria-pressed="false">Původní</button>
        <button type="button" data-mode="preview" aria-pressed="false">Rekonstrukce</button>
      </div>
    </div>
    <div class="legend">
      <span><i class="swatch blue"></i>Původní RH</span>
      <span><i class="swatch orange"></i>Experimentální RH</span>
      <span class="muted">Přerušení křivky = chybějící hodnota nebo interval</span>
    </div>
    <div class="chart-shell">
      <canvas id="chart" height="360" role="img" aria-label="Graf původní a experimentálně rekonstruované vlhkosti 0 až 100 procent"></canvas>
      <div id="tooltip" class="tooltip" hidden></div>
    </div>
    <p id="chart-summary" class="footnote">Pro zobrazení grafu zadej přístupový token a načti vybrané období.</p>
  </section>
  <section class="panel change-panel" aria-labelledby="changes-title">
    <div class="figure-heading">
      <div><h2 id="changes-title">Historické zásahy</h2>
      <p class="micro">Pouze úpravy z již existující rekonstrukční kopie; stav není odborně schválen.</p></div>
      <span id="change-count" class="micro"></span>
    </div>
    <div class="table-scroll">
    <table><thead><tr><th>UTC konec intervalu</th><th>Původní RH</th><th>Náhled RH</th><th>Typ</th><th>Auditní dávka</th></tr></thead>
      <tbody id="changes"><tr><td colspan="5" class="empty">Zatím nejsou načtena žádná data.</td></tr></tbody>
    </table></div>
    <p class="footnote">Tabulka uvádí nejvýše prvních 100 změn z vybraného období. Odhady nejsou původní měření.</p>
  </section>
  <footer>Interní kontrolní nástroj. Bez zápisů do MariaDB, bez změn veřejného webu. <span id="digest"></span></footer>
</main>
</body>
</html>`;
const CSS=String.raw`*{box-sizing:border-box}html{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;background:#0b1523;color:#f0f6fc}body{margin:0;background:radial-gradient(circle at 85% 3%,#123754 0,transparent 38%),#0b1523;min-height:100vh}.layout{max-width:1280px;margin:0 auto;padding:44px 30px 80px}.topline,.figure-heading{display:flex;align-items:center;justify-content:space-between;gap:24px}.eyebrow{font-size:11px;letter-spacing:.19em;color:#7ed7e9;font-weight:700;margin:0 0 12px}h1{font-size:clamp(34px,4vw,56px);letter-spacing:-.045em;margin:0;line-height:1.08}h1 span{color:#73d6e9}h2{margin:0 0 15px;font-size:20px;letter-spacing:-.02em}.subtitle{color:#a9bccf;line-height:1.65;max-width:760px}.status-badge{flex:none;border:1px solid #725d3c;color:#fbd89f;background:#362915;padding:10px 13px;border-radius:12px;font-size:12px}.panel{background:#111f30;border:1px solid #26394d;border-radius:18px;padding:25px;margin:24px 0;box-shadow:0 16px 48px #030c1780}.controls{margin-top:32px}.control-grid{display:grid;grid-template-columns:minmax(220px,1.8fr) minmax(160px,1fr) minmax(110px,.6fr);gap:16px}.control-grid label{font-size:13px;font-weight:700;display:flex;flex-direction:column;gap:8px;color:#d4e4f2}input,select{border:1px solid #39546d;border-radius:10px;padding:13px;background:#0b1726;color:#f6fcff;font:inherit;min-height:47px;width:100%;outline-offset:3px;color-scheme:dark}small,.micro,.footnote{color:#99adc0;line-height:1.55;font-size:12px;font-weight:400}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:13px;margin-top:19px}.actions #state{font-size:12px;color:#afc1d0;flex:1}button{cursor:pointer;border:1px solid #62bfd1;background:#71d0e1;color:#091724;font-weight:800;border-radius:11px;padding:12px 16px;font-size:13px}button:hover{filter:brightness(1.08)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #ffdf9c;outline-offset:3px}.secondary{background:transparent;color:#b6c8d8;border-color:#39546d}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.stat{padding:21px;background:#12283c;border:1px solid #2a435b;border-radius:15px;display:flex;flex-direction:column;gap:10px}.stat span{color:#c4d7e8;font-size:12px}.stat strong{font-size:34px;letter-spacing:-.04em;font-variant-numeric:tabular-nums}.stat small{margin-top:auto}.figure-heading{margin-bottom:20px}.figure-heading h2{margin:0 0 4px}.figure-heading .micro{margin:0}.switcher{display:flex;gap:4px;border:1px solid #344c64;padding:4px;border-radius:12px;background:#0b1828;flex-wrap:wrap}.switcher button{border:0;background:transparent;color:#b4c8d8;padding:9px 13px;font-size:12px}.switcher button.chosen{background:#2a5267;color:#fff}.legend{display:flex;gap:20px;flex-wrap:wrap;margin:0 0 16px;color:#dce9f3;font-size:12px}.swatch{display:inline-block;width:16px;height:3px;vertical-align:middle;margin-right:6px;border-radius:3px}.blue{background:#62c9e4}.orange{background:#ffc079}.legend .muted{color:#879eb4}.chart-shell{position:relative;min-height:360px;border:1px solid #20374a;border-radius:12px;background:#0b1727}canvas{display:block;width:100%;height:360px}.tooltip{position:absolute;left:15px;top:13px;padding:10px 12px;white-space:pre-line;background:#092335ee;color:#fff;border:1px solid #456a82;border-radius:10px;pointer-events:none;font-size:12px;line-height:1.7}.footnote{margin:15px 0 0}.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;text-align:left;min-width:660px;font-size:13px}thead th{color:#9ebad0;font-weight:600;border-bottom:1px solid #344c62;padding:13px}tbody td{padding:13px;border-bottom:1px solid #253b4d;color:#dae9f3}tbody tr:hover{background:#1b344a}td.empty{text-align:center;padding:26px;color:#91a9bc}.type-label{color:#ffcc89;font-weight:650}footer{margin-top:24px;font-size:12px;color:#8ca7b9;line-height:1.5}footer span{display:block;margin-top:6px;word-break:break-all}@media(max-width:800px){.layout{padding:25px 14px 60px}.topline,.figure-heading{align-items:flex-start;flex-direction:column}.control-grid{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.panel{padding:18px}.chart-shell,canvas{height:300px;min-height:300px}.status-badge{align-self:flex-start}}@media(max-width:420px){.summary{grid-template-columns:1fr 1fr}.stat{padding:14px}.stat strong{font-size:27px}.switcher button{padding:8px}.legend{gap:10px}}`;
const JS=String.raw`'use strict';
(function(){
const el=id=>document.getElementById(id);
const form=el('form'),input=el('token'),date=el('date'),days=el('days');
const state=el('state'),canvas=el('chart'),tip=el('tooltip'),body=el('changes');
const modeButtons=Array.from(document.querySelectorAll('[data-mode]'));
const fmt=new Intl.NumberFormat('cs-CZ',{maximumFractionDigits:1});
const nf=new Intl.NumberFormat('cs-CZ');
let token=null,model=null,mode='both',busy=false,request=null;
const maxEnd=Date.UTC(2022,11,31,23,55);
function number(v){return typeof v==='number'&&Number.isFinite(v)?fmt.format(v)+' %':'—';}
function status(s){state.textContent=s;}
function utc(d){return new Date(d).toISOString().slice(0,19)+'Z';}
function dateTime(s){return typeof s==='string'?s.replace('T',' ').replace('.000Z',' UTC').replace('Z',' UTC'):'—';}
function range(){
  const d=date.value;
  if(!/^2022-(0[1-9]|1[0-2])-([0-2][0-9]|3[0-1])$/.test(d))throw Error('Vyber datum v roce 2022.');
  const start=Date.parse(d+'T00:00:00Z'),n=Number(days.value);
  if(!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==d||![1,3,5].includes(n))throw Error('Neplatný rozsah.');
  const from=Math.max(Date.UTC(2022,0,1),start-300000);
  const to=Math.min(maxEnd,start+n*86400000-300000);
  if(to<=from)throw Error('Prázdné období.');
  return {from:utc(from),to:utc(to)};
}
function reset(){
  model=null;token=null;input.value='';input.required=true;
  el('digest').textContent='';
  ['count-original','count-experimental','count-invalidated','count-missing'].forEach(id=>el(id).textContent='—');
  body.replaceChildren();
  const td=document.createElement('td');td.colSpan=5;td.className='empty';td.textContent='Žádná načtená data.';
  const tr=document.createElement('tr');tr.append(td);body.append(tr);
  el('change-count').textContent='';
  el('chart-summary').textContent='Soukromá data byla smazána z tohoto zobrazení.';
  tip.hidden=true;
  draw();
}
function metricRows(points){
  return points.filter(p=>p.preview.status==='experimental_unapproved'||p.preview.status==='historically_invalidated_unapproved');
}
function fillTable(rows){
  body.replaceChildren();
  const names={experimental_unapproved:'Experimentální odhad',historically_invalidated_unapproved:'Historicky zneplatněno'};
  if(!rows.length){
    const td=document.createElement('td');td.className='empty';td.colSpan=5;td.textContent='V tomto výřezu nebyly nalezeny žádné historické zásahy.';
    const tr=document.createElement('tr');tr.append(td);body.append(tr);return;
  }
  for(const r of rows.slice(0,100)){
    const tr=document.createElement('tr');
    const values=[dateTime(r.at),number(r.original.value),number(r.preview.value),names[r.preview.status]||'—',r.preview.legacyBatchKey||'—'];
    for(let i=0;i<values.length;i++){
      const td=document.createElement('td');td.textContent=values[i];
      if(i===3)td.className='type-label';
      tr.append(td);
    }
    body.append(tr);
  }
}
function paint(){
  const points=model?.points||[];
  const modified=metricRows(points);
  el('count-original').textContent=nf.format(points.filter(p=>typeof p.original.value==='number').length);
  el('count-experimental').textContent=nf.format(modified.filter(p=>p.preview.status==='experimental_unapproved').length);
  el('count-invalidated').textContent=nf.format(modified.filter(p=>p.preview.status==='historically_invalidated_unapproved').length);
  el('count-missing').textContent=nf.format(points.filter(p=>p.original.value===null).length);
  el('change-count').textContent=nf.format(modified.length)+' zásahů ve výřezu';
  el('digest').textContent='Balíček SHA-256: '+model.packageSha256;
  el('chart-summary').textContent=nf.format(points.length)+' existujících archivních časových řádků; '+nf.format(modified.length)+' historických změn. Chybějící celé intervaly se nevymýšlejí ani nedoplňují nulou.';
  fillTable(modified);draw();
}
function draw(){
  const rect=canvas.getBoundingClientRect(),w=Math.max(320,rect.width||700),h=Math.max(280,rect.height||360);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,w,h);
  const left=47,right=18,top=21,bottom=42,gw=w-left-right,gh=h-top-bottom;
  ctx.font='12px system-ui';ctx.strokeStyle='#2b4357';ctx.fillStyle='#93aabb';ctx.lineWidth=1;
  for(let i=0;i<=5;i++){
    const y=top+gh*i/5;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+gw,y);ctx.stroke();
    ctx.fillText(String(100-i*20)+' %',6,y+4);
  }
  if(!model||!model.points.length){
    ctx.fillStyle='#8ba7bc';ctx.textAlign='center';ctx.fillText('Zatím nejsou načtena data',w/2,h/2);ctx.textAlign='start';return;
  }
  const rows=model.points;
  const first=Date.parse(model.range.from),last=Date.parse(model.range.to);
  function x(t){return left+(t-first)/(last-first)*gw;}
  function y(v){return top+gh*(1-v/100);}
  for(let i=0;i<=4;i++){
    const t=first+(last-first)*i/4;
    ctx.fillStyle='#93aabb';ctx.textAlign='center';
    ctx.fillText(new Date(t).toISOString().slice(5,16).replace('T',' '),x(t),h-15);
  }
  ctx.textAlign='start';
  const series=mode==='both'?['original','preview']:[mode];
  for(const key of series){
    ctx.beginPath();
    ctx.strokeStyle=key==='original'?'#67c9e2':'#ffc079';
    ctx.lineWidth=key==='original'?1.75:2.2;ctx.lineJoin='round';
    let previous=null;
    for(const r of rows){
      const v=r[key]?.value,t=r.epoch*1000;
      if(typeof v!=='number'){previous=null;continue;}
      const px=x(t),py=y(v);
      if(previous===null||t-previous>6*60000)ctx.moveTo(px,py);
      else ctx.lineTo(px,py);
      previous=t;
    }
    ctx.stroke();
  }
}
function tipAt(event){
  if(!model?.points?.length){tip.hidden=true;return;}
  const rect=canvas.getBoundingClientRect(),w=rect.width;
  const left=47,right=18;
  const pct=Math.max(0,Math.min(1,(event.clientX-rect.left-left)/(w-left-right)));
  const target=Date.parse(model.range.from)+pct*(Date.parse(model.range.to)-Date.parse(model.range.from));
  let best=null,diff=Infinity;
  for(const r of model.points){
    const dist=Math.abs(r.epoch*1000-target);
    if(dist<diff){best=r;diff=dist;}
  }
  if(!best||diff>60*60000){tip.hidden=true;return;}
  tip.textContent=dateTime(best.at)+'\nPůvodní: '+number(best.original.value)+'\nRekonstrukce: '+number(best.preview.value)+'\nStav: '+best.preview.status;
  tip.hidden=false;
  tip.style.left=Math.max(8,Math.min(rect.width-240,event.clientX-rect.left+15))+'px';
}
async function load(){
  if(busy)return;
  if(input.value){token=input.value;input.value='';input.required=false;}
  if(!token){status('Chybí přístupový token.');return;}
  let r;
  try{r=range();}catch(err){status(err.message);return;}
  busy=true;el('load').disabled=true;status('Načítám archivní výřez…');
  if(request)request.abort();
  request=new AbortController();
  try{
    const q=new URLSearchParams({from:r.from,to:r.to,limit:'2000'});
    const resp=await fetch('/api/v1/dev/preview/rh-history?'+q.toString(),{
      method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},
      credentials:'omit',cache:'no-store',redirect:'error',signal:request.signal
    });
    if(!resp.ok){
      if(resp.status===401){token=null;input.required=true;status('Přístup zamítnut – vlož platný token.');}
      else if(resp.status===422)status('Příliš široký nebo neplatný rozsah.');
      else if(resp.status===503)status('Kontrola původních dat selhala nebo archiv není dostupný.');
      else status('API vrátilo HTTP '+resp.status+'.');
      return;
    }
    const result=await resp.json();
    if(result.dataset!=='preview_unapproved'||result.approved!==false||
      !Array.isArray(result.points)||typeof result.packageSha256!=='string'){
      status('Nepodporovaná odpověď API.');return;
    }
    model=result;paint();status('Načteno '+nf.format(result.points.length)+' původních časových řádků.');
  }catch(err){if(err.name!=='AbortError')status('Nelze načíst privátní API; zkontroluj SSH tunel.');}
  finally{busy=false;el('load').disabled=false;}
}
form.addEventListener('submit',event=>{event.preventDefault();void load();});
el('disconnect').addEventListener('click',()=>{request?.abort();reset();status('Odpojeno. Token ani data nebyly trvale uloženy.');});
date.addEventListener('change',()=>{if(token)void load();});
days.addEventListener('change',()=>{if(token)void load();});
for(const b of modeButtons)b.addEventListener('click',()=>{
  mode=b.dataset.mode;
  for(const other of modeButtons){const chosen=other===b;other.classList.toggle('chosen',chosen);other.setAttribute('aria-pressed',String(chosen));}
  draw();
});
canvas.addEventListener('mousemove',tipAt);
canvas.addEventListener('mouseleave',()=>{tip.hidden=true;});
window.addEventListener('resize',draw);
draw();
})();`;

function privateHeaders(reply:any):void{
 reply.header('Cache-Control','no-store')
  .header('Pragma','no-cache')
  .header('X-Content-Type-Options','nosniff')
  .header('X-Frame-Options','DENY')
  .header('Referrer-Policy','no-referrer')
  .header('X-Robots-Tag','noindex, nofollow')
  .header('Content-Security-Policy',"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'");
}
export function registerRhPreviewOperatorUi(app:FastifyInstance):void{
 app.get('/dev/rh-preview',async(_req,reply)=>{
  privateHeaders(reply);
  return reply.type('text/html; charset=utf-8').send(HTML);
 });
 app.get('/dev/rh-preview/style.css',async(_req,reply)=>{
  privateHeaders(reply);
  return reply.type('text/css; charset=utf-8').send(CSS);
 });
 app.get('/dev/rh-preview/app.js',async(_req,reply)=>{
  privateHeaders(reply);
  return reply.type('application/javascript; charset=utf-8').send(JS);
 });
}
