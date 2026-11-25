import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('mobile alert shortcut uses verified warning state and a single full warning panel',async()=>{
 const home=await read('src/pages/index.astro'),alerts=await read('src/features/alerts/LocalWarnings.astro');
 assert.ok(home.indexOf('data-mobile-alert-shortcut')<home.indexOf('data-home-hero data-expert-open'));
 assert.equal((home.match(/<LocalWarnings compact \/>/g)||[]).length,1);
 assert.match(alerts,/hideShortcut\(\)/);
 assert.match(alerts,/showShortcut\('Stav výstrah ČHMÚ nelze ověřit'/);
 assert.match(alerts,/shortcutLabel\.textContent=label/);
});
test('comparison uses distinct series and camera uses design token',async()=>{
 const season=await read('src/pages/klimatologie/sezony.astro');
 const css=await read('src/styles/climate-atlas.css');
 const camera=await read('src/pages/kamera.astro');
 assert.match(season,/stroke-dasharray/);
 assert.match(css,/--season-secondary:#4267a8/);
 assert.doesNotMatch(camera,/background:#43e6ab/);
});
