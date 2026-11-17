import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('CurrentPanel ignores out-of-order archive GETs and clears recovered styling',async()=>{
 const component=await readFile(new URL('../src/features/current/CurrentPanel.astro',import.meta.url),'utf8');
 assert.match(component,/let archiveRequestSerial=0/);
 assert.match(component,/const serial=\+\+archiveRequestSerial/);
 assert.match(component,/if\(controller\.signal\.aborted\|\|serial!==archiveRequestSerial\)return/);
 assert.match(component,/status\.className='status-chip '/);
 assert.match(component,/archiveRetryTimer/);
});
test('offline browser checks delayed current GET across all device widths',async()=>{
 const check=await readFile(new URL('../scripts/current-failover-race-browser-check.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../../.github/workflows/frontend-staging.yml',import.meta.url),'utf8');
 for(const width of [320,390,1440])assert.ok(check.includes(''+width));
 assert.match(check,/holdInitial=false/);
 assert.match(check,/loucka:archive-updated/);
 assert.match(check,/29,9/);
 assert.match(workflow,/node scripts\/current-failover-race-browser-check\.mjs/);
});
