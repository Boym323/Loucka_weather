import test from 'node:test';
import assert from 'node:assert/strict';
import {humidityCoverage} from '../src/shared/domain/humidity-coverage.ts';
import {pragueMidnightIso,nextDate} from '../src/shared/domain/statistics.ts';

const point=(day,value,quality='derived',source='weewx_daily')=>({
 startTime:pragueMidnightIso(day),endTime:pragueMidnightIso(nextDate(day)),
 value,quality,source,provenance:null
});
const history=points=>({schemaVersion:'1',metric:'outHumidity',unit:'%',resolution:'daily',
 dataRevision:'fixture',points});

test('RH coverage separates original daily values, missing summaries and suspect values',()=>{
 const result=humidityCoverage(2022,history([
  point('2022-01-01',85),point('2022-01-02',null,'missing','derived'),
  point('2022-01-03',0),point('2022-01-04',101),
  point('2022-01-05',70,'suspect'),point('2022-01-06',50,'derived'),
  {...point('2022-01-07',50),validCount:0},point('2022-01-08',100)
 ]));
 assert.equal(result.expectedDays,365);
 assert.equal(result.availableDays,3);
 assert.equal(result.suspectDays,4);
 assert.equal(result.missingDays,358);
 assert.deepEqual(result.months[0],{month:1,expectedDays:31,availableDays:3,missingDays:24,suspectDays:4});
 assert.equal(result.months[1].missingDays,28);
});
test('leap years and true Europe/Prague day boundaries are retained',()=>{
 const r=humidityCoverage(2024,history([
  point('2024-02-29',50),point('2024-03-31',66),point('2024-10-27',78)
 ]));
 assert.equal(r.expectedDays,366);
 assert.equal(r.months[1].expectedDays,29);
 assert.equal(r.months[1].availableDays,1);
 assert.equal(r.months[2].availableDays,1);
 assert.equal(r.months[9].availableDays,1);
 const spring=point('2024-03-31',66);
 assert.equal(Date.parse(spring.endTime)-Date.parse(spring.startTime),23*3600000);
 const autumn=point('2024-10-27',78);
 assert.equal(Date.parse(autumn.endTime)-Date.parse(autumn.startTime),25*3600000);
});
test('never accept reconstructed, reference, duplicate, wrong metric or ambiguous day data',()=>{
 const d=point('2022-01-01',60);
 for(const rows of [
  [point('2022-01-01',60,'reconstructed')],
  [point('2022-01-01',60,'derived','external_reference')],
  [point('2022-01-01',60,'derived','derived')],
  [d,d],
  [{...d,endTime:d.startTime}],
  [point('2021-12-31',60)]
 ])assert.throws(()=>humidityCoverage(2022,history(rows)));
 assert.throws(()=>humidityCoverage(2022,{...history([]),unit:'°C'}));
 assert.throws(()=>humidityCoverage(2022,{...history([]),metric:'outTemp'}));
});
test('no available summaries means missing calendar days, never 0 percent RH',()=>{
 const r=humidityCoverage(2022,history([]));
 assert.equal(r.availableDays,0);
 assert.equal(r.missingDays,365);
 assert.equal(r.suspectDays,0);
 assert.equal(r.months.length,12);
});
