import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('current client delegates concurrent reads and retains response validation',async()=>{
 const api=await read('src/shared/api/client.ts');
 assert.match(api,/createConcurrentRequest<CurrentResponse>/);
 assert.match(api,/currentRequest\.invalidate\(\)/);
 assert.match(api,/currentRequest\.get\(signal\)/);
 assert.match(api,/isCurrentResponse\(data\)/);
 assert.doesNotMatch(api,/localStorage|sessionStorage|indexedDB/);
});

test('archive revision and live expiry force fresh GET to preserve provenance',async()=>{
 const component=await read('src/features/current/CurrentPanel.astro');
 assert.match(component,/import \{ getCurrent, invalidateCurrentRequest \}/);
 assert.match(component,/const archiveUpdated=\(\)=>\{/);
 assert.match(component,/invalidateCurrentRequest\(\)/);
 assert.match(component,/let archiveRequestSerial=0/);
 assert.match(component,/if\(controller\.signal\.aborted\|\|serial!==archiveRequestSerial\)return/);
});

test('browser regression covers 320, 390 and 1440 widths without altering data',async()=>{
 const script=await read('scripts/current-coalesce-browser-check.mjs');
 const workflow=await read('../.github/workflows/frontend-staging.yml');
 for(const width of [320,390,1440])assert.ok(script.includes(String(width)));
 assert.match(script,/currentCount,1/);
 assert.match(script,/currentCount,2/);
 assert.match(workflow,/current-coalesce-browser-check\.mjs/);
});
