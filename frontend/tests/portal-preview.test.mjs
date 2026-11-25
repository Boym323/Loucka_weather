import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHourlyForecast} from '../src/shared/domain/hourly-forecast.ts';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
const now=Date.parse('2026-11-25T12:20:00Z');
const base={hourly_units:{temperature_2m:'°C',precipitation:'mm',precipitation_probability:'%',wind_speed_10m:'m/s'},hourly:{time:[now/1000-4800,now/1000-1200,now/1000+2400],temperature_2m:[1,2,null],precipitation:[0,null,2],precipitation_probability:[0,50,90],wind_speed_10m:[1,2,3]}};
test('hourly model retains missing and zero values and rejects mismatched units',()=>{
 const points=parseHourlyForecast(base,now,12);
 assert.equal(points.length,2);assert.equal(points[0].precipitation,null);assert.equal(points[1].temperature,null);assert.equal(points[1].precipitation,2);
 assert.deepEqual(parseHourlyForecast({...base,hourly_units:{...base.hourly_units,wind_speed_10m:'km/h'}},now),[]);
});
test('portal layout reuses real components and preserves original homepage',async()=>{
 const portal=await read('src/features/portal/PortalOverview.astro'),home=await read('src/pages/prehled-klasicky.astro');
 const landing=await read('src/pages/index.astro'),alias=await read('src/pages/prehled-novy.astro');
 assert.match(landing,/<PortalOverview \/>/);
 assert.equal(landing,alias);
 assert.match(portal,/href="\/prehled-klasicky\/"/);
 assert.match(portal,/<CurrentPanel variant="portal" \/>/);
 assert.match(portal,/<ForecastPanel compact \/>/);
 assert.ok(portal.indexOf('<ForecastPanel')<portal.indexOf('<RadarPanel'));
 assert.ok(portal.indexOf('<WindCompass')<portal.indexOf('<ForecastPanel'));
 assert.ok(portal.indexOf('<ArchiveTrends')<portal.indexOf('<RadarPanel'));
 assert.match(portal,/<LocalWarnings compact condensed strip \/>/);
 assert.match(home,/<CurrentPanel variant="observatory" \/>/);
 assert.match(home,/href="\/prehled-novy\/"/);
});
