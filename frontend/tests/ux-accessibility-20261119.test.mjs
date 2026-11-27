import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('narrow screens use bottom navigation without a competing second menu',async()=>{
 const css=await read('src/styles/ui-refinement.css');
 const dock=await read('src/shared/ui/MobileDock.astro');
 assert.match(css,/@media\(max-width:650px\)[\s\S]*?\.site-header \.mobile-nav\{display:none\}/);
 assert.match(dock,/class="mobile-dock"/);
 assert.match(dock,/class="atlas-mobile-more"/);
 for(const destination of ['/kamera/','/mapy/','/klimatologie/','/grafy/'])
  assert.ok(dock.includes(destination));
});

test('history table is lazy, keyboard accessible and uses real quality-labelled points',async()=>{
 const code=await read('src/features/history/AdvancedHistory.astro');
 const css=await read('src/styles/ui-refinement.css');
 assert.match(code,/data-advanced-table>/);
 assert.match(code,/data-advanced-table-body/);
 assert.match(code,/role="region" aria-label="Hodnoty historického grafu v tabulce" tabindex="0"/);
 assert.match(code,/tableDetails\?\.addEventListener\('toggle'/);
 assert.match(code,/if\(!tableBody\|\|!tableDetails\?\.open\)return/);
 assert.match(code,/const fragment=document\.createDocumentFragment\(\)/);
 assert.match(code,/if\(index===3\)cell\.dataset\.quality=point\.quality/);
 assert.match(code,/valid\(point\)\?formatMetricValue/);
 assert.match(code,/timeZone:'Europe\/Prague'/);
 assert.match(css,/\.history-table-alternative/);
});

test('MP4 poster is from a real same-day archive JPEG or is absent',async()=>{
 const archive=await read('src/features/camera/CameraArchive.astro');
 assert.match(archive,/data-archive-poster-note hidden/);
 assert.match(archive,/posterFrames=Array\.isArray\(data\.frames\)/);
 assert.match(archive,/localDay\(frame\.fetchedAt\)===day/);
 assert.match(archive,/const validFrame=\(frame:Frame\)/);
 assert.match(archive,/if\(match\)player\.poster=match\.url/);
 assert.match(archive,/else player\.removeAttribute\('poster'\)/);
 assert.match(archive,/preload="none" playsinline/);
 assert.match(archive,/Čas/);
});
