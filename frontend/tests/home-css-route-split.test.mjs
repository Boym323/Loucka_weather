import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('homepage-exclusive evergreen CSS is not imported in shared layout',async()=>{
 const home=await read('src/pages/prehled-klasicky.astro');
 const layout=await read('src/layouts/BaseLayout.astro');
 const css=await read('src/styles/observatory-evergreen.css');
 assert.match(home,/import '\.\.\/styles\/observatory-evergreen\.css'/);
 assert.doesNotMatch(layout,/import '\.\.\/styles\/observatory-evergreen\.css'/);
 assert.match(css,/\.evergreen-home\s*\{/);
 assert.match(css,/\.evergreen-scene\s*\{/);
 assert.match(home,/class="atlas-home evergreen-home"/);
});

test('wind compass CSS belongs to the component, not the shared layout',async()=>{
 const layout=await read('src/layouts/BaseLayout.astro');
 const wind=await read('src/features/current/WindCompass.astro');
 const css=await read('src/styles/wind-compass-v2.css');
 assert.doesNotMatch(layout,/import .*wind-compass-v2\.css/);
 assert.match(wind,/import '\.\.\/\.\.\/styles\/wind-compass-v2\.css'/);
 assert.match(css,/--wind-v2-ink:/);
});

test('history table styles belong to the advanced history component',async()=>{
 const layout=await read('src/layouts/BaseLayout.astro');
 const global=await read('src/styles/ui-refinement.css');
 const component=await read('src/features/history/AdvancedHistory.astro');
 const css=await read('src/styles/history-table.css');
 assert.doesNotMatch(layout,/history-table\.css/);
 assert.doesNotMatch(global,/^\.history-table-alternative\s*\{/m);
 assert.match(component,/import '\.\.\/\.\.\/styles\/history-table\.css'/);
 assert.match(css,/\.history-table-alternative\s*\{/);
 assert.match(css,/\.history-table-alternative \.history-table\{min-width:520px\}/);
});

test('camera archive refinements are imported only by their component',async()=>{
 const layout=await read('src/layouts/BaseLayout.astro');
 const global=await read('src/styles/ui-refinement.css');
 const component=await read('src/features/camera/CameraArchive.astro');
 const css=await read('src/styles/camera-archive.css');
 assert.doesNotMatch(layout,/camera-archive\.css/);
 assert.doesNotMatch(global,/\.camera-archive-views\s*\{/);
 assert.match(component,/import '\.\.\/\.\.\/styles\/camera-archive\.css'/);
 assert.match(css,/\.camera-archive-views\{display:grid;gap:19px\}/);
 assert.match(css,/\.camera-photos-hint\{display:none\}/);
});
