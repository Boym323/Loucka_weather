import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('unavailable API cannot masquerade as fresh measurements and preserves a known timestamp',async()=>{
 const source=await read('src/features/current/CurrentPanel.astro');
 assert.match(source,/let lastArchiveObservedAt:string\|null=null/);
 assert.match(source,/lastArchiveObservedAt=response\.observedAt/);
 assert.match(source,/section\.dataset\.currentState='error'/);
 assert.match(source,/lastArchiveObservedAt\?'Aktualizace selhala':'Měření nedostupné'/);
 assert.match(source,/Poslední známé měření:/);
 assert.match(source,/Zobrazené hodnoty jsou poslední dostupné údaje/);
 assert.match(source,/Nezobrazujeme odhadované hodnoty/);
 assert.match(source,/section\.dataset\.currentState='live'/);
});

test('historical graphs offer a real retry and collapse unavailable chart canvas',async()=>{
 const source=await read('src/features/history/HistoryChart.astro');
 const styles=await read('src/styles/ux-stages.css');
 assert.match(source,/data-chart-retry hidden/);
 assert.match(source,/retry\?\.addEventListener\('click',\(\)=>void update\(\)\)/);
 assert.match(source,/figure\.dataset\.chartState='error'/);
 assert.match(source,/element\.hidden=true/);
 assert.match(source,/figure\.dataset\.chartState=valid\.length\?'ready':'empty'/);
 assert.match(source,/window\.removeEventListener\('loucka:archive-updated',archiveChanged\)/);
 assert.match(styles,/\.chart-figure \.chart-box\[hidden\]\{display:none!important\}/);
});

test('advanced history shows an actionable fallback instead of a large empty plot',async()=>{
 const source=await read('src/features/history/AdvancedHistory.astro');
 const styles=await read('src/styles/ux-stages.css');
 assert.match(source,/data-advanced-feedback hidden/);
 assert.match(source,/data-advanced-retry/);
 assert.match(source,/retry\?\.addEventListener\('click',\(\)=>void refresh\(\)\)/);
 assert.match(source,/canvas\.hidden=true/);
 assert.match(source,/if\(!total\)/);
 assert.match(styles,/\.advanced-history \.advanced-history-chart\[hidden\]/);
});

test('mobile homepage promotes practical routes without duplicating weather API calls',async()=>{
 const source=await read('src/pages/index.astro');
 const styles=await read('src/styles/ux-stages.css');
 const layout=await read('src/layouts/BaseLayout.astro');
 assert.match(source,/class="evergreen-quick-access"/);
 for(const id of ['pocasi-predpoved','pocasi-radar','pocasi-kamera']){
  assert.match(source,new RegExp('id="'+id+'"'));
  assert.match(source,new RegExp('href="#'+id+'"'));
 }
 assert.match(styles,/\.evergreen-home>\.atlas-home-analytics\.evergreen-analytics\{order:3\}/);
 assert.match(styles,/\.evergreen-home>\.observatory-instruments\.evergreen-spotlight\{order:4\}/);
 assert.match(layout,/import '\.\.\/styles\/ux-stages\.css'/);
});

test('climate landing keeps expert comparison accessible while protecting deep links',async()=>{
 const page=await read('src/pages/klimatologie.astro');
 const nav=await read('src/features/climate/AtlasNav.astro');
 const styles=await read('src/styles/ux-stages.css');
 assert.match(page,/<details class="atlas-legacy-area atlas-deep-dive"/);
 assert.match(page,/data-climate-deep-dive/);
 for(const component of ['ClimateDashboard','AllYearsTemperature','YearComparison']){
  assert.match(page,new RegExp('<'+component+' \/>'));
 }
 assert.match(page,/location\.hash/);
 assert.match(page,/analysis\.open=true/);
 assert.match(nav,/data-climate-mobile-chapter/);
 assert.match(nav,/window\.location\.assign\(target\)/);
 assert.match(styles,/\.climate-mobile-chapters\{display:none\}/);
 assert.match(styles,/@media\(max-width:760px\)/);
});

test('public browser regression opens climate analysis and checks homepage navigation order',async()=>{
 const source=await read('scripts/preview-visual-check.mjs');
 assert.match(source,/\[data-climate-deep-dive\]/);
 assert.match(source,/expert charts must start collapsed/);
 assert.match(source,/mobile quick links or practical-information order regressed/);
 assert.match(source,/climatology API failed/);
});
