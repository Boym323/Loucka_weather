import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('visitor-facing sections lead with everyday weather language',async()=>{
 const home=await source('src/pages/index.astro');
 const current=await source('src/features/current/CurrentPanel.astro');
 const status=await source('src/pages/stav.astro');
 const history=await source('src/features/history/AdvancedHistory.astro');
 assert.match(home,/Teplota, vítr, déšť/);
 assert.doesNotMatch(current,/METRICWX/);
 assert.doesNotMatch(status,/Fastify API|CAP výstrahy|Archiv WeeWX/);
 assert.match(history,/Jak číst graf a odkud údaje pocházejí/);
 assert.match(history,/data-history-quality-summary/);
 assert.match(history,/Mezery znamenají chybějící nebo nejistá měření/);
});

test('technical deployment details remain available only on demand',async()=>{
 const layout=await source('src/layouts/BaseLayout.astro');
 const about=await source('src/pages/o-stanici.astro');
 const station=await source('src/features/current/StationSummary.astro');
 assert.doesNotMatch(layout,/<DeploymentInfo\s*\/>/);
 assert.match(about,/<details>[\s\S]*?<DeploymentInfo detailed \/>/);
 assert.match(station,/<summary>Technické vybavení stanice<\/summary>/);
});

test('plain-language copy still warns about gaps and uncertain records',async()=>{
 const chart=await source('src/features/history/HistoryChart.astro');
 const records=await source('src/pages/rekordy.astro');
 const sensor=await source('src/features/sensors/SensorChannels.astro');
 assert.match(chart,/Kde chybí měření, graf má mezeru/);
 assert.match(records,/Výsledky jsou orientační/);
 assert.match(records,/<summary>Jak rekordy počítáme\?<\/summary>/);
 assert.match(sensor,/Nula je skutečně naměřená hodnota/);
});

test('graph period labels match calendar-based requests and smoke accepts preliminary record status',async()=>{
 const history=await source('src/features/history/AdvancedHistory.astro');
 const smoke=await source('scripts/preview-visual-check.mjs');
 for(const label of ['Dnes','Včera','7 dní','30 dní','Letos','Minulý rok']){
  assert.ok(history.includes('>'+label+'</button>'),'Chybí rychlá volba '+label);
 }
 assert.match(history,/const shiftLocalDate=/);
 assert.match(history,/Date\.UTC\(/);
 assert.match(smoke,/classList\.contains\('warning'\)/);
 assert.match(smoke,/classList\.contains\('error'\)/);
 assert.doesNotMatch(smoke,/state\.includes\('(?:Původní data|Orientační rekordy)'\)/);
 assert.match(smoke,/temperature record value was not painted/);
});

test('climate atlas uses readable headlines while keeping source limitations on demand',async()=>{
 const soil=await source('src/pages/puda-ovzdusi.astro');
 const extremes=await source('src/pages/klimatologie/extremy.astro');
 const trend=await source('src/pages/klimatologie/trendy.astro');
 const season=await source('src/pages/klimatologie/sezony.astro');
 const yearbook=await source('src/pages/klimatologie/rocenka.astro');
 assert.match(soil,/Co právě měří čidla v půdě/);
 assert.match(soil,/<summary>Jak poznáme, odkud údaje pocházejí\?<\/summary>/);
 assert.match(extremes,/Tyto rekordy jsou zatím orientační/);
 assert.match(extremes,/červenci 2021 a únoru 2025/);
 assert.match(trend,/Orientační změna za 10 let/);
 assert.match(trend,/<summary>Jak odhad dlouhodobého vývoje počítáme\?<\/summary>/);
 assert.match(trend,/Theil–Sen/);
 assert.match(season,/<summary>Jak počítáme sezónní rozdíly\?<\/summary>/);
 assert.match(yearbook,/<summary>Podrobnosti o zdrojových datech<\/summary>/);
 assert.match(yearbook,/<summary>Odborné informace o metodice<\/summary>/);
 assert.match(yearbook,/data-yearbook-revision/);
});

test('expanded climate method notes have accessible 44px disclosure targets',async()=>{
 const css=await source('src/styles/climate-atlas.css');
 assert.match(css,/\.climate-atlas details\.source-note > summary/);
 assert.match(css,/\[data-soil-air\] details\.source-note > summary/);
 assert.match(css,/min-height:44px/);
});
