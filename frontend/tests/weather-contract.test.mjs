import test from 'node:test';
import assert from 'node:assert/strict';
import {isCurrentResponse,isHistoryResponse} from '../src/shared/domain/weather.ts';
const reading={value:0,unit:'mm',quality:'measured',source:'weewx_archive',provenance:null};
const current={schemaVersion:'1',observedAt:'2026-11-28T12:00:00Z',stale:false,units:'metricwx',dataset:'original',dataRevision:'fixture',readings:{rain:reading}};
const point={startTime:'2026-11-28T11:55:00Z',endTime:'2026-11-28T12:00:00Z',value:0,quality:'measured',source:'weewx_archive',provenance:null};
const history={schemaVersion:'1',metric:'rain',unit:'mm',dataRevision:'fixture',resolution:'raw',points:[point],completeness:{expected:null,valid:1,fraction:null}};
test('current guard retains zeros and genuine masked archive quality states',()=>{
 assert.equal(isCurrentResponse(current),true);
 for(const quality of ['missing','sensor_error','unverified']){
  assert.equal(isCurrentResponse({...current,readings:{rain:{...reading,value:null,quality}}}),true);
  assert.equal(isCurrentResponse({...current,readings:{rain:{...reading,value:1,quality}}}),false);
 }
 for(const patch of [{observedAt:'bad'},{readings:[]},{readings:{rain:null}},{units:'bad'},{dataset:'bad'},{readings:{rain:{...reading,value:'0'}}},{readings:{rain:{...reading,quality:'invented'}}}]){
  assert.equal(isCurrentResponse({...current,...patch}),false);
 }
});
test('history guard rejects malformed points and metadata without erasing valid zero',()=>{
 assert.equal(isHistoryResponse(history),true);
 for(const quality of ['missing','sensor_error','unverified'])
  assert.equal(isHistoryResponse({...history,points:[{...point,value:null,quality}]}),true);
 assert.equal(isHistoryResponse({...history,points:[{...point,value:999,quality:'suspect'}]}),true);
 for(const patch of [{points:[null]},{points:[{...point,startTime:point.endTime}]},{points:[{...point,endTime:'bad'}]},
  {points:[{...point,value:Infinity}]},{points:[{...point,quality:'sensor_error'}]},
  {points:[{...point,minValue:'2'}]},{points:[{...point,validCount:-1}]},{resolution:'unknown'},{dataRevision:null},
  {completeness:{expected:null,valid:'1',fraction:null}}])assert.equal(isHistoryResponse({...history,...patch}),false);
});
