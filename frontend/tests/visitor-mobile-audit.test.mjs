import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('15 public routes are audited at narrow mobile, standard phone and desktop in both themes',async()=>{
 const script=await get('scripts/accessibility-audit.mjs');
 const routes=script.match(/const routes = \[([\s\S]*?)\];/)?.[1];
 assert.equal((routes?.match(/'\/[^']*\/'/g)||[]).length,15);
 assert.match(script,/name: 'mobil-uzky', width: 320/);
 assert.match(script,/name: 'mobil', width: 390/);
 assert.match(script,/name: 'desktop', width: 1440/);
 assert.match(script,/for \(const theme of \['light', 'dark'\]\)/);
 assert.match(script,/viewport\.width <= 390/);
});
test('live browser smoke recognizes visitor language without weakening source checks',async()=>{
 const smoke=await get('scripts/live-browser-check.mjs');
 assert.match(smoke,/hasLiveStatus/);
 assert.match(smoke,/Živá měření/);
 assert.match(smoke,/Poslední měření/);
 assert.match(smoke,/Část údajů přichází živě/);
 assert.match(smoke,/gw3000_live/);
 assert.match(smoke,/live-expired/);
 assert.match(smoke,/stale event displaced a fresh live reading/);
 assert.match(smoke,/fake gateway interval rain displayed/);
 assert.match(smoke,/BROWSER FAILOVER PASS/);
});
test('meteorological live event listeners are released on navigation',async()=>{
 const current=await get('src/features/current/CurrentPanel.astro');
 const sync=await get('src/shared/ui/LiveSync.astro');
 assert.match(current,/const archiveUpdated=/);
 assert.match(current,/addEventListener\('loucka:archive-updated',archiveUpdated\)/);
 assert.match(current,/removeEventListener\('loucka:archive-updated',archiveUpdated\)/);
 assert.match(sync,/if\(controller\.signal\.aborted\)return;/);
});
test('climate dashboard does not start the expensive annual fanout before visibility',async()=>{
 const climate=await get('src/features/climate/ClimateDashboard.astro');
 const publicSmoke=await get('scripts/preview-visual-check.mjs');
 assert.match(climate,/const visibility=new IntersectionObserver/);
 assert.match(climate,/visibility\.observe\(root\)/);
 assert.match(climate,/if\(entries\.some\(entry=>entry\.isIntersecting\)\)/);
 assert.match(climate,/visibility\.disconnect\(\);start\(\)/);
 assert.match(climate,/started=true;visibility\.disconnect\(\);void refresh\(\)/);
 assert.doesNotMatch(climate,/\n\s*void refresh\(\);\s*\n \}/);
 assert.match(publicSmoke,/\[data-climate-dashboard\]'\)\.scrollIntoViewIfNeeded/);
});
test('record timeline buttons meet 44px mobile touch minimum',async()=>{
 const css=await get('src/styles/climate-atlas.css');
 assert.match(css,/\.climate-atlas \.atlas-rank-action\{[\s\S]*?min-height:44px/);
});
