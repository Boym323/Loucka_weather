import test from 'node:test';
import assert from 'node:assert/strict';
import {isStatisticsResult,pragueMidnightIso,nextDate,qualitySupported} from '../src/shared/domain/statistics.ts';
const result={schemaVersion:'1',metric:'outTemp',aggregation:'mean',value:9.1,unit:'degC',dataRevision:'daily-123',quality:'derived',units:'metricwx',source:'weewx_daily',provenance:'weewx-daily-mean',extremaObservedAt:null,extremaSource:'not_applicable',completeness:{expected:null,valid:366,fraction:null}};
test('recognize real API statistics but not failed or missing values',()=>{
 assert.equal(isStatisticsResult(result),true);
 assert.equal(qualitySupported(result),true);
 assert.equal(isStatisticsResult({...result,value:'9.1'}),false);
 assert.equal(qualitySupported({...result,value:null}),false);
});
test('local midnight respects both Prague DST transitions',()=>{
 assert.equal(pragueMidnightIso('2026-01-01'),'2025-12-31T23:00:00.000Z');
 assert.equal(pragueMidnightIso('2026-07-01'),'2026-06-30T22:00:00.000Z');
 assert.equal(pragueMidnightIso('2026-10-25'),'2026-10-24T22:00:00.000Z');
 assert.equal(pragueMidnightIso('2026-10-26'),'2026-10-25T23:00:00.000Z');
 assert.equal(nextDate('2026-02-28'),'2026-03-01');
});

test('statistics rejects malformed quality, completeness and fabricated time coverage',()=>{
 for(const patch of [
  {quality:'suspect'},{quality:'missing'},{aggregation:'unknown'},{units:['metricwx']},
  {completeness:[]},{completeness:{valid:'366',expected:null,fraction:null}},
  {completeness:{valid:-1,expected:null,fraction:null}},
  {completeness:{valid:1.5,expected:null,fraction:null}},
  {completeness:{valid:1,expected:null,fraction:1.1}},
  {timeCoverage:{fraction:1}},{source:'reconstructed'},
  {extremaObservedAt:'invalid'},{extremaSource:'unverified'}
 ]){assert.equal(isStatisticsResult({...result,...patch}),false,JSON.stringify(patch));
  assert.equal(qualitySupported({...result,...patch}),false);}
 const coverage={validSeconds:900,expectedSeconds:1000,fraction:.9,basis:'weewx_daily_sumtime_seconds',scope:'metric_only'};
 assert.equal(isStatisticsResult({...result,timeCoverage:coverage}),true);
 for(const patch of [{fraction:1},{validSeconds:1100},{expectedSeconds:0},{basis:'sample_count'},{scope:'all_metrics'}])
  assert.equal(isStatisticsResult({...result,timeCoverage:{...coverage,...patch}}),false);
 assert.equal(isStatisticsResult({...result,timeCoverage:{...coverage,validSeconds:1005,fraction:1}}),true);
 assert.equal(isStatisticsResult({...result,timeCoverage:null}),true);
});
test('real zero, missing and zero-count responses retain distinct meaning',()=>{
 const zero={...result,value:0};
 assert.equal(isStatisticsResult(zero),true);assert.equal(qualitySupported(zero),true);
 const missing={...result,value:null,quality:'missing',provenance:null,completeness:{expected:null,valid:0,fraction:null}};
 assert.equal(isStatisticsResult(missing),true);assert.equal(qualitySupported(missing),false);
 const emptyCount={...zero,aggregation:'count',unit:'count',completeness:{expected:null,valid:0,fraction:null}};
 assert.equal(isStatisticsResult(emptyCount),true);assert.equal(qualitySupported(emptyCount),false);
});
