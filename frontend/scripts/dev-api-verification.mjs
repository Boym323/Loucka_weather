// Public, read-only DEV API + MP4 operational verification without browser dependencies.
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const base='https://dev.pocasi-loucka.eu';
const expected='b11765d4985485d40a838fbe54f94645ec515b09';
const checks=[];
const fail=(c,m)=>{if(!c)throw Error(m);};
async function run(name,fn){
 try{const result=await fn();checks.push({name,result:'PASS',detail:result});console.log('PASS '+name+' '+JSON.stringify(result));}
 catch(e){checks.push({name,result:'FAIL',reason:e.message});console.error('FAIL '+name+' '+e.message);process.exitCode=1;}
}
async function get(path,init={}){
 const r=await fetch(base+path,{signal:AbortSignal.timeout(20000),cache:'no-store',...init});return r;
}
await mkdir('test-results/dev-api-verify',{recursive:true});
await run('deployment and readiness',async()=>{
 const r=await get('/deployment.json?probe='+Date.now());fail(r.status===200,'deployment HTTP '+r.status);
 const d=await r.json();fail(d.commit===expected,'deployed SHA '+d.commit);
 const h=await get('/api/v1/readyz');const v=await h.json();fail(h.status===200&&v.ready===true,'readyz bad');
 return {commit:d.commit,deployedAt:d.deployedAt,ready:v.ready};
});
await run('HTML noindex',async()=>{
 const r=await get('/');fail(r.status===200,'home HTTP '+r.status);
 const robots=r.headers.get('x-robots-tag')??'';
 fail(robots.includes('noindex'),'robots header '+robots);
 return {robots};
});
await run('archive and live current',async()=>{
 const r=await get('/api/v1/current?units=metricwx&dataset=original');fail(r.status===200,'current '+r.status);
 const a=await r.json();fail(a.schemaVersion==='1'&&a.observedAt&&a.readings,'bad archive');
 const l=await get('/api/v1/live/current');fail(l.status===200,'live '+l.status);
 const b=await l.json();return {archiveAt:a.observedAt,stale:a.stale,liveState:b.state,liveAt:b.receivedAt,liveCount:Object.keys(b.readings??{}).length};
});
await run('camera Range and actual MP4 encoding',async()=>{
 const r=await get('/api/v1/camera/archive');fail(r.status===200,'archive '+r.status);
 const d=await r.json();const vid=d.videos?.find(v=>/^\/api\/v1\/camera\/timelapse\/\d{4}-\d{2}-\d{2}(?:-v\d{10})?\.mp4$/.test(v.url));
 fail(vid,'no video');
 const q=await get(vid.url,{headers:{Range:'bytes=0-31'}});
 const b=Buffer.from(await q.arrayBuffer());fail(q.status===206&&b.length===32,'Range '+q.status+'/'+b.length);
 const all=await get(vid.url);fail(all.status===200,'full video '+all.status);
 const bytes=Buffer.from(await all.arrayBuffer());fail(bytes.length>1024,'video too short');
 const file='test-results/dev-api-verify/latest.mp4';await writeFile(file,bytes);
 const raw=execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,pix_fmt,width,height:format=duration','-of','json',file],{encoding:'utf8',timeout:10000});
 const info=JSON.parse(raw);const stream=info.streams?.find(x=>x.codec_name==='h264');
 fail(stream,'not H264');fail(Number(info.format?.duration)>0,'no duration');
 return {videos:d.videos.length,day:vid.date,state:vid.state,range:q.headers.get('content-range'),
  format:stream.codec_name,pix_fmt:stream.pix_fmt,width:stream.width,height:stream.height,
  duration:Number(info.format.duration),bytes:bytes.length};
});
await writeFile('test-results/dev-api-verify/result.json',JSON.stringify({at:new Date().toISOString(),checks},null,2));
console.log('RESULT '+JSON.stringify(checks.map(x=>({name:x.name,result:x.result}))));
