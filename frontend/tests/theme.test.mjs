import test from 'node:test';
import assert from 'node:assert/strict';
import {solarDay,pragueCivilDate} from '../src/shared/domain/astronomy.ts';
import {appearanceAt,storedThemePreference,nextThemeTransition} from '../src/shared/domain/theme.ts';

test('fresh visitors use astronomical automatic mode, existing stored choices survive',()=>{
 assert.equal(storedThemePreference(null),'auto');
 assert.equal(storedThemePreference('auto'),'auto');
 assert.equal(storedThemePreference('light'),'light');
 assert.equal(storedThemePreference('dark'),'dark');
 assert.equal(storedThemePreference('unknown'),'auto');
});

test('Loučka sunrise and sunset, rather than hard-coded hours or device timezone, govern automatic colors',()=>{
 for(const date of ['2026-01-15','2026-06-21','2026-11-07']){
  const sun=solarDay(date);
  assert.ok(sun,date);
  const sunrise=sun.sunrise.getTime(), sunset=sun.sunset.getTime();
  assert.equal(appearanceAt('auto',new Date(sunrise-1000)),'dark',date+' before sunrise');
  assert.equal(appearanceAt('auto',sun.sunrise),'light',date+' at sunrise');
  assert.equal(appearanceAt('auto',new Date((sunrise+sunset)/2)),'light',date+' midday');
  assert.equal(appearanceAt('auto',sun.sunset),'dark',date+' at sunset');
  assert.equal(appearanceAt('auto',new Date(sunset+1000)),'dark',date+' after sunset');
  assert.equal(appearanceAt('dark',sun.noon),'dark',date+' manual dark');
  assert.equal(appearanceAt('light',new Date(sunset+1000)),'light',date+' manual light');
 }
});

test('automatic mode schedules the next real sunrise or sunset and crosses midnight',()=>{
 const today=solarDay('2026-11-07');
 const tomorrow=solarDay('2026-11-08');
 assert.ok(today&&tomorrow);
 assert.equal(nextThemeTransition(new Date(today.sunrise.getTime()-1000))?.getTime(),
  today.sunrise.getTime());
 assert.equal(nextThemeTransition(today.noon)?.getTime(),today.sunset.getTime());
 assert.equal(nextThemeTransition(today.sunset)?.getTime(),tomorrow.sunrise.getTime());
});

test('Europe/Prague civil date is consistent around 2026 spring and autumn DST',()=>{
 assert.equal(pragueCivilDate(new Date('2026-03-28T23:30:00Z')),'2026-03-29');
 assert.equal(pragueCivilDate(new Date('2026-03-29T01:30:00Z')),'2026-03-29');
 assert.equal(pragueCivilDate(new Date('2026-10-24T22:30:00Z')),'2026-10-25');
 assert.equal(pragueCivilDate(new Date('2026-10-25T01:30:00Z')),'2026-10-25');
 assert.equal(pragueCivilDate(new Date('2026-10-25T23:30:00Z')),'2026-10-26');
});
