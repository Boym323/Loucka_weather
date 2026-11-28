import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HistoryIntervalGroups,rowIsValid,historyValidationMessage,rawHistoryPoints,addHourlyRow,hourlyHistoryPoints} from '../src/archive-history.js';
import type {ArchiveRow} from '../src/store.js';
import type {HourBucket} from '../src/archive-history.js';

const row=(dateTime:number,interval=5,rain=1):ArchiveRow=>({dateTime,interval,usUnits:17,rain});
type Group={start:number;end:number;row:ArchiveRow|null};
function streaming(rows:ArchiveRow[]):Group[]{
 const result:Group[]=[];
 const groups=new HistoryIntervalGroups(g=>result.push(g));
 for(const item of rows)groups.add(item,rowIsValid(item));
 groups.finish();
 return result;
}
// Independent offline reference sorted by start instead of the production
// end-ordered streaming algorithm. No dependency on SQL or Fastify.
function reference(rows:ArchiveRow[]):Group[]{
 const result:Group[]=[];
 for(const item of [...rows].sort((a,b)=>(a.dateTime-a.interval*60)-(b.dateTime-b.interval*60)||a.dateTime-b.dateTime)){
  const start=item.dateTime-item.interval*60,end=item.dateTime;
  const previous=result.at(-1);
  if(previous&&previous.end>start){previous.end=Math.max(previous.end,end);previous.row=null;}
  else result.push({start,end,row:item});
 }
 return result;
}
test('streaming interval grouping matches independent offline reference, including compaction',()=>{
 let seed=173;
 const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed;};
 for(let scenario=0;scenario<32;scenario++){
  let time=86400;
  const rows=Array.from({length:scenario===0?4000:200},(_,i)=>{
   time+=(1+random()%12)*60;
   return row(time,scenario===0?1:(i%31===0?1440:1+random()%20));
  });
  assert.deepEqual(streaming(rows),reference(rows),'scenario '+scenario);
 }
});
test('exact touching does not overlap and a long row can merge multiple earlier groups',()=>{
 const rows=[row(300),row(600),row(900),row(1200,12),row(1500)];
 assert.deepEqual(streaming(rows).map(g=>[g.start,g.end,g.row?.dateTime??null]),[[0,300,300],[300,1200,null],[1200,1500,1500]]);
});
test('metadata errors expose only fixed public categories',()=>{
 for(const [patch,message] of [[{interval:0},'Invalid archive interval'],[{usUnits:99},'Unsupported archive units'],[{dateTime:1.5},'Invalid archive timestamp']] as const){
  assert.throws(()=>rowIsValid({...row(300),...patch}),error=>historyValidationMessage(error,'fallback')===message);
 }
 assert.equal(historyValidationMessage(new Error('private driver error'),'fallback'),'fallback');
});
test('typed raw and hourly points retain genuine zero and null conflict provenance',()=>{
 const rows=[row(300,5,0),row(600),row(660),row(900,4,0)];
 const raw=rawHistoryPoints('rain',rows,0,900,'metricwx');
 assert.deepEqual(raw.points.map(p=>p.value),[0,null,0]);
 assert.equal(raw.points[1]?.provenance,'weewx-archive-overlapping-intervals');
 assert.equal(raw.valid,2);
 const buckets=new Map<number,HourBucket>();
 addHourlyRow(buckets,'rain','sum',row(300,5,0),'metricwx',0,7200);
 const hourly=hourlyHistoryPoints('rain','sum',buckets,0,7200,'metricwx',new Set([3600]));
 assert.deepEqual(hourly.points.map(p=>p.value),[0,null]);
 assert.equal(hourly.points[1]?.validCount,0);
 assert.equal(hourly.points[1]?.provenance,'weewx-archive-overlapping-intervals');
});
