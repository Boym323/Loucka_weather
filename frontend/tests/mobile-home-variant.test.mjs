import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('compact mobile firstfold is explicitly opt-in and does not change weather values',async()=>{
 const home=await read('src/pages/index.astro');
 const css=await read('src/styles/ui-refinement.css');
 assert.match(home,/get\('mobile'\)==='compact'/);
 assert.match(home,/dataset\.mobileHomeVariant/);
 assert.match(home,/aria-controls="home-wind home-history" aria-expanded="false"/);
 assert.match(home,/Zpět na běžné zobrazení/);
 assert.match(home,/<CurrentPanel variant="observatory" \/>/);
 assert.match(home,/<WindCompass variant="hero" \/>/);
 assert.match(home,/<HistoryChart compact hero \/>/);
 assert.match(css,/:root\[data-mobile-home-variant="compact"\]/);
 assert.match(css,/grid-template-areas:"core" "quick" "daily" "expert"/);
 assert.match(css,/grid-template-areas:"core" "quick" "daily" "expert" "wind" "chart"/);
 assert.doesNotMatch(home,/localStorage\.setItem/);
});
