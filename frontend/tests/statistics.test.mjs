import test from 'node:test';
import assert from 'node:assert/strict';
import {isStatisticsResult,pragueMidnightIso,nextDate,qualitySupported} from '../src/shared/domain/statistics.ts';
const result={schemaVersion:'1',metric:'outTemp',aggregation:'mean',value:9.1,unit:'degC',dataRevision:'daily-123',quality:'derived',completeness:{expected:null,valid:366,fraction:null}};
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
