import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveHourChange} from '../src/shared/domain/archive-trend.ts';
import {warningsForDay} from '../src/features/alerts/warning-calendar.ts';
import {compareTemperaturePeriod} from '../src/shared/domain/portal-climate.ts';
const now=Date.parse('2026-11-25T12:00Z');
test('archive trend requires measured fresh endpoint and no interpolation',()=>{
 const p=(minutes,value,quality='measured')=>({endTime:new Date(now-minutes*60000).toISOString(),value,quality,source:'weewx_archive'});
 assert.equal(archiveHourChange([p(60,2),p(0,3)],now).delta,1);
 assert.equal(archiveHourChange([p(60,2),p(0,3,'suspect')],now),null);
 assert.equal(archiveHourChange([p(100,2),p(40,3)],now),null);
});
test('warnings overlap Prague civil day, not boundary at midnight',()=>{
 const a={onset:'2026-11-26T10:00:00+01:00',expires:'2026-11-27T00:00:00+01:00',severity:'Severe'};
 assert.equal(warningsForDay([a],'2026-11-26',now).length,1);
 assert.equal(warningsForDay([a],'2026-11-27',now).length,0);
 assert.equal(warningsForDay([a],'2026-11-26',Date.parse(a.expires)).length,0);
});
test('temperature baseline requires three older years on identical adequately covered days',()=>{
 const point=(year,day,value,validSeconds=86400)=>({date:year+'-01-'+day,year,monthDay:'01-'+day,value,quality:'derived',validSeconds,expectedSeconds:86400});
 const points=[2023,2024,2025,2026].flatMap(y=>[point(y,'01',y===2026?3:1),point(y,'02',y===2026?5:3)]);
 const data={firstYear:2023,endsBefore:'2026-01-03',points};
 const r=compareTemperaturePeriod(data,'2026-01-01','2026-01-03');
 assert.equal(r.delta,2);assert.deepEqual(r.years,[2023,2024,2025]);
 assert.equal(compareTemperaturePeriod({...data,points:points.filter(p=>p.year!==2024)},'2026-01-01','2026-01-03'),null);
});
