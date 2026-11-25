import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {displayLocalDate,displayMonthDay} from '../src/shared/domain/display-date.ts';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('calendar dates keep station local day',()=>{
 assert.equal(displayLocalDate('2021-07-25'),'25. 7. 2021');
 assert.equal(displayLocalDate('2026-01-01'),'1. 1. 2026');
 assert.equal(displayMonthDay('11-25'),'25. 11.');
 assert.equal(displayLocalDate('—'),'—');
});
test('forecast precedes context cards and mobile atlas has one chapter selector',async()=>{
 const home=await read('src/pages/index.astro');
 assert.ok(home.indexOf('id="pocasi-predpoved"')<home.indexOf('id="pocasi-kamera"'));
 assert.match(await read('src/styles/climate-atlas.css'),/\.climate-atlas \.climate-atlas-nav\{display:none\}/);
 assert.match(await read('src/pages/puda-ovzdusi.astro'),/class="soil-live-unit"/);
});
