/** Optional LAN gateway snapshots. No SQL writes; bounded local JSON file only.
 * Not enabled until GW3000_LIVE_ENABLED=YES is explicitly set on the staging API.
 */
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {LiveHub} from './live.js';

export type GatewayReading={value:number;unit:string;quality:'measured';source:'gw3000_live'};
export type GatewaySnapshot={
 schemaVersion:'1';source:'ecowitt_gw3000_custom'|'ecowitt_gw3000_lan_http';stationType:string;
 timestampMeaning?:'gateway_polled_at';
 receivedAt:string;observedAt:string;units:'metricwx';
 readings:Record<string,number>;
};
const units:Record<string,string>={
 outTemp:'degC',outHumidity:'percent',inTemp:'degC',inHumidity:'percent',
 barometer:'hPa',pressure:'hPa',windDir:'degree',windSpeed:'meter_per_second',
 windGust:'meter_per_second',rainRate:'mm_per_hour',
 radiation:'watt_per_meter_squared',UV:'uv_index',
 pm25_1:'microgram_per_cubic_meter',soilMoisture1:'percent'
};
export const LIVE_TTL_MS=120000;
export function validatedSnapshot(value:unknown,nowMs=Date.now()):GatewaySnapshot|null{
 if(!value||typeof value!=='object')return null;
 const data=value as Record<string,unknown>;
 if(data.schemaVersion!=='1'||
  (data.source!=='ecowitt_gw3000_custom'&&data.source!=='ecowitt_gw3000_lan_http')||
  data.units!=='metricwx'||
  typeof data.receivedAt!=='string'||typeof data.observedAt!=='string'||
  typeof data.stationType!=='string'||data.stationType.length>70||
  !data.readings||typeof data.readings!=='object')return null;
 const received=Date.parse(data.receivedAt),observed=Date.parse(data.observedAt);
 if(!Number.isFinite(received)||!Number.isFinite(observed)||
  received>nowMs+60000||observed>received+60000||received-observed>180000)return null;
 const raw=data.readings as Record<string,unknown>;
 const readings:Record<string,number>={};
 for(const [key,value] of Object.entries(raw)){
  if(!Object.hasOwn(units,key)||typeof value!=='number'||!Number.isFinite(value))continue;
  readings[key]=value;
 }
 if(Object.keys(readings).length<3)return null;
 return {schemaVersion:'1',source:data.source,units:'metricwx',
  stationType:data.stationType,receivedAt:data.receivedAt,observedAt:data.observedAt,
  ...(data.source==='ecowitt_gw3000_lan_http'?{timestampMeaning:'gateway_polled_at' as const}:{}),readings};
}
export function gatewayReadings(snapshot:GatewaySnapshot):Record<string,GatewayReading>{
 return Object.fromEntries(Object.entries(snapshot.readings).map(([name,value])=>[
  name,{value,unit:units[name]??'',quality:'measured',source:'gw3000_live'}
 ]));
}
export class GatewayObserver{
 private timer:ReturnType<typeof setInterval>|undefined;
 private lastStamp='';
 private busy=false;
 constructor(private readonly hub:LiveHub,
  private readonly file=join(process.env.LOUCKA_LIVE_DIR||'/var/lib/loucka-live','latest.json'),
  private readonly now:()=>Date=()=>new Date()){}
 async poll():Promise<void>{
  if(this.busy)return;this.busy=true;
  try{
   const payload=await readFile(this.file,{encoding:'utf8'});
   if(payload.length>16384)return;
   const snapshot=validatedSnapshot(JSON.parse(payload),this.now().getTime());
   if(!snapshot)return;
   const received=Date.parse(snapshot.receivedAt);
   if(this.now().getTime()-received>LIVE_TTL_MS)return;
   if(snapshot.receivedAt!==this.lastStamp){
    // The collector creates a new timestamp only for an authentic gateway upload.
    this.lastStamp=snapshot.receivedAt;
    this.hub.publishGateway(snapshot);
   }
  }catch{/* Missing/corrupted file is an unavailable source, never a fake live reading. */}
  finally{this.busy=false;}
 }
 start(){
  this.hub.enableGateway();
  void this.poll();
  this.timer=setInterval(()=>void this.poll(),2500);
  this.timer.unref();
 }
 stop(){if(this.timer){clearInterval(this.timer);this.timer=undefined;}}
}
