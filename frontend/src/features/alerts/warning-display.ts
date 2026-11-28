export type LocalAlert={event:string;severity:string;onset:string;expires:string;headline:string;description:string;instruction:string};

const formatter=new Intl.DateTimeFormat('cs-CZ',{timeZone:'Europe/Prague',day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function warningDate(value:string){
 const timestamp=Date.parse(value);
 return Number.isFinite(timestamp)?formatter.format(timestamp):'čas neuveden';
}
export function warningState(alert:LocalAlert,now:number){
 const start=Date.parse(alert.onset),end=Date.parse(alert.expires);
 if(Number.isFinite(end)&&end<=now)return 'expired';
 if(Number.isFinite(start)&&start>now)return 'upcoming';
 if(Number.isFinite(start)&&Number.isFinite(end))return 'active';
 return 'unknown';
}
export function severityDisplay(value:string){
 switch(value.toLowerCase()){
  case 'extreme':return {label:'Extrémní stupeň nebezpečí',level:'extreme'};
  case 'severe':return {label:'Vysoký stupeň nebezpečí',level:'severe'};
  case 'moderate':return {label:'Nízký stupeň nebezpečí',level:'moderate'};
  case 'minor':return {label:'Nízká závažnost',level:'minor'};
  default:return {label:'Stupeň nebezpečí neuveden',level:'unknown'};
 }
}
export function warningCount(count:number){
 return count===1?'1 výstraha':count>=2&&count<=4?count+' výstrahy':count+' výstrah';
}
export function warningSummary(text:string){
 // An excerpt, never an invented forecast or instruction. Keep the complete text available.
 const trimmed=text.trim();
 const first=trimmed.match(/^.*?[.!?](?=\s+[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]|$)/s)?.[0];
 return first||trimmed;
}
