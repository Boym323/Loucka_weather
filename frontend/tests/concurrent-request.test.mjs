import test from 'node:test';
import assert from 'node:assert/strict';
import {createConcurrentRequest} from '../src/shared/api/concurrent-request.ts';

function fixture(){
 const calls=[];
 const shared=createConcurrentRequest(signal=>new Promise((resolve,reject)=>{
  calls.push({signal,resolve,reject});
 }));
 return {calls,shared};
}
test('concurrent subscribers share a read, completed reads are never cached',async()=>{
 const {calls,shared}=fixture();
 const a=shared.get(),b=shared.get();
 assert.equal(calls.length,1);calls[0].resolve(0);
 assert.deepEqual(await Promise.all([a,b]),[0,0]);
 const c=shared.get();assert.equal(calls.length,2);calls[1].resolve(1);assert.equal(await c,1);
});
test('cancel one subscriber without cancelling the other',async()=>{
 const {calls,shared}=fixture(),one=new AbortController(),two=new AbortController();
 const a=shared.get(one.signal),b=shared.get(two.signal);
 const rejected=assert.rejects(a,{name:'AbortError'});one.abort();await rejected;
 assert.equal(calls[0].signal.aborted,false);
 calls[0].resolve('ok');assert.equal(await b,'ok');
});
test('last subscriber cancellation detaches pending read even when loader ignores abort',async()=>{
 const {calls,shared}=fixture(),controller=new AbortController();
 const a=shared.get(controller.signal),rejected=assert.rejects(a,{name:'AbortError'});
 controller.abort();await rejected;assert.equal(calls[0].signal.aborted,true);
 const b=shared.get();assert.equal(calls.length,2);
 calls[0].resolve('old');calls[1].resolve('new');assert.equal(await b,'new');
});
test('invalidation isolates old result and completion from new concurrent read',async()=>{
 const {calls,shared}=fixture();
 const old=shared.get();shared.invalidate();const fresh=shared.get();
 assert.equal(calls.length,2);assert.equal(calls[0].signal.aborted,false);
 calls[0].resolve('old');assert.equal(await old,'old');
 const joined=shared.get();assert.equal(calls.length,2);
 calls[1].resolve('fresh');assert.deepEqual(await Promise.all([fresh,joined]),['fresh','fresh']);
});
test('errors are shared but never cached; already aborted caller does not fetch',async()=>{
 const {calls,shared}=fixture(),controller=new AbortController();controller.abort();
 await assert.rejects(shared.get(controller.signal),{name:'AbortError'});assert.equal(calls.length,0);
 const a=shared.get(),b=shared.get(),failure=new Error('fixture failure');
 const rejected=Promise.all([assert.rejects(a,e=>e===failure),assert.rejects(b,e=>e===failure)]);
 calls[0].reject(failure);await rejected;
 const c=shared.get();assert.equal(calls.length,2);calls[1].resolve(null);assert.equal(await c,null);
});
test('synchronous loader failure is a rejection and later callers retry',async()=>{
 let calls=0;
 const shared=createConcurrentRequest(()=>{if(++calls===1)throw Error('sync');return Promise.resolve(2);});
 await assert.rejects(shared.get(),/sync/);assert.equal(await shared.get(),2);
});
