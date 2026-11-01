import test from 'node:test';
import assert from 'node:assert/strict';
import {GatewayObserver,validatedSnapshot,gatewayReadings} from '../src/gateway.js';
import {LiveHub} from '../src/live.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const now='2026-11-01T19:40:00.000Z';
const fixture={
 schemaVersion:'1',source:'ecowitt_gw3000_custom',stationType:'GW3000C_V1.0',
 receivedAt:now,observedAt:now,units:'metricwx',
 readings:{outTemp:12.4,outHumidity:68,windSpeed:3.2,windDir:270}
};
test('authenticated gateway file has explicit provenance and is fresh for at most 120 seconds',()=>{
 const valid=validatedSnapshot(fixture,Date.parse(now));
 assert.ok(valid);
 assert.equal(valid?.readings.outTemp,12.4);
 assert.equal(gatewayReadings(valid!).outTemp?.unit,'degC');
 assert.equal(gatewayReadings(valid!).windSpeed?.source,'gw3000_live');
 const hub=new LiveHub();
 assert.equal(hub.gatewayStatus(Date.parse(now)),'disabled');
 hub.enableGateway();
 assert.equal(hub.gatewayStatus(Date.parse(now)),'missing');
 hub.publishGateway(valid!);
 assert.equal(hub.gatewayStatus(Date.parse(now)),'fresh');
 assert.equal(hub.gatewayStatus(Date.parse(now)+120001),'stale');
 assert.equal(hub.getGateway(Date.parse(now)+120001),null);
});
test('garbled or unexpected gateway fields do not become public readings',()=>{
 assert.equal(validatedSnapshot({...fixture,source:'untrusted'},Date.parse(now)),null);
 assert.equal(validatedSnapshot({...fixture,receivedAt:'not-a-date'},Date.parse(now)),null);
 assert.equal(validatedSnapshot({...fixture,readings:{x:12,y:15}},Date.parse(now)),null);
 assert.equal(validatedSnapshot({...fixture,readings:{...fixture.readings,unknown:33}},Date.parse(now))?.readings.unknown,undefined);
});
test('read-only LAN source has source-specific timestamp provenance',()=>{
 const v=validatedSnapshot({...fixture,source:'ecowitt_gw3000_lan_http',
  timestampMeaning:'gateway_polled_at'},Date.parse(now));
 assert.ok(v);
 assert.equal(v?.source,'ecowitt_gw3000_lan_http');
 assert.equal(v?.timestampMeaning,'gateway_polled_at');
 const hub=new LiveHub();
 hub.enableGateway();
 hub.publishGateway(v!);
 assert.equal(hub.getGateway(Date.parse(now))?.timestampMeaning,'gateway_polled_at');
});
test('file observer sends exactly one live observation for the same captured upload',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'loucka-gw3000-test-'));
 const file=join(folder,'latest.json'),hub=new LiveHub();
 const obs=new GatewayObserver(hub,file,()=>new Date(now));
 const seen:string[]=[];
 hub.enableGateway();
 const unsubscribe=hub.subscribe(e=>seen.push(String(e.eventType)));
 try{
  await writeFile(file,JSON.stringify(fixture));
  await obs.poll();await obs.poll();
  assert.deepEqual(seen,['observation']);
  assert.equal(hub.gatewayStatus(Date.parse(now)),'fresh');
 }finally{unsubscribe();obs.stop();await rm(folder,{recursive:true,force:true});}
});

test('public read-only gateway and monitor endpoints reflect source freshness without touching archive',async()=>{
 const {buildApp}=await import('../src/app.js');
 const hub=new LiveHub();
 hub.enableGateway();
 const valid=validatedSnapshot(fixture,Date.parse(now));
 assert.ok(valid);
 hub.publishGateway(valid);
 const reader={
  latest:async()=>null,
  history:async()=>[],
  ping:async()=>{}
 };
 const app=buildApp(reader,()=>new Date(now),hub);
 try{
  const live=await app.inject('/api/v1/live/current');
  assert.equal(live.statusCode,200);
  assert.equal(live.json().state,'live');
  assert.equal(live.json().readings.outTemp.value,12.4);
  assert.equal(live.json().readings.outTemp.source,'gw3000_live');
  const monitor=await app.inject('/api/v1/monitor/status');
  assert.equal(monitor.statusCode,200);
  assert.equal(monitor.json().components.gw3000.status,'fresh');
  assert.equal(monitor.json().components.archive.status,'missing');
 }finally{await app.close();}
});
