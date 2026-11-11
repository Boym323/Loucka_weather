/** Read-only secondary triage of complete RH 2022 QC evidence. No reconstructed RH. */
import {dateRange,validateRhDay,RH_STATIONS,RH_VERSION} from './qc-humidity-lib.mjs';
const round=n=>n===null?null:Math.round(n*1000)/1000;
const ratio=(a,b)=>b>0?round(a/b):null;
const weighted=(list,extract)=>{
  let sum=0,weight=0;
  for(const v of list){
    const [n,w]=extract(v);
    if(w>0&&typeof n==='number'&&Number.isFinite(n)){
      sum+=n*w;weight+=w;
    }
  }
  return {pairs:weight,mean:weight?round(sum/weight):null};
};
function classify(day){
  const c=day.counts;
  if(c.originalRhNullSlots===0)return 'bez_null_rh';
  if(c.originalRhNullSlots<24)return 'kratky_vypadek';
  const both=ratio(c.missingRhBothReferenceSlots,c.originalRhNullSlots);
  const agree=ratio(c.missingRhTwoRefsAgreeSlots,c.missingRhBothReferenceSlots);
  const mae=day.betweenReferences.maePctPoints;
  if(c.missingRhBothReferenceSlots>=96&&
     ((agree!==null&&agree<0.65)||(mae!==null&&mae>10)))
    return 'rozpor_referenci';
  if(c.originalRhNullSlots>=144&&both>=0.9&&agree>=0.9&&
     day.betweenReferences.matchedSlots>=144&&mae!==null&&mae<=4)
    return 'shodne_reference_neoverena_kalibrace';
  if(both===null||both<0.5)return 'nedostatecne_reference';
  return 'smisene_podklady';
}
const sortRows=rows=>rows.sort((a,b)=>{
  const rank={rozpor_referenci:0,shodne_reference_neoverena_kalibrace:1,
    nedostatecne_reference:2,smisene_podklady:3,kratky_vypadek:4,bez_null_rh:5};
  return rank[a.evidenceCategory]-rank[b.evidenceCategory]||
    b.rhNullSlots-a.rhNullSlots||a.day.localeCompare(b.day);
});
export function createRhTriage(reports){
  const days=dateRange();
  if(!Array.isArray(reports)||reports.length!==days.length)
    throw new Error('Full RH 2022 daily evidence required before triage');
  const daily=new Map();
  for(const r of reports){
    const day=r?.utcDay;
    if(!days.includes(day)||daily.has(day))throw new Error('Duplicate or invalid RH day');
    daily.set(day,validateRhDay(r,day));
  }
  if(daily.size!==365)throw new Error('Incomplete RH year');
  const rows=days.map(day=>{
    const r=daily.get(day),c=r.counts;
    if(!r)throw new Error('Missing RH evidence day');
    const allOwn=r.references;
    const own={}
    for(const station of RH_STATIONS){
      const val=allOwn[station]?.againstOriginal;
      if(!val||!Number.isSafeInteger(val.matchedSlots))
        throw new Error('Missing RH reference comparison');
      own[station]={matchedSlots:val.matchedSlots,
        maePctPoints:val.maePctPoints,biasOwnMinusRefPctPoints:val.meanBiasPctPoints};
    }
    if(c.missingRhTwoRefsAgreeSlots>c.missingRhBothReferenceSlots||
       c.missingRhBothReferenceSlots>c.originalRhNullSlots||
       c.missingRhBothReferenceSlots+c.missingRhSingleReferenceSlots+
       c.missingRhNoReferenceSlots!==c.originalRhNullSlots)
      throw new Error('Invalid RH null-evidence decomposition');
    const category=classify(r);
    return {day,month:day.slice(0,7),rhNullSlots:c.originalRhNullSlots,
      originalAbsentSlots:c.originalAbsentSlots,
      rhMeasuredSlots:c.originalRhMeasuredSlots,
      refBothSlots:c.missingRhBothReferenceSlots,
      refAgreeWithin10Slots:c.missingRhTwoRefsAgreeSlots,
      referenceCoverageRatio:ratio(c.missingRhBothReferenceSlots,c.originalRhNullSlots),
      referenceAgreementRatio:ratio(c.missingRhTwoRefsAgreeSlots,c.missingRhBothReferenceSlots),
      refRefPairs:r.betweenReferences.matchedSlots,
      refRefMaePctPoints:r.betweenReferences.maePctPoints,
      refRefBiasLuhaMinusWuPctPoints:r.betweenReferences.meanBiasPctPoints,
      own, evidenceCategory:category,
      reviewState:'needs_manual_review',automaticWriteAllowed:false,
      replacementRhPct:null};
  });
  const months=[];
  for(let m=1;m<=12;m++){
    const id='2022-'+String(m).padStart(2,'0');
    const list=rows.filter(r=>r.month===id),total=k=>list.reduce((s,r)=>s+r[k],0);
    const between=weighted(list,r=>[r.refRefMaePctPoints,r.refRefPairs]);
    const own={}
    for(const st of RH_STATIONS){
      const mae=weighted(list,r=>[r.own[st].maePctPoints,r.own[st].matchedSlots]);
      const bias=weighted(list,r=>[r.own[st].biasOwnMinusRefPctPoints,r.own[st].matchedSlots]);
      own[st]={pairedSlots:mae.pairs,maePctPoints:mae.mean,
        biasOwnMinusRefPctPoints:bias.mean};
    }
    const n=total('rhNullSlots'),b=total('refBothSlots'),a=total('refAgreeWithin10Slots');
    months.push({month:id,days:list.length,rhNullSlots:n,
      rhMeasuredSlots:total('rhMeasuredSlots'),
      originalAbsentSlots:total('originalAbsentSlots'),
      bothReferenceSlots:b,agreeWithin10Slots:a,
      agreementRateOfBoth:ratio(a,b),
      referenceCoverageRateOfNull:ratio(b,n),
      referenceReferencePairedSlots:between.pairs,
      referenceReferenceWeightedMaePctPoints:between.mean,
      againstOriginal:own,
      categoryDays:Object.fromEntries([...new Set(rows.map(x=>x.evidenceCategory))].map(k=>[
        k,list.filter(r=>r.evidenceCategory===k).length]))});
  }
  const total=k=>rows.reduce((s,r)=>s+r[k],0),nullSlots=total('rhNullSlots'),
    pairedSlots=total('refBothSlots'),agreeSlots=total('refAgreeWithin10Slots');
  return {schemaVersion:'1',qcVersion:RH_VERSION,status:'screening_only',
    source:'365_verified_private_daily_json',
    period:{fromUtc:'2022-01-01T00:00:00Z',toExclusiveUtc:'2023-01-01T00:00:00Z'},
    processedDays:365,
    totals:{nullRhSlots:nullSlots,originalAbsentSlots:total('originalAbsentSlots'),
      rhMeasuredSlots:total('rhMeasuredSlots'),bothReferenceSlots:pairedSlots,
      agreeWithin10Slots:agreeSlots,referenceAgreementAmongBoth:ratio(agreeSlots,pairedSlots),
      agreementAmongAllNull:ratio(agreeSlots,nullSlots),
      conflictingBothReferenceSlots:pairedSlots-agreeSlots},
    months,days:sortRows(rows),
    methodology:[
      'Review categories reflect relative agreement and availability, not proof of source calibration or suitability for reconstruction.',
      'The 10 percentage-point comparison is a preliminary screening threshold, not a tolerance for approved humidity replacements.',
      'Weighted monthly MAE averages daily absolute differences using the number of paired slots; rounded daily inputs can produce small differences from raw precision.',
      'Monthly Loucka-reference MAE uses ONLY original non-NULL humidity pairs, so zero pairs means calibration cannot be assessed.',
      'A missing original archive slot is never treated as existing NULL RH. Missing whole slots require separate reconstruction review.',
      'No original RH value is generated, approved or written.'
    ],
    safety:{databaseWrites:0,automaticApprovals:false,automaticCorrections:false}};
}
export function triageCsv(report){
  const columns=['day','evidenceCategory','rhNullSlots','originalAbsentSlots',
    'rhMeasuredSlots','refBothSlots','refAgreeWithin10Slots','referenceCoverageRatio',
    'referenceAgreementRatio','refRefPairs','refRefMaePctPoints',
    'refRefBiasLuhaMinusWuPctPoints','luhaOwnPairs','luhaOwnMae','luhaOwnBias',
    'wuOwnPairs','wuOwnMae','wuOwnBias','reviewState','automaticWriteAllowed',
    'replacementRhPct'];
  const render=item=>{
    const a=item.own.luhamet_sehradice,b=item.own.wu_ilouka4;
    return [item.day,item.evidenceCategory,item.rhNullSlots,item.originalAbsentSlots,
      item.rhMeasuredSlots,item.refBothSlots,item.refAgreeWithin10Slots,
      item.referenceCoverageRatio,item.referenceAgreementRatio,item.refRefPairs,
      item.refRefMaePctPoints,item.refRefBiasLuhaMinusWuPctPoints,
      a.matchedSlots,a.maePctPoints,a.biasOwnMinusRefPctPoints,
      b.matchedSlots,b.maePctPoints,b.biasOwnMinusRefPctPoints,
      item.reviewState,item.automaticWriteAllowed,item.replacementRhPct]
      .map(v=>v===null?'':String(v));
  };
  return '\uFEFF'+columns.join(',')+'\r\n'+report.days.map(r=>render(r).join(',')).join('\r\n')+'\r\n';
}
