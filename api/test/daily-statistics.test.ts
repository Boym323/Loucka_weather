import {test} from 'node:test';
import assert from 'node:assert/strict';
import {aggregateSummaryRows,dailyHistoryPoints} from '../src/daily-statistics.js';
import type {DailySummaryRow} from '../src/store.js';
import {localMidnight} from '../src/calendar-time.js';

const at=(day:string)=>{const time=localMidnight(day);assert.notEqual(time,null);return time!;};
const row=(day:string,patch:Partial<DailySummaryRow>={}):DailySummaryRow=>{
 const dateTime=at(day);
 return {dateTime,usUnits:17,min:0,mintime:dateTime+300,max:10,maxtime:dateTime+600,sum:10,count:2,wsum:3000,sumtime:600,...patch};
};
test('weighted daily mean uses duration, not the mean of daily means',()=>{
 const a=row('2026-01-01');
 const b=row('2026-01-02',{wsum:18000,sumtime:1800,count:6,max:12});
 assert.equal(aggregateSummaryRows('outTemp','mean',[a,b],'metricwx').value,8.75);
 assert.equal(aggregateSummaryRows('outTemp','mean',[a,b],'metricwx').valid,8);
});
test('daily totals distinguish measured zero from missing observations',()=>{
 const zero=row('2026-01-01',{min:0,max:0,sum:0,wsum:0});
 assert.equal(aggregateSummaryRows('rain','sum',[zero],'metricwx').value,0);
 const missing=row('2026-01-02',{min:null,mintime:null,max:null,maxtime:null,sum:null,count:0,wsum:null,sumtime:0});
 assert.equal(aggregateSummaryRows('rain','sum',[missing],'metricwx').value,null);
 assert.equal(aggregateSummaryRows('rain','sum',[],'metricwx').value,null);
});
test('daily extrema and gust direction retain original observation time',()=>{
 const a=row('2026-01-01',{min:-5,max:12,max_dir:90});
 const b=row('2026-01-02',{min:-3,max:20,max_dir:270});
 const minimum=aggregateSummaryRows('outTemp','min',[a,b],'metricwx');
 assert.equal(minimum.value,-5);assert.equal(minimum.extremaObservedAt,a.mintime);
 const direction=aggregateSummaryRows('windGustDir','dir_at_max',[a,b],'metricwx');
 assert.equal(direction.value,270);assert.equal(direction.extremaObservedAt,b.maxtime);
 const vector=aggregateSummaryRows('windDir','vecdir',[{...a,xsum:0,ysum:2},{...b,xsum:0,ysum:1}],'metricwx');
 assert.equal(vector.value,0);
});
test('daily points retain missing days and Prague DST boundaries',()=>{
 const sample=row('2026-03-29',{min:0,max:0,sum:0,wsum:0});
 const result=dailyHistoryPoints('rain','sum',[sample],'2026-03-28','2026-03-30','metricwx');
 assert.deepEqual(result.points.map(p=>p.value),[null,0]);
 assert.equal(result.points[0]?.quality,'missing');
 assert.equal(result.points[1]?.provenance,'weewx-daily-sum');
 assert.equal(Date.parse(result.points[1]!.endTime)-Date.parse(result.points[1]!.startTime),23*3600000);
 assert.equal(result.valid,2);
});
test('daily validation rejects invalid duration, extrema and ordering',()=>{
 const a=row('2026-01-01');
 assert.throws(()=>aggregateSummaryRows('outTemp','mean',[{...a,sumtime:-1}],'metricwx'),/Invalid daily summary duration/);
 assert.throws(()=>aggregateSummaryRows('outTemp','min',[{...a,mintime:null}],'metricwx'),/Incomplete daily summary extrema/);
 assert.throws(()=>aggregateSummaryRows('outTemp','mean',[{...a,wsum:null}],'metricwx'),/Incomplete weighted daily summary/);
 assert.throws(()=>dailyHistoryPoints('outTemp','mean',[a,a],'2026-01-01','2026-01-03','metricwx'),/Invalid daily summary boundaries or ordering/);
 assert.throws(()=>dailyHistoryPoints('outTemp','mean',[{...a,dateTime:a.dateTime+60}],'2026-01-01','2026-01-03','metricwx'),/Invalid daily summary boundaries or ordering/);
});
