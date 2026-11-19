import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('historical zoom has labelled native buttons initially disabled',async()=>{
 const code=await read('src/features/history/AdvancedHistory.astro');
 assert.match(code,/role="group" aria-label="Přiblížení časové osy grafu"/);
 for(const action of ['in','out','reset'])
  assert.match(code,new RegExp('type="button" class="chart-tab" data-history-zoom="'+action+'" disabled'));
 assert.match(code,/data-history-zoom-status role="status"/);
 assert.match(code,/chart\.on\('datazoom',updateZoomStatus\)/);
});

test('zoom dispatches ECharts action without changing or re-fetching history',async()=>{
 const code=await read('src/features/history/AdvancedHistory.astro');
 assert.match(code,/chart\.dispatchAction\(\{type:'dataZoom',start:nextStart,end:nextStart\+nextWidth\}\)/);
 assert.match(code,/setZoomEnabled\(false\)/);
 assert.match(code,/setZoomEnabled\(total>1\)/);
 assert.match(code,/width\/2/);
 assert.match(code,/width\*2/);
 const browser=await read('scripts/ux-media-history-browser-check.mjs');
 assert.match(browser,/await page\.keyboard\.press\('Enter'\)/);
 assert.match(browser,/await page\.keyboard\.press\('Space'\)/);
 assert.match(browser,/Keyboard zoom must not refetch history/);
});
