import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('visitor sees atlas chapter choices before historical records',async()=>{
 const page=await read('src/pages/klimatologie.astro');
 const chapter=page.indexOf('class="climate-atlas-grid"');
 const highlights=page.indexOf('<ClimateHighlights />');
 assert.ok(chapter>0&&highlights>chapter);
 assert.match(page,/<h2 id="atlas-chapters-title">Vyber si kapitolu<\/h2>/);
 assert.match(page,/aria-labelledby="atlas-chapters-title"/);
 assert.equal((page.match(/class="climate-atlas-card"/g)||[]).length,4);
 for(const h3 of ['Extrémy','Trendy','Srovnání sezón','Meteorologická ročenka'])
  assert.ok(page.includes('<h3>'+h3+'</h3>'));
 assert.match(page,/Starší měření nejsou vždy úplná/);
});

test('failed record API becomes a single honest retryable message',async()=>{
 const source=await read('src/features/climate/ClimateHighlights.astro');
 const styles=await read('src/styles/ui-refinement.css');
 assert.match(source,/data-highlights-fallback role="status" hidden/);
 assert.match(source,/data-highlights-retry/);
 assert.match(source,/retry\?\.addEventListener\('click',\(\)=>void load\(true\)\)/);
 assert.match(source,/if\(grid\)grid\.hidden=true/);
 assert.match(source,/if\(fallback\)fallback\.hidden=false/);
 assert.match(source,/Známé omezení srážkového záznamu/);
 assert.match(styles,/\.atlas-highlights-grid\[hidden\]\{display:none!important\}/);
});

test('atlas cards remain readable in all themes, responsive, and keyboard navigable',async()=>{
 const styles=await read('src/styles/ui-refinement.css');
 assert.match(styles,/\.climate-atlas \.atlas-chapter-heading/);
 assert.match(styles,/\.climate-atlas \.climate-atlas-card h3/);
 assert.match(styles,/\.climate-atlas \.climate-atlas-card:focus-visible/);
 assert.match(styles,/\.climate-atlas \.climate-atlas-card p\{\s*max-width:/);
 assert.match(styles,/@media\(max-width:760px\)/);
 assert.match(styles,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(styles,/var\(--panel\)/);
 assert.match(styles,/var\(--line\)/);
});
