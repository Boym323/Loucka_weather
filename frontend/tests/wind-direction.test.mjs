import test from 'node:test';
import assert from 'node:assert/strict';
import {describeWindFrom,nearestWindRotation} from '../src/shared/domain/wind-direction.ts';

test('meteorological directions specify wind FROM, with Czech 16-point names',()=>{
 assert.deepEqual(describeWindFrom(0),{degrees:0,rounded:0,long:'severní',short:'S'});
 assert.equal(describeWindFrom(45)?.short,'SV');
 assert.equal(describeWindFrom(90)?.short,'V');
 assert.equal(describeWindFrom(135)?.short,'JV');
 assert.equal(describeWindFrom(165)?.short,'JJV');
 assert.equal(describeWindFrom(180)?.short,'J');
 assert.equal(describeWindFrom(225)?.short,'JZ');
 assert.equal(describeWindFrom(270)?.short,'Z');
 assert.equal(describeWindFrom(315)?.short,'SZ');
});

test('meteorological 0°, 360° and negative bearings normalize, missing stays missing',()=>{
 assert.equal(describeWindFrom(360)?.degrees,0);
 assert.equal(describeWindFrom(-90)?.degrees,270);
 assert.equal(describeWindFrom(359.9)?.rounded,0);
 assert.equal(describeWindFrom(359.9)?.short,'S');
 assert.equal(describeWindFrom(Number.NaN),null);
 assert.equal(describeWindFrom(Infinity),null);
 assert.equal(describeWindFrom(-Infinity),null);
});

test('needle rotates along shortest route through north, in both directions',()=>{
 assert.equal(nearestWindRotation(null,350),350);
 assert.equal(nearestWindRotation(350,10),370);
 assert.equal(nearestWindRotation(10,350),-10);
 assert.equal(nearestWindRotation(370,350),350);
 assert.equal(nearestWindRotation(-10,10),10);
 assert.equal(nearestWindRotation(90,90),90);
});
