import {createHash,randomUUID} from 'node:crypto';
import type {ArchiveReader,ArchiveRow} from './store.js';
import {gatewayReadings,LIVE_TTL_MS} from './gateway.js';
import type {GatewaySnapshot} from './gateway.js';

type EventMessage={schemaVersion:'1';eventId:string;eventType:string;emittedAt:string;[key:string]:unknown};
type ArchiveChange='appended'|'backfilled'|'revised'|'deleted';
const iso=(seconds:number)=>new Date(seconds*1000).toISOString();
const fingerprint=(row:ArchiveRow)=>createHash('sha256').update(JSON.stringify(row)).digest('hex');

export class LiveHub{
 private readonly session=randomUUID();
 private sequence=0;
 private readonly history:EventMessage[]=[];
 private readonly subscribers=new Set<(event:EventMessage)=>void>();
 private revision='archive-uninitialized';
 private observation:ArchiveRow|null=null;
 private gatewayEnabled=false;
 private gatewaySnapshot:GatewaySnapshot|null=null;
 enableGateway(){this.gatewayEnabled=true;}
 get gatewayConfigured(){return this.gatewayEnabled;}
 gatewayStatus(nowMs=Date.now()):'disabled'|'missing'|'fresh'|'stale'{
  if(!this.gatewayEnabled)return 'disabled';
  if(!this.gatewaySnapshot)return 'missing';
  return nowMs-Date.parse(this.gatewaySnapshot.receivedAt)<=LIVE_TTL_MS?'fresh':'stale';
 }
 get gatewayLastReceivedAt():string|null{return this.gatewaySnapshot?.receivedAt??null;}
 getGateway(nowMs=Date.now()):GatewaySnapshot|null{
  return this.gatewayStatus(nowMs)==='fresh'?this.gatewaySnapshot:null;
 }
 publishGateway(snapshot:GatewaySnapshot){
  if(!this.gatewayEnabled)return;
  this.gatewaySnapshot=snapshot;
  const event:EventMessage={schemaVersion:'1',eventId:`${this.session}-gw3000-${++this.sequence}`,
   eventType:'observation',emittedAt:new Date().toISOString(),
   observedAt:snapshot.observedAt,receivedAt:snapshot.receivedAt,state:'live',
   units:'metricwx',source:'gw3000_live',timestampMeaning:snapshot.timestampMeaning??'device_reported',readings:gatewayReadings(snapshot)};
  this.history.push(event);if(this.history.length>256)this.history.shift();
  for(const subscriber of this.subscribers)subscriber(event);
 }
 get dataRevision():string{return this.revision;}
 get latestObservation():ArchiveRow|null{return this.observation;}
 get subscriberCount():number{return this.subscribers.size;}
 setInitialRevision(revision:string){this.revision=revision;}
 setLatestObservation(row:ArchiveRow|null){this.observation=row;}
 createLiveEvent(payload:Record<string,unknown>):EventMessage{
  return {...payload,schemaVersion:'1',eventId:`${this.session}-snapshot-${++this.sequence}`} as EventMessage;
 }
 publishArchive(input:{emittedAt:number;changeType:ArchiveChange;from:number;to:number;
  latest:number;changedRecords:number}):EventMessage{
  const eventId=`${this.session}-${++this.sequence}`;
  const event:EventMessage={schemaVersion:'1',eventId,eventType:'archive-updated',emittedAt:iso(input.emittedAt),
   stationId:'loucka',dataset:'original',dataRevision:eventId,changeType:input.changeType,
   affectedEndTimeFrom:iso(input.from),affectedEndTimeTo:iso(input.to),latestArchiveAt:iso(input.latest),
   changedRecords:input.changedRecords,summaryStatus:'unknown'};
  this.revision=eventId;
  this.history.push(event);
  if(this.history.length>256)this.history.shift();
  for(const subscriber of this.subscribers)subscriber(event);
  return event;
 }
 publishReset(emittedAt:number):EventMessage{
  const event=this.createLiveEvent({eventType:'reset',emittedAt:iso(emittedAt),observedAt:null,
   units:'metricwx',state:'unavailable',readings:{},reason:'Archive snapshot changed; refresh current data'});
  this.revision=event.eventId;this.history.push(event);
  if(this.history.length>256)this.history.shift();
  for(const subscriber of this.subscribers)subscriber(event);
  return event;
 }
 replay(lastEventId:string|undefined):{events:EventMessage[];reset:boolean}{
  if(!lastEventId)return {events:[],reset:false};
  const index=this.history.findIndex(event=>event.eventId===lastEventId);
  return index<0?{events:[],reset:true}:{events:this.history.slice(index+1),reset:false};
 }
 subscribe(callback:(event:EventMessage)=>void):()=>void{
  this.subscribers.add(callback);
  return ()=>this.subscribers.delete(callback);
 }
}

/** Single-process read-only observer. Summary readiness deliberately stays unknown. */
export class ArchiveObserver{
 private running=false;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private initialized=false;
 private failures=0;
 private cursor=0;
 private latest:number|null=null;
 private known=new Map<number,string>();
 constructor(private readonly reader:ArchiveReader,private readonly hub:LiveHub,
  private readonly now:()=>Date=()=>new Date()){}
 start(){if(this.running)return Promise.resolve();this.running=true;return this.pollAndSchedule();}
 stop(){this.running=false;if(this.timer)clearTimeout(this.timer);}
 private async pollAndSchedule():Promise<void>{
  if(!this.running)return;
  try{await this.poll();this.failures=0;}
  catch{this.failures=Math.min(this.failures+1,4);/* Internal DB errors are never sent to clients. */}
  const baseDelay=Math.min(120000,15000*2**this.failures);
  const delay=Math.round(baseDelay*(0.9+Math.random()*0.2));
  if(this.running)this.timer=setTimeout(()=>void this.pollAndSchedule(),delay);
 }
 private async poll(){
  if(!this.reader.archiveWindow||!this.reader.archiveAfter)return;
  const now=Math.floor(this.now().getTime()/1000),windowStart=Math.max(0,now-7200);
  const window=await this.reader.archiveWindow(windowStart,now,2000);
  if(window.length>=2000)throw new Error('Archive overlap snapshot was truncated');
  const current=new Map<number,string>();
  let previousDateTime=windowStart-1;
  for(const row of window){
   if(!Number.isSafeInteger(row.dateTime)||row.dateTime<windowStart||row.dateTime>now||
      row.dateTime<=previousDateTime||current.has(row.dateTime))
    throw new Error('Invalid archive overlap snapshot');
   current.set(row.dateTime,fingerprint(row));
   previousDateTime=row.dateTime;
  }
  if(!this.initialized){
   this.known=current;
   const last=window.at(-1)??await this.reader.latest(now);
   this.latest=last?.dateTime??0;this.cursor=this.latest;
   this.hub.setLatestObservation(last);
   if(last)this.hub.setInitialRevision(`archive-${last.dateTime}-${fingerprint(last).slice(0,16)}`);
   this.initialized=true;return;
  }
  const previousLatest=this.latest;
  const changed=new Map<number,{hash:string;row?:ArchiveRow;kind:'new'|'revised'|'deleted'}>();
  for(const row of window){
   const old=this.known.get(row.dateTime),hash=current.get(row.dateTime)!;
   if(old!==hash)changed.set(row.dateTime,{hash,row,kind:old===undefined?'new':'revised'});
  }
  for(const [dateTime] of this.known){
   // Rows that naturally aged out of the moving window are not deletions.
   if(dateTime>=windowStart&&!current.has(dateTime))changed.set(dateTime,{hash:'',kind:'deleted'});
  }

  // Catch up committed rows beyond the overlap after a longer polling outage.
  let pageCursor=this.cursor;
  const latestFallback=window.length===0?await this.reader.latest(now):null;
  let latestSeen=Math.max(latestFallback?.dateTime??0,...current.keys());
  for(let page=0;page<10;page++){
   const rows=await this.reader.archiveAfter(pageCursor,now,500);
   for(const row of rows){
    if(!Number.isSafeInteger(row.dateTime)||row.dateTime<=pageCursor||row.dateTime>now)
     throw new Error('Invalid archive catch-up page');
    const hash=fingerprint(row);
    if(!current.has(row.dateTime)&&!changed.has(row.dateTime))
     changed.set(row.dateTime,{hash,row,kind:'new'});
    pageCursor=row.dateTime;latestSeen=Math.max(latestSeen,row.dateTime);
   }
   if(rows.length<500)break;
  }
  this.cursor=pageCursor;this.latest=latestSeen;this.known=current;
  this.hub.setLatestObservation(window.at(-1)??latestFallback);
  if(!changed.size)return;
  if(current.size===0){this.hub.publishReset(now);return;}
  const dates=[...changed.keys()],hasRevision=[...changed.values()].some(change=>change.kind==='revised');
  const hasDeletion=[...changed.values()].some(change=>change.kind==='deleted');
  const isBackfill=[...changed].some(([dateTime,change])=>change.kind==='new'&&previousLatest!==null&&dateTime<=previousLatest);
  const changeType:ArchiveChange=hasRevision?'revised':hasDeletion?'deleted':isBackfill?'backfilled':'appended';
  // Align the announced archive revision with conditional current/history responses.
  const latestRow=window.at(-1);
  this.hub.publishArchive({emittedAt:now,changeType,from:Math.min(...dates),to:Math.max(...dates),
   latest:this.latest??latestRow?.dateTime??now,changedRecords:changed.size});
 }
}

export function serializeSse(event:EventMessage):string{
 if(!event.eventId||/[\r\n\0]/.test(event.eventId))throw new Error('Invalid SSE event ID');
 return `id: ${event.eventId}\nevent: ${event.eventType}\nretry: 5000\ndata: ${JSON.stringify(event)}\n\n`;
}
