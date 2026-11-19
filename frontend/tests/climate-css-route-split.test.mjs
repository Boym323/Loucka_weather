import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
const atlasPages=[
 'src/pages/klimatologie.astro',
 'src/pages/klimatologie/extremy.astro',
 'src/pages/klimatologie/rocenka.astro',
 'src/pages/klimatologie/sezony.astro',
 'src/pages/klimatologie/trendy.astro'
];

test('climate stylesheet loads on climate pages, not every route',async()=>{
 const layout=await get('src/layouts/BaseLayout.astro');
 const css=await get('src/styles/climate-atlas.css');
 assert.doesNotMatch(layout,/import ['"]\.\.\/styles\/climate-atlas\.css['"]/);
 for(const path of atlasPages){
  const page=await get(path);
  assert.match(page,/import ['"]\.\.\/(?:\.\.\/)?styles\/climate-atlas\.css['"]/);
  assert.match(page,/class="climate-atlas"/);
 }
 assert.match(css,/\.climate-atlas\s*\{/);
});

test('generic print behavior remains available across pages',async()=>{
 const a11y=await get('src/styles/accessibility.css');
 assert.match(a11y,/@media print\s*\{/);
 assert.match(a11y,/\.site-header,\.site-footer,\.mobile-dock,\.skip-link\{display:none!important\}/);
 assert.match(a11y,/html,body,\.content,\.wrap\s*\{/);
});
