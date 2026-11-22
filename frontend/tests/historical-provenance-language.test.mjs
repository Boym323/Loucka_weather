import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';

// Hermetic content regression: the public site must never imply that the
// original imported daily data have passed forensic QC.
const load=(name)=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');

test('station history identifies Cumulus as the 2009 WEB software, not a certified original DB logger',()=>{
 const text=load('features/history/StationTimeline.astro');
 assert.match(text,/Web už v roce 2009 používal Cumulus 1\.8\.7/);
 assert.match(text,/web\.archive\.org\/web\/20090830152549\/pomykal\.eu\/pocasi/);
 assert.match(text,/nikoli přesné datum přechodu na WeeWX/);
});

test('about and climate pages do not imply all 2009+ measurements were originally recorded by WeeWX',()=>{
 const about=load('pages/o-stanici.astro');
 const climate=load('pages/klimatologie.astro');
 assert.match(about,/Tehdejší web běžel na Cumulusu/);
 assert.match(climate,/Nejstarší data mohla být převzata ze systému Cumulus/);
 assert.match(climate,/Rekordy jsou proto zatím orientační/);
 assert.match(climate,/Chybějící hodnoty nenahrazujeme nulami/);
});

test('preliminary climatological summaries must not be described as confirmed',()=>{
 const records=load('pages/rekordy.astro');
 assert.doesNotMatch(records,/potvrzené denní souhrny/);
 assert.doesNotMatch(records,/Počet dní s důvěryhodným zdrojem/);
 assert.match(records,/dostupné denní souhrny/);
 assert.match(records,/dostupnými archivními údaji/);
});
