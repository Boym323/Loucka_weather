import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('climate visitor dashboard uses one validated original-only API request',async()=>{
 const page=await load('src/features/climate/ClimateDashboard.astro');
 const client=await load('src/shared/api/client.ts');
 assert.match(page,/getClimateDashboard\(year,signal\)/);
 assert.doesNotMatch(page,/getStatistics\(/);
 assert.doesNotMatch(page,/getHistoryInterval\(/);
 assert.doesNotMatch(page,/runLimited\(/);
 assert.match(client,/dataset:'original'/);
 assert.match(client,/qcStatus!=='original_unverified'/);
 assert.match(client,/calendarTimezone!=='Europe\/Prague'/);
 assert.match(client,/getClimateDashboard/);
 assert.match(page,/data\.monthly\.temperatureLow|temperatureLow:lows/);
 assert.match(page,/data\.monthly\.temperatureHigh|temperatureHigh:highs/);
 assert.match(page,/coverage===null\?'Neověřeno'/);
});
test('browser smoke checks live dev draw and bounded API traffic',async()=>{
 const script=await load('scripts/climate-atlas-browser-check.mjs');
 assert.match(script,/\[data-climate-dashboard\].*scrollIntoViewIfNeeded/);
 assert.match(script,/api\/v1\/climate\/dashboard/);
 assert.match(script,/data-chart="rain"/);
 const publicSmoke=await load('scripts/preview-visual-check.mjs');
 assert.match(publicSmoke,/VISITOR LAB TIMING/);
 assert.match(publicSmoke,/apiFetchCount/);
});
