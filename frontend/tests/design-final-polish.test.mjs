import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const get=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('final design preserves existing two themes and the opt-in compact mobile variant',async()=>{
 const css=await get('src/styles/ui-refinement.css');
 const home=await get('src/pages/index.astro');
 assert.match(css,/--ui-reading-line:1\.55/);
 assert.match(css,/--ui-touch-target:44px/);
 assert.match(css,/\.page-intro h1\s*\{/);
 assert.match(css,/\.page-intro p\s*\{/);
 assert.match(css,/\.evergreen-hero \.current-panel \.metric-card \.metric-note/);
 assert.match(css,/:is\(a,button,input,select,textarea,summary,\[tabindex\]\):focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(home,/new URLSearchParams\(location.search\)\.get\('mobile'\)==='compact'/);
 assert.match(home,/snímek nemusí být právě pořízený/);
 assert.doesNotMatch(css,/--fake-weather/);
});

test('browser design QA runs as a real CI gate at 320/390/1440 light/dark',async()=>{
 const workflow=await get('../.github/workflows/frontend-staging.yml');
 const script=await get('scripts/design-final-browser-check.mjs');
 assert.match(workflow,/node scripts\/design-final-browser-check\.mjs/);
 assert.match(script,/const widths=\[320,390,768,1024,1328,1440,1920\]/);
 assert.match(script,/desktop must put all four instruments in one balanced row/);
 assert.match(script,/tablet must use balanced two-by-two cards/);
 assert.match(script,/const themes=\['light','dark'\]/);
 assert.match(script,/scrollWidth<=width\+2/);
 assert.match(script,/style\.fontSize='200%'/);
 assert.match(script,/\.camera-view-navigation/);
 assert.match(script,/fullPage:width===1328/);
});

test('desktop observatory grid cancels old Atlas historical full-row spanning',async()=>{
 const css=await get('src/styles/observatory-evergreen.css');
 const atlas=await get('src/styles/atlas-minimal.css');
 assert.match(atlas,/@media\(min-width:761px\) and \(max-width:1330px\)/);
 assert.match(atlas,/\.observatory-history\{grid-column:1\/-1\}/);
 assert.match(css,/\.evergreen-home \.observatory-instruments\.evergreen-spotlight > \.observatory-history\{\s*grid-column:auto;/);
 const home=await get('src/pages/index.astro');
 assert.match(home,/<SolarCycle \/>/);
 assert.match(home,/<SameDayLastYear \/>/);
 assert.match(home,/<StationSummary \/>/);
});
