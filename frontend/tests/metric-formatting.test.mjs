import test from 'node:test';
import assert from 'node:assert/strict';
import {formatMetricValue,chartValue,metricAxisStep,metricDigits} from '../src/shared/domain/metrics.ts';
test('display precision follows meteorological metric, not floating point precision',()=>{
 assert.equal(formatMetricValue(2.345678,'outTemp'),'2,3');
 assert.equal(formatMetricValue(84.1234,'outHumidity'),'84');
 assert.equal(formatMetricValue(125.987,'radiation'),'126');
 assert.equal(formatMetricValue(-0.00001,'barometer'),'0,0');
 assert.equal(formatMetricValue(135.23,'windDir'),'135');
 assert.equal(formatMetricValue(1.234,'soilTemp1'),'1,2');
 assert.equal(chartValue(3.234,'windSpeed','m/s'),'3,2 m/s');
 assert.equal(chartValue(135.12,'windDir','°'),'135°');
 assert.equal(chartValue(null,'rain','mm'),'—');
 assert.equal(chartValue(NaN,'rain','mm'),'—');
 assert.equal(chartValue(0,'rain','mm'),'0,0 mm');
 assert.equal(metricAxisStep('outHumidity'),1);
 assert.equal(metricAxisStep('outTemp'),0.1);
 assert.equal(metricDigits('soilMoisture1','%'),0);
});
