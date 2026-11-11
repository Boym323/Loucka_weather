import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import Fastify from 'fastify';
import {buildApp} from '../src/app.js';
import {registerDevRhPreview} from '../src/dev-rh-preview-route.js';
import {registerRhPreviewOperatorUi} from '../src/dev-rh-preview-web.js';
import {validateRhPreviewSidecarEnv} from '../src/dev-rh-preview-main.js';
import type {ArchiveReader,ArchiveRow} from '../src/store.js';
import type {DevRhPreview} from '../src/dev-rh-preview.js';

const env:NodeJS.ProcessEnv={
 WEATHER_STAGING_ENABLED:'YES',
 WEATHER_DB_SCHEMA:'pocasi-loucka.eu',
 WEATHER_DEV_PREVIEW_ENABLED:'YES',
 WEATHER_DEV_PREVIEW_MODE:'isolated_dev_only',
 HOST:'127.0.0.1',
 PORT:'3101'
};
const fakeReader:ArchiveReader={
 latest:async()=>null,history:async()=>[],
 ping:async()=>{}
};
const mock:DevRhPreview={
 packageSha256:'c'.repeat(64),recordsSha256:'d'.repeat(64),
 authorize:(header:unknown)=>header==='Bearer '+ 't'.repeat(32),
 merge:(rows:ArchiveRow[])=>rows.map(r=>({
  at:new Date(r.dateTime*1000).toISOString(),epoch:r.dateTime,
  intervalMinutes:r.interval,
  original:{value:r.outHumidity??null,status:'original_missing'},
  preview:{value:75,status:'experimental_unapproved',
   legacyBatchKey:'unit-test',legacySource:'test'}
 }))
};
test('local sidecar refuses public bind, port 3100, other dataset and missing opt-in',()=>{
 assert.doesNotThrow(()=>validateRhPreviewSidecarEnv(env));
 for(const diff of [
  {HOST:'0.0.0.0'},{HOST:'::'},{HOST:'localhost'},{PORT:'3100'},
  {PORT:'8080'},{PORT:'0'},{WEATHER_DB_SCHEMA:'loucka_reconstruction'},
  {WEATHER_DB_SCHEMA:'pocasi-loucka.eu_old'},
  {WEATHER_STAGING_ENABLED:'NO'},
  {WEATHER_DEV_PREVIEW_ENABLED:'NO'},
  {WEATHER_DEV_PREVIEW_MODE:'public'}
 ]){
  assert.throws(()=>validateRhPreviewSidecarEnv({...env,...diff}),
   /isolated loopback sidecar/);
 }
});
test('operator UI assets only exist after explicit sidecar registration and contain no secrets',async t=>{
 const app=Fastify({logger:false});
 registerDevRhPreview(app,fakeReader,mock);
 registerRhPreviewOperatorUi(app);
 t.after(()=>app.close());
 const page=await app.inject('/dev/rh-preview');
 assert.equal(page.statusCode,200,page.body);
 assert.match(page.headers['cache-control'] as string,/no-store/);
 assert.match(page.headers['content-security-policy'] as string,/default-src 'none'/);
 assert.match(page.headers['content-security-policy'] as string,/script-src 'self'/);
 assert.match(page.headers['content-security-policy'] as string,/frame-ancestors 'none'/);
 assert.match(page.body,/Porovnání vlhkosti/);
 assert.match(page.body,/Přístupový token/);
 assert.doesNotMatch(page.body,/WEATHER_DEV_PREVIEW_TOKEN/);
 assert.doesNotMatch(page.body,/'t'{32}/);
 const js=await app.inject('/dev/rh-preview/app.js');
 assert.equal(js.statusCode,200);
 assert.match(js.headers['content-type'] as string,/application\/javascript/);
 assert.match(js.headers['cache-control'] as string,/no-store/);
 assert.match(js.body,/credentials:'omit'/);
 assert.match(js.body,/cache:'no-store'/);
 assert.match(js.body,/Authorization:'Bearer '/);
 assert.match(js.body,/experimental_unapproved/);
 assert.doesNotMatch(js.body,/localStorage|sessionStorage|document\.cookie|innerHTML|https?:\/\//);
 assert.doesNotThrow(()=>new Script(js.body), 'Browser JS must be syntax-valid');
 const css=await app.inject('/dev/rh-preview/style.css');
 assert.equal(css.statusCode,200);
 assert.match(css.headers['content-type'] as string,/text\/css/);
 assert.equal((await app.inject('/dev/rh-preview/nope')).statusCode,404);
});
test('private data remain 401 without valid bearer and normal API has no operator HTML',async t=>{
 const app=Fastify();
 registerDevRhPreview(app,fakeReader,mock);
 registerRhPreviewOperatorUi(app);
 t.after(()=>app.close());
 const url='/api/v1/dev/preview/rh-history?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z';
 const res=await app.inject(url);
 assert.equal(res.statusCode,401);
 assert.equal(res.headers['cache-control'],'no-store');
 const authorized=await app.inject({url,headers:{authorization:'Bearer '+ 't'.repeat(32)}});
 assert.equal(authorized.statusCode,200,authorized.body);
 assert.equal(authorized.json().approved,false);
 const normal=buildApp(fakeReader);
 t.after(()=>normal.close());
 assert.equal((await normal.inject('/dev/rh-preview')).statusCode,404);
 assert.equal((await normal.inject('/dev/rh-preview/app.js')).statusCode,404);
});
