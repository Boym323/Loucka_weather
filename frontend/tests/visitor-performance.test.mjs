import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('dev smoke records passive anonymous navigation and API evidence',async()=>{
 const source=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.match(source,/performance\.getEntriesByType\('navigation'\)/);
 assert.match(source,/performance\.getEntriesByType\('paint'\)/);
 assert.match(source,/navigationDurationMs/);
 assert.match(source,/apiFetchP95Ms/);
 assert.match(source,/visitor-performance\.json/);
 assert.match(source,/noExtraRequests:true/);
 assert.match(source,/notFieldWebVitals:true/);
 assert.match(source,/incomplete:errors\.length>0/);
 assert.ok(source.indexOf('visitorPerformance.push')<source.indexOf('await page.screenshot('));
 assert.ok(source.indexOf('await writeFile(')>source.indexOf('finally{await browser.close();}'));
});

test('public camera retains source and freshness disclaimer after plain-language change',async()=>{
 const source=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.match(source,/sourceIdentified=layout\.sourceLabel\.includes/);
 assert.match(source,/freshnessCaution=/);
 assert.match(source,/snímek nemusí být právě pořízený/);
 assert.match(source,/čas pořízení snímku není ověřen/);
});

test('public dev climate regression guards batched API request budget',async()=>{
 const script=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.match(script,/climateDashboardFetchCount/);
 assert.match(script,/apiFetchCount>20/);
 assert.match(script,/climateDashboardFetchCount!==1/);
 assert.match(script,/api\/v1\/climate\/dashboard/);
});

test('homepage does not block DOMContentLoaded on the ECharts history engine',async()=>{
 const component=await readFile(new URL('../src/features/history/HistoryChart.astro',import.meta.url),'utf8');
 const engine=await readFile(new URL('../src/shared/charts/history-engine.ts',import.meta.url),'utf8');
 const smoke=await readFile(new URL('../scripts/preview-visual-check.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(component,/import \* as echarts from 'echarts\/core'/);
 assert.match(component,/document\.addEventListener\('DOMContentLoaded',start,\{once:true\}\)/);
 assert.match(component,/import\('\.\.\/\.\.\/shared\/charts\/history-engine'\)/);
 assert.match(component,/if\(departed\)return/);
 assert.match(engine,/echarts\.use\(\[LineChart,BarChart,GridComponent,TooltipComponent,DataZoomComponent,SVGRenderer\]\)/);
 assert.match(smoke,/deferred homepage history chart did not paint a real archive SVG/);
 assert.match(smoke,/\[data-chart-canvas\] svg/);
});
