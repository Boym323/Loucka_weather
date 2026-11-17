import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('dev smoke records passive anonymous navigation and API evidence',async()=>{
 const source=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.match(source,/performance\.getEntriesByType\('navigation'\)/);
 assert.match(source,/performance\.getEntriesByType\('paint'\)/);
 assert.match(source,/navigationDurationMs/);
 assert.match(source,/apiFetchP95Ms/);
 assert.match(source,/visitor-performance\.json/);
 assert.match(source,/noExtraRequests:true/);
 assert.match(source,/notFieldWebVitals:true/);
 assert.match(source,/incomplete:errors\.length>0/);
 assert.ok(source.indexOf('visitorPerformance.push')<source.indexOf('await page.screenshot('));
 assert.ok(source.indexOf('await writeFile(')>source.indexOf('finally{await browser.close();}'));
});

test('public camera retains source and freshness disclaimer after plain-language change',async()=>{
 const source=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.match(source,/sourceIdentified=layout\.sourceLabel\.includes/);
 assert.match(source,/freshnessCaution=/);
 assert.match(source,/snímek nemusí být právě pořízený/);
 assert.match(source,/čas pořízení snímku není ověřen/);
});
