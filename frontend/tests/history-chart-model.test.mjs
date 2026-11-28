import test from 'node:test';
import assert from 'node:assert/strict';
import {validHistoryPoint,historyQualityName,escapeChartHtml,historyAxisPoints,summarizeHistorySeries,historyTotals} from '../src/shared/domain/history-chart-model.ts';

const point=(value,quality='measured')=>({startTime:'2026-11-28T12:00:00Z',endTime:'2026-11-28T12:05:00Z',value,quality,source:'weewx_archive',provenance:null});
test('history model preserves measured zero, excludes suspect, missing and invalid values',()=>{
 const points=[point(0),point(-2,'derived'),point(3,'reconstructed'),point(999,'suspect'),point(null,'missing'),point(NaN),point(1,'unverified'),point('2')];
 assert.deepEqual(summarizeHistorySeries(points),{measured:1,derived:1,reconstructed:1,missing:5,minimum:-2,maximum:3});
 assert.deepEqual(historyAxisPoints(points).map(p=>p[1]),[0,-2,3,null,null,null,null,null]);
 assert.equal(validHistoryPoint(undefined),false);assert.equal(validHistoryPoint(null),false);
});
test('history summaries are empty-safe and combine independent series without spreading arrays',()=>{
 const empty=summarizeHistorySeries([]);
 assert.deepEqual(empty,{measured:0,derived:0,reconstructed:0,missing:0,minimum:null,maximum:null});
 const points=Array.from({length:150000},(_,i)=>point(i%2?5:-7));
 const large=summarizeHistorySeries(points);
 assert.equal(large.minimum,-7);assert.equal(large.maximum,5);
 assert.deepEqual(historyTotals([empty,large,summarizeHistorySeries([point(null,'missing')])]),{measured:150000,derived:0,reconstructed:0,missing:1});
});
test('chart labels escape untrusted HTML and preserve quality names',()=>{
 assert.equal(escapeChartHtml('<img src="x">&\''),'&lt;img src=&quot;x&quot;&gt;&amp;&#39;');
 assert.equal(historyQualityName('reconstructed'),'rekonstruováno');assert.equal(historyQualityName('unknown'),'neznámá');
});
