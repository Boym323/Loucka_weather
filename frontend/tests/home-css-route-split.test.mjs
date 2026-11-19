import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('homepage-exclusive evergreen CSS is not imported in shared layout',async()=>{
 const home=await read('src/pages/index.astro');
 const layout=await read('src/layouts/BaseLayout.astro');
 const css=await read('src/styles/observatory-evergreen.css');
 assert.match(home,/import '\.\.\/styles\/observatory-evergreen\.css'/);
 assert.doesNotMatch(layout,/import '\.\.\/styles\/observatory-evergreen\.css'/);
 assert.match(css,/\.evergreen-home\s*\{/);
 assert.match(css,/\.evergreen-scene\s*\{/);
 assert.match(home,/class="atlas-home evergreen-home"/);
});
