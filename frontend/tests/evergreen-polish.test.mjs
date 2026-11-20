import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Evergreen polish is scoped to weather homepage and respects reduced motion',async()=>{
 const css=await read('src/styles/observatory-evergreen.css');
 assert.match(css,/Fine polish after desktop/);
 assert.match(css,/\.evergreen-hero \.current-panel \[data-current-updated\]/);
 assert.match(css,/\.evergreen-home :is\(a,button,summary\):focus-visible/);
 assert.match(css,/:root\[data-theme="dark"\] \.evergreen-home/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.evergreen-spotlight \.evergreen-camera-tile \.atlas-media-image:hover img/);
 assert.doesNotMatch(css,/data-metric-value\s*=|fake|placeholder data/i);
});

test('weather source microcopy remains precise without redundant qualifiers',async()=>{
 const current=await read('src/features/current/CurrentPanel.astro');
 const wind=await read('src/features/current/WindCompass.astro');
 const chart=await read('src/features/history/HistoryChart.astro');
 assert.match(current,/Přečteno /);
 assert.match(current,/Naměřeno /);
 assert.match(current,/Některá měření se aktualizují živě, ostatní podle posledního záznamu/);
 assert.match(current,/data-current-provenance/);
 assert.match(current,/reading\.quality==='missing'\|\|reading\.quality==='suspect'/);
 assert.match(wind,/Šipka ukazuje, odkud vítr vane/);
 assert.match(wind,/reading\?\.source==='gw3000_live'|value\?\.source==='gw3000_live'/);
 assert.match(chart,/Kde chybí měření, graf má mezeru/);
 assert.match(chart,/connectNulls:false/);
});
