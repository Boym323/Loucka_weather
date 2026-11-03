import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('approved homepage places real measurements, wind and history in one glass panel',async()=>{
 const page=await source('src/pages/index.astro');
 const position=(value)=>page.indexOf(value);
 for(const tag of ['CurrentPanel variant="observatory"',
  'DailySummaryStrip','WindCompass variant="hero"',
  'HistoryChart compact hero','SolarCycle','SameDayLastYear','StationSummary',
  'LocalWarnings compact','ForecastPanel compact','RadarPanel compact']){
  assert.ok(position(tag)>0,tag+' missing');
 }
 assert.ok(position('CurrentPanel variant="observatory"')<position('WindCompass variant="hero"'));
 assert.ok(position('WindCompass variant="hero"')<position('HistoryChart compact hero'));
 assert.match(page,/evergreen-hero/);
 assert.match(page,/evergreen-spotlight/);
 assert.match(page,/webcam\.pocasi-loucka\.eu\/zapadni_kamera\.jpg/);
 assert.match(page,/čas pořízení snímku není ověřen/);
 assert.doesNotMatch(page,/6,5 °C|476 m|Davis Vantage Pro2|Polojasno/);
});

test('actual directional wind, speed and gust preserve independent provenance',async()=>{
 const wind=await source('src/features/current/WindCompass.astro');
 for(const metric of ['windDir','windSpeed','windGust'])assert.match(wind,new RegExp(metric));
 assert.match(wind,/source==='gw3000_live'&&value\.quality==='measured'/);
 assert.match(wind,/getCurrent\(controller\.signal\)/);
 assert.match(wind,/loucka:live-expired/);
 assert.match(wind,/data-wind-source/);
 assert.match(wind,/m\/s/);
});

test('hero current temperature and dewpoint are only displayed from source readings',async()=>{
 const panel=await source('src/features/current/CurrentPanel.astro');
 assert.match(panel,/observatoryMetrics/);
 assert.match(panel,/id:'dewpoint'/);
 assert.match(panel,/for\(const metric of activeMetrics\)/);
 assert.match(panel,/quality==='missing'\|\|reading\.quality==='suspect'/);
 assert.match(panel,/readings\[metric\.id\]/);
 assert.match(panel,/data-current-provenance/);
});

test('responsive photo composition and dark mode have explicit rules',async()=>{
 const css=await source('src/styles/observatory-evergreen.css');
 const base=await source('src/layouts/BaseLayout.astro');
 assert.match(base,/observatory-evergreen\.css/);
 assert.match(css,/\.evergreen-landscape img/);
 assert.match(css,/backdrop-filter:blur/);
 assert.match(css,/grid-template-areas:"core wind chart"/);
 assert.match(css,/grid-template-areas:"core" "daily" "wind" "chart"/);
 assert.match(css,/:root\[data-theme="dark"\] \.evergreen-home/);
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/prefers-reduced-motion/);
});

test('station facts never borrow unverified equipment or elevation from concept artwork',async()=>{
 const station=await source('src/features/current/StationSummary.astro');
 assert.match(station,/29\. března 2009/);
 assert.match(station,/Ecowitt GW3000/);
 assert.match(station,/WeeWX \/ MariaDB/);
 assert.doesNotMatch(station,/Davis Vantage|476 m|živě/);
});
