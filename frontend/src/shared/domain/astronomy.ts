/**
 * Astronomical presentation calculations, NOT meteorological observations.
 * Loučka (Zlín district) approximate village centre: 49.170035N, 17.876076E.
 * Solar time estimate uses the NOAA fractional-year equations and a
 * geometric 90.833° zenith. Atmospheric conditions and terrain can shift
 * the observed sun horizon; avoid claiming instrument accuracy.
 * https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
export const LOUCKA_VILLAGE={latitude:49.170035,longitude:17.876076} as const;
const radians=(v:number)=>v*Math.PI/180;
const degrees=(v:number)=>v*180/Math.PI;
const round=(v:number)=>Math.round(v);
export interface SolarDay {
 sunrise:Date;
 sunset:Date;
 noon:Date;
 dayLengthMinutes:number;
}
export function solarDay(civilDate:string,latitude=LOUCKA_VILLAGE.latitude,longitude=LOUCKA_VILLAGE.longitude):SolarDay|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(civilDate))return null;
 const [y,m,d]=civilDate.split('-').map(Number);
 const atMidnight=Date.UTC(y,m-1,d);
 if(new Date(atMidnight).toISOString().slice(0,10)!==civilDate)return null;
 const day=Math.floor((atMidnight-Date.UTC(y,0,1))/86400000)+1;
 // The fractional-year approximation is evaluated around local solar noon.
 const gamma=2*Math.PI/365*(day-1);
 const equation=229.18*(.000075+.001868*Math.cos(gamma)-.032077*Math.sin(gamma)
  -.014615*Math.cos(2*gamma)-.040849*Math.sin(2*gamma));
 const decl=.006918-.399912*Math.cos(gamma)+.070257*Math.sin(gamma)
  -.006758*Math.cos(2*gamma)+.000907*Math.sin(2*gamma)
  -.002697*Math.cos(3*gamma)+.00148*Math.sin(3*gamma);
 const lat=radians(latitude);
 const cosHour=(Math.cos(radians(90.833))-Math.sin(lat)*Math.sin(decl))/
  (Math.cos(lat)*Math.cos(decl));
 if(!Number.isFinite(cosHour)||cosHour>1||cosHour< -1)return null;
 const hour=degrees(Math.acos(Math.max(-1,Math.min(1,cosHour))));
 const noonMinute=720-4*longitude-equation;
 const beginMinute=noonMinute-4*hour;
 const endMinute=noonMinute+4*hour;
 return {sunrise:new Date(atMidnight+round(beginMinute*60000)),
  sunset:new Date(atMidnight+round(endMinute*60000)),
  noon:new Date(atMidnight+round(noonMinute*60000)),
  dayLengthMinutes:round(endMinute-beginMinute)};
}

/** Approximate lunar illumination fraction, not an ephemeris for moonrise. */
export function lunarPhase(at:Date):{illuminated:number;name:string}{
 const synodic=29.530588853;
 const reference=Date.parse('2000-01-06T18:14:00Z'); // approximate new Moon
 const phase=(((at.getTime()-reference)/86400000/synodic)%1)+1)%1;
 const illuminated=(1-Math.cos(phase*2*Math.PI))/2;
 const name=phase<.04||phase>=.96?'Nov':
  phase<.21?'Dorůstající srpek':phase<.29?'První čtvrť':
  phase<.46?'Dorůstající Měsíc':phase<.54?'Úplněk':
  phase<.71?'Couvající Měsíc':phase<.79?'Poslední čtvrť':
  'Ubývající srpek';
 return {illuminated,name};
}
