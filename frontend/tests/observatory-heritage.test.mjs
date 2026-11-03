import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {solarDay,lunarPhase,LOUCKA_VILLAGE} from '../src/shared/domain/astronomy.ts';

const file=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('sunrise and sunset reflect Loucka village location and the Czech winter clock',()=>{
 assert.equal(LOUCKA_VILLAGE.latitude,49.170035);
 const sun=solarDay('2026-11-03');
 assert.ok(sun,'solar day should exist');
 assert.ok(sun.sunrise<sun.noon&&sun.noon<sun.sunset);
 assert.ok(sun.dayLengthMinutes>500&&sun.dayLengthMinutes<650);
 const fmt=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',hour:'2-digit',minute:'2-digit'});
 const sunrise=fmt.format(sun.sunrise);
 const sunset=fmt.format(sun.sunset);
 assert.match(sunrise,/^(0[6-8]):[0-5][0-9]$/);
 assert.match(sunset,/^(1[5-7]):[0-5][0-9]$/);
});

test('astronomy handles seasonal daylight and invalid civil dates',()=>{
 const summer=solarDay('2026-06-21');
 const winter=solarDay('2026-12-21');
 assert.ok(summer&&winter&&summer.dayLengthMinutes>winter.dayLengthMinutes+400);
 assert.equal(solarDay('2026-02-30'),null);
 assert.equal(solarDay('not-a-date'),null);
 const phase=lunarPhase(new Date('2026-11-03T12:00:00Z'));
 assert.ok(Number.isFinite(phase.illuminated));
 assert.ok(phase.illuminated>=0&&phase.illuminated<=1);
 assert.ok(phase.name.length>1);
});

test('observatory uses live station components, never invented weather measurements',async()=>{
 const home=await file('src/pages/index.astro');
 for(const name of ['CurrentPanel','DailySummaryStrip','WindCompass','SolarCycle',
  'SameDayLastYear','HistoryChart','ForecastPanel','RadarPanel']){
  assert.match(home,new RegExp('<'+name+'\\b'));
 }
 assert.match(home,/observatory-instruments/);
 assert.match(home,/observatory-hero/);
 const wind=await file('src/features/current/WindCompass.astro');
 assert.match(wind,/getCurrent/);
 assert.match(wind,/loucka:live-observation/);
 assert.match(wind,/quality!=='measured'/);
});

test('astronomical values and historical comparison declare their limits',async()=>{
 const solar=await file('src/features/current/SolarCycle.astro');
 const history=await file('src/features/history/SameDayLastYear.astro');
 assert.match(solar,/Astronomický výpočet/);
 assert.match(solar,/nikoli naměřené hodnoty/);
 assert.match(solar,/data-solar-night|solarNight/);
 assert.match(history,/Před rokem ve stejný den/);
 assert.match(history,/getStatistics\('daily','outTemp','min'/);
 assert.match(history,/getStatistics\('daily','outTemp','max'/);
 assert.match(history,/coverage>=\.8/);
 assert.match(history,/minimálně 80 %/);
});

test('heritage timeline is clearly documented and not mistaken for a sensor audit',async()=>{
 const story=await file('src/features/history/StationTimeline.astro');
 const about=await file('src/pages/o-stanici.astro');
 assert.match(story,/2009/);
 assert.match(story,/2018/);
 assert.match(story,/2022/);
 assert.match(story,/2023/);
 assert.match(story,/2024/);
 assert.match(story,/pocasi-loucka\.eu\/about\//);
 assert.match(about,/<StationTimeline\s*\/>/);
 assert.match(about,/webcam\.pocasi-loucka\.eu/);
});