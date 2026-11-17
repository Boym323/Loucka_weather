import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {featuredClimateRecords,highlightMetrics} from '../src/shared/domain/climate-highlights.ts';

const record=(value,unit,date,quality='unverified_original')=>({
 value,unit,localDate:date,quality
});
const fixture={
 schemaVersion:'1',dataset:'original',status:'preliminary',
 records:{
  maxTemp:record(36.5,'°C','2015-08-08'),
  minTemp:record(-18.2,'°C','2012-02-06'),
  maxDailyRain:record(32.5,'mm','2021-07-25'),
  maxWindGust:record(0,'m/s','2020-03-10')
 }
};
test('visitor highlights show only original preliminary records with real calendar dates',()=>{
 const rows=featuredClimateRecords(fixture);
 assert.equal(rows.length,4);
 assert.equal(highlightMetrics.length,4);
 assert.equal(rows[0].value,'36,5 °C');
 assert.equal(rows[0].isoDate,'2015-08-08');
 assert.match(rows[0].date,/srpna 2015/);
 assert.equal(rows[1].value,'-18,2 °C');
 assert.equal(rows[3].value,'0,0 m/s','A real zero is not missing');
 assert.match(rows[2].caution,/Červenec 2021/);
});
test('unapproved, malformed or untrustworthy values cannot become visitor records',()=>{
 for(const change of [
  {schemaVersion:'2'},{status:'approved'},{dataset:'approved'},{records:null}
 ]){
  assert.equal(featuredClimateRecords({...fixture,...change}),null);
 }
 const suspect=featuredClimateRecords({...fixture,records:{
  maxTemp:record(36.5,'°C','2015-08-08','suspect'),
  minTemp:record(10,'°C','2025-02-29'),
  maxDailyRain:record(null,'mm','2021-07-25'),
  maxWindGust:record(-10,'m/s','2020-03-10')
 }});
 assert.equal(suspect.length,4);
 assert.ok(suspect.every(row=>!row.available&&row.value==='—'&&row.isoDate===null));
 const mismatch=featuredClimateRecords({...fixture,records:{
  ...fixture.records,maxTemp:record(123,'K','2015-08-08')
 }});
 assert.equal(mismatch[0].available,false);
});
test('climate landing includes source-protected highlights and direct comparison links',async()=>{
 const page=await readFile(new URL('../src/pages/klimatologie.astro',import.meta.url),'utf8');
 const component=await readFile(new URL('../src/features/climate/ClimateHighlights.astro',import.meta.url),'utf8');
 const browser=await readFile(new URL('../scripts/climate-atlas-browser-check.mjs',import.meta.url),'utf8');
 assert.match(page,/<ClimateHighlights \/>/);
 assert.ok(page.indexOf('<ClimateHighlights />')<page.indexOf('climate-atlas-grid'));
 assert.match(page,/href="#teplota-vsechny-roky"/);
 assert.match(page,/href="#srovnani-let"/);
 assert.match(component,/data-highlights-status/);
 assert.match(component,/Známé omezení srážkového záznamu/);
 assert.match(component,/IntersectionObserver/);
 assert.match(browser,/data-highlight-value="maxTemp"/);
});
