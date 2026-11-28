import test from 'node:test';
import assert from 'node:assert/strict';
import {warningDate,warningState,severityDisplay,warningCount,warningSummary} from '../src/features/alerts/warning-display.ts';
const alert={onset:'2026-11-26T10:00:00+01:00',expires:'2026-11-27T06:00:00+01:00'};
test('warning validity respects offset and expiry boundary',()=>{
 assert.equal(warningState(alert,Date.parse('2026-11-26T08:59:59Z')),'upcoming');
 assert.equal(warningState(alert,Date.parse('2026-11-26T09:00:00Z')),'active');
 assert.equal(warningState(alert,Date.parse('2026-11-27T05:00:00Z')),'expired');
 assert.equal(warningState({...alert,onset:''},Date.parse('2026-11-26T09:00:00Z')),'unknown');
});
test('warning timestamps use Prague time and invalid data is explicit',()=>{
 assert.match(warningDate(alert.onset),/10:00/);
 assert.match(warningDate('2026-07-01T10:00:00Z'),/12:00/);
 assert.equal(warningDate(''),'čas neuveden');
});
test('severity, counts and extracts are Czech without invented information',()=>{
 assert.equal(severityDisplay('Severe').level,'severe');
 assert.equal(severityDisplay('Extreme').level,'extreme');
 assert.equal(severityDisplay('Minor').level,'minor');
 assert.equal(severityDisplay('Unknown').level,'unknown');
 assert.deepEqual([1,2,5].map(warningCount),['1 výstraha','2 výstrahy','5 výstrah']);
 assert.equal(warningSummary('Vydatné sněžení. Riziko komplikací.'),'Vydatné sněžení.');
});
