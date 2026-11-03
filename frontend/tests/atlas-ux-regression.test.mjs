import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('sensor overview is a searchable and keyboard-accessible detail catalogue',async()=>{
 const component=await read('src/features/sensors/SensorChannels.astro');
 assert.match(component,/type="search" data-sensor-search/);
 assert.match(component,/data-sensor-filter/);
 assert.match(component,/<details class="sensor-channel sensor-directory-entry"/);
 assert.match(component,/data-sensor-trend/);
 assert.match(component,/entry\.addEventListener\('toggle'/);
 assert.match(component,/void loadTrend\(entry\)/);
 assert.doesNotMatch(component,/void loadTrends\(\)/); // never preload all eight histories
 assert.match(component,/reading\.quality!=='missing'&&reading\.quality!=='suspect'/);
 assert.match(component,/datum|hodnota|měření|Měření/i);
});

test('expert sensor evidence is preserved, but not expanded by default',async()=>{
 const page=await read('src/pages/senzory.astro');
 for(const component of ['SensorChannels','ChannelAvailability','AuditedSensorRegistry','SensorDiagnostics']){
  assert.match(page,new RegExp('<'+component+'\\s*\\/>'));
 }
 assert.equal((page.match(/<details class="sensor-advanced-group">/g)||[]).length,3);
});

test('history charts use thematic colors and adaptive sparse time axes',async()=>{
 const history=await read('src/features/history/AdvancedHistory.astro');
 const current=await read('src/features/history/HistoryChart.astro');
 const rain=await read('src/features/history/RainDetail.astro');
 const climate=await read('src/features/climate/ClimateDashboard.astro');
 for(const s of [history,current,rain]){
  assert.match(s,/max-width:650px/);
  assert.match(s,/hideOverlap:true/);
  assert.match(s,/splitNumber:compact\?3/);
  assert.doesNotMatch(s,/#fa6776|#fc6b7a/);
 }
 assert.match(climate,/function plotTheme|const plotTheme/);
 assert.match(climate,/splitLine:\{lineStyle:\{color:p\.grid,type:'solid'/);
 assert.doesNotMatch(climate,/#fc6b7a|#f6bd51/);
});

test('homepage prioritizes live readings and discloses the difference from archive',async()=>{
 const home=await read('src/pages/index.astro');
 const css=await read('src/styles/atlas-minimal.css');
 assert.match(home,/CurrentPanel variant="dashboard"/);
 assert.match(home,/DailySummaryStrip/);
 assert.match(home,/LocalWarnings compact/);
 assert.match(home,/HistoryChart compact/);
 assert.match(home,/ForecastPanel compact/);
 assert.match(home,/RadarPanel compact/);
 assert.match(css,/grid-template-columns:minmax\(210px,1\.15fr\)/);
 assert.match(css,/\.atlas-hero \.current-panel \[data-current-provenance\]\{display:none\}/);
});
