import {pragueCivilDate, solarDay} from './astronomy.ts';

export type ThemePreference='auto'|'light'|'dark';
export type ThemeAppearance='light'|'dark';

/** Preserve existing user choices. Fresh visitors follow the Sun in Loučka. */
export function storedThemePreference(value:string|null):ThemePreference {
 return value==='light'||value==='dark'?value:'auto';
}

/** Automatic appearance follows astronomical sunrise/sunset for Loučka, never device timezone. */
export function appearanceAt(preference:ThemePreference,now:Date):ThemeAppearance {
 if(preference!=='auto')return preference;
 const day=solarDay(pragueCivilDate(now));
 if(!day)return 'light'; // Defensive fallback, not a claim about the station.
 return now>=day.sunrise&&now<day.sunset?'light':'dark';
}

/** First upcoming astronomical crossing, including next-day sunrise after sunset. */
export function nextThemeTransition(now:Date):Date|null {
 const [year,month,day]=pragueCivilDate(now).split('-').map(Number);
 const crossings:Date[]=[];
 for(let offset=0;offset<=2;offset++){
  const date=new Date(Date.UTC(year,month-1,day+offset)).toISOString().slice(0,10);
  const solar=solarDay(date);
  if(solar)for(const time of [solar.sunrise,solar.sunset])if(time>now)crossings.push(time);
 }
 return crossings.sort((a,b)=>a.getTime()-b.getTime())[0]??null;
}
