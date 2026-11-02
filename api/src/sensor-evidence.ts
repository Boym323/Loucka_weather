/** Measured channel *evidence*, never an assertion of sensor installation.
 * Live Ecowitt ids are not the same as historical WeeWX physical provenance.
 */
export const sensorChannels=[
 {metric:'soilMoist1',title:'Vlhkost půdy · archivní kanál 1',
  liveKey:'soilMoisture1',liveRelation:'unverified',hint:'GW3000: ch_soil channel 1, štítek Půda zahrada; shoda s historickou sondou nebyla doložena.'},
 {metric:'soilTemp1',title:'Teplota půdy · archivní kanál 1',
  liveKey:null,liveRelation:'none',hint:'Hloubka, fyzická poloha a totožnost sondy neověřeny.'},
 {metric:'soilTemp2',title:'Teplota půdy · archivní kanál 2',
  liveKey:null,liveRelation:'none',hint:'V pozdním říjnu 2026 nemá pracovní rekonstrukce platné hodnoty tohoto kanálu.'},
 {metric:'soilTemp3',title:'Teplota půdy · archivní kanál 3',
  liveKey:null,liveRelation:'none',hint:'Historický sloupec, skutečná instalace a hloubka neověřeny.'},
 {metric:'soilTemp4',title:'Teplota půdy · archivní kanál 4',
  liveKey:null,liveRelation:'none',hint:'Historický sloupec, skutečná instalace a hloubka neověřeny.'},
 {metric:'pm25_1',title:'PM2,5 · archivní kanál 1',
  liveKey:'pm25_1',liveRelation:'unverified',hint:'GW3000: ch_pm25 channel 1. Historie obsahuje saturace v září–říjnu 2024; surové extrémy bez QC nejsou automaticky důvěryhodné.'},
 {metric:'radiation',title:'Sluneční záření',
  liveKey:'radiation',liveRelation:'unverified',hint:'První historické hodnoty pracovní DB od 27. 8. 2022, montáž čidla se z toho nedokazuje.'},
 {metric:'UV',title:'UV index',
  liveKey:'UV',liveRelation:'unverified',hint:'Před potvrzenou měřicí epochou neinterpretovat placeholder nuly jako skutečná měření.'},
 {metric:'extraTemp1',title:'Externí teplota · archivní kanál 1',
  liveKey:null,liveRelation:'none',hint:'Nepřiřazovat automaticky ke GW3000 ch_aisle channel 1 nebo k půdní teplotě.'},
 {metric:'extraHumid1',title:'Externí vlhkost · archivní kanál 1',
  liveKey:null,liveRelation:'none',hint:'Historický sloupec bez potvrzeného fyzického kanálu.'},
 {metric:'lightning_distance',title:'Vzdálenost poslední detekce blesku',
  liveKey:null,liveRelation:'none',hint:'Událost může být stará; poslední vzdálenost neznamená právě probíhající bouřku.'}
] as const;
export type SensorMetric=typeof sensorChannels[number]['metric'];
export const sensorMetricNames=sensorChannels.map(channel=>channel.metric);
