import test from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,station,screenGeo,screenPosition,sampleGrid,interpolate,temperatureColor} from '../src/features/maps/map-geometry.ts';
test('mercator round trip and viewport grid use actual view',()=>{
 const p=unproject(project(station,7),7);assert.ok(Math.abs(p.lat-station.lat)<1e-8&&Math.abs(p.lon-station.lon)<1e-8);
 const v={center:station,zoom:7,scale:2,width:1024,height:600};
 assert.deepEqual(screenPosition(station,v),{x:512,y:300});
 const g=sampleGrid(v);assert.equal(g.points.length,35);assert.ok(g.points[0].lat>station.lat&&g.points[0].lon<station.lon);
 const close=sampleGrid({...v,zoom:9});assert.ok(Math.abs(close.points[0].lat-station.lat)<Math.abs(g.points[0].lat-station.lat));
 assert.deepEqual(screenPosition(screenGeo({x:0,y:0},v),v),{x:0,y:0});
});
test('interpolation is bounded and missing samples stay transparent',()=>{
 assert.equal(interpolate([0,10,20,30],2,2,.5,.5),15);
 assert.equal(interpolate([0,10,null,30],2,2,.5,.5),null);
 assert.equal(interpolate([0,10,20,30],2,2,1.1,.5),null);
 assert.deepEqual(temperatureColor(-50),temperatureColor(-30));
});
