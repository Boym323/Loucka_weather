import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Atlas Minimal prioritizes actual measurement over decorative illustration',async()=>{
 const home=await source('src/pages/index.astro');
 const css=await source('src/styles/atlas-minimal.css');
 assert.match(home,/CurrentPanel variant="dashboard"/);
 assert.match(home,/HistoryChart compact/);
 assert.match(home,/ForecastPanel compact/);
 assert.match(home,/LocalWarnings compact/);
 assert.match(home,/RadarPanel compact/);
 assert.doesNotMatch(home,/atlas-hero-backdrop|atlas-illustration-note/);
 assert.doesNotMatch(css,/atlas-hills\.svg/);
});

test('weather forecast uses iconography and describes model provenance',async()=>{
 const forecast=await source('src/features/forecast/ForecastPanel.astro');
 for(const kind of ['clear','partly','cloud','fog','rain','snow','storm']){
  assert.match(forecast,new RegExp('glyph-'+kind));
 }
 assert.match(forecast,/data-forecast-description/);
 assert.match(forecast,/Předpověď se nepodařilo načíst/);
 assert.match(forecast,/Modelová předpověď · nikoli měření/);
 assert.doesNotMatch(forecast,/☀️|⛅|🌫️|🌧️|🌨️|🌦️|❄️|⛈️|☁️/u);
});

test('light and dark modes preserve data distinctions',async()=>{
 const layout=await source('src/layouts/BaseLayout.astro');
 const css=await source('src/styles/atlas-minimal.css');
 const current=await source('src/features/current/CurrentPanel.astro');
 assert.match(layout,/data-theme="light"/);
 assert.match(layout,/localStorage\.getItem\('loucka-theme'\)/);
 assert.match(css,/:root\[data-theme="dark"\]/);
 assert.match(css,/--atlas-hero-text:#eff5f3/);
 assert.match(current,/Živé měření GW3000/);
 assert.match(current,/Rekonstruované měření/);
 assert.match(current,/Nedostupné měření/);
});

test('single coherent set of SVG icons is available',async()=>{
 const icons=await source('src/shared/ui/SiteIcon.astro');
 for(const icon of ['map-pin','chart','sensors','archive','record','info','alert','radar','weather']){
  assert.match(icons,new RegExp("name==='"+icon+"'"));
 }
 const doc=await source('../docs/design/UNSLOP_ATLAS.md');
 assert.match(doc,/Damir Sokolovsky/);
 assert.match(doc,/CC BY 4\.0/);
});
