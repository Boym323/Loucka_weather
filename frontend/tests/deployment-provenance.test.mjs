import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentRelation} from '../scripts/deployment-provenance.mjs';

const OLD='a'.repeat(40);
const NEW='b'.repeat(40);
const UNRELATED='c'.repeat(40);
const mock=(status,ahead_by=0)=>async()=>({
 ok:true,json:async()=>({status,ahead_by})
});

test('exact expected SHA is accepted without calling GitHub',async()=>{
 assert.equal(await deploymentRelation(OLD,OLD,{fetchImpl:()=>{throw Error('called')}}),'exact');
});

test('manual and scheduled smoke accept a valid deployed SHA',async()=>{
 assert.equal(await deploymentRelation('',OLD),'unconstrained');
 assert.equal(await deploymentRelation('',null),'invalid');
});

test('only a proven newer descendant can supersede the expected push SHA',async()=>{
 let requested='';
 const fetchImpl=async(url,options)=>{
  requested=url;
  assert.equal(options.headers.Accept,'application/vnd.github+json');
  return {ok:true,json:async()=>({status:'ahead',ahead_by:3})};
 };
 assert.equal(await deploymentRelation(OLD,NEW,{fetchImpl}),'superseding');
 assert.equal(requested,'https://api.github.com/repos/Boym323/Loucka_weather/compare/'+OLD+'...'+NEW);
});

test('unrelated, older, equal-by-API, and inconclusive releases fail closed',async()=>{
 for(const status of ['diverged','behind','identical']){
  assert.equal(await deploymentRelation(OLD,UNRELATED,{fetchImpl:mock(status,3)}),'mismatch');
 }
 assert.equal(await deploymentRelation(OLD,NEW,{fetchImpl:mock('ahead',0)}),'mismatch');
 assert.equal(await deploymentRelation(OLD,NEW,{fetchImpl:async()=>({ok:false})}),'mismatch');
 assert.equal(await deploymentRelation(OLD,NEW,{fetchImpl:async()=>{throw Error('offline')}}),'mismatch');
});

test('invalid SHA cannot trigger an external comparison request',async()=>{
 const bad=['../../../bad','https://attacker.invalid','123','F'.repeat(40)];
 for(const val of bad){
  const fetchImpl=()=>{throw Error('should not call GitHub')};
  assert.equal(await deploymentRelation(OLD,val,{fetchImpl}),'invalid');
  assert.equal(await deploymentRelation(val,NEW,{fetchImpl}),'invalid');
 }
});
