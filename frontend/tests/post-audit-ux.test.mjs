import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('practical mobile shortcuts are inside hero immediately after current readings',async()=>{
 const home=await read('src/pages/prehled-klasicky.astro');
 const css=await read('src/styles/ux-stages.css');
 const core=home.indexOf('<div class="atlas-hero-top evergreen-core">');
 const quick=home.indexOf('<nav class="evergreen-quick-access"');
 const daily=home.indexOf('<div class="atlas-hero-daily evergreen-daily">');
 assert.ok(core>=0&&quick>core&&daily>quick,'quick links follow current values before wind/chart');
 for(const anchor of ['pocasi-predpoved','pocasi-radar','pocasi-kamera']){
  assert.ok(home.includes('href="#'+anchor+'"'));
  assert.ok(home.includes('id="'+anchor+'"'));
 }
 assert.match(css,/grid-template-areas:"core" "quick" "daily" "wind" "chart"/);
 assert.match(css,/\.evergreen-hero \.evergreen-quick-access\{\s*grid-area:quick/);
});

test('mobile dock highlights Klima on subpages, not only the top-level landing',async()=>{
 const dock=await read('src/shared/ui/MobileDock.astro');
 assert.match(dock,/link\.href==='\/klimatologie\/'&&active\.startsWith\('\/klimatologie\/'\)/);
});

test('live data take priority over an independent archive refresh failure',async()=>{
 const source=await read('src/features/current/CurrentPanel.astro');
 const browser=await read('scripts/current-failover-race-browser-check.mjs');
 assert.match(source,/const liveStillFresh=liveDetails\?\.state==='live'/);
 assert.match(source,/if\(liveStillFresh&&lastLiveEvent\)applyLive\(lastLiveEvent\)/);
 assert.match(source,/else\{\s*section\.dataset\.currentState='error'/);
 assert.match(source,/archiveRetryCount>=3&&updated&&!liveStillFresh/);
 assert.match(browser,/CURRENT LIVE\/ARCHIVE FAILURE/);
 assert.match(browser,/status:503/);
 assert.match(browser,/loucka:live-expired/);
});

test('visual fixtures contain coherent current API data, not disconnected DOM numbers',async()=>{
 const source=await read('scripts/evergreen-layout-audit.mjs');
 assert.match(source,/await context\.route\('\*\*\/api\/v1\/current\*\*'/);
 assert.match(source,/dataRevision:'browser-layout-only'/);
 assert.match(source,/Syntetické hodnoty pouze pro vizuální test/);
 assert.match(source,/await labelSyntheticFixture\(\)/);
 assert.doesNotMatch(source,/const values=\{outTemp:'-18,9'/);
});

test('climate expert sections progressively disclose their data with safe deep links',async()=>{
 const page=await read('src/pages/klimatologie.astro');
 const css=await read('src/styles/ux-stages.css');
 for(const section of ['summary','temperatures','comparison'])
  assert.match(page,new RegExp('data-climate-subsection="'+section+'"'));
 assert.match(page,/while\(node&&node!==analysis\)/);
 assert.match(page,/node instanceof HTMLDetailsElement/);
 assert.match(css,/\.atlas-expert-section>summary/);
 const smoke=await read('scripts/year-comparison-browser-check.mjs');
 assert.match(smoke,/data-climate-subsection="temperatures"/);
 assert.match(smoke,/data-climate-subsection="comparison"/);
});

test('DEV Nginx already opts out of indexing; never copy noindex to production',async()=>{
 const conf=await read('../deploy/lxc/nginx-preview.conf');
 const layout=await read('src/layouts/BaseLayout.astro');
 assert.match(conf,/X-Robots-Tag "noindex, nofollow" always/);
 assert.doesNotMatch(layout,/<meta name="robots" content="noindex/);
});
