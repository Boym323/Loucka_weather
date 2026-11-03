# Roční konsolidace – zdroje, metodika a hranice kvality

Datum auditního snímku: 3. listopadu 2026. Důkazy: docs/data/yearly_coverage_evidence_2026-11-03.json.

## Zdroje

Produkční pocasi-loucka.eu.archive a tabulky archive_day_* tvoří jediný dnes publikovaný časový základ ročního API.
Pracovní loucka_reconstruction.archive již obsahuje opravy outHumidity, rain a rainRate, ale produkční denní souhrny z něj nejsou automaticky přepočtené.
GW1000, historické ESP/old_weewx archivy a WH1080 jsou možné důkazní zdroje. Zvláště WH1080 má historicky doložené vady.
Importovaná LuhaMet a WU ILOUKA4 slouží jako nezávislé reference, nikoliv jako vlastní měření Loučky.

## Co nově skutečně funguje

GET /api/v1/climate/annual-matrix?metric=outTemp&units=metricwx&dataset=original vrací všechny roky v jediném omezeném read-only dotazu nad denními souhrny.
Roky mají platné a chybějící dny, relativní podíl pokrytí a tam, kde to dovoluje sumtime, také časové pokrytí.
Průměry jsou váženy délkou platných intervalů (wsum/sumtime), součty berou jen platné naměřené dny. Nuly se nedosazují za NULL.
Konec aktuálního roku je poslední dokončený místní kalendářní den, hranice berou CET/CEST.
Konzistentní konverze jednotek jde přes existující API pravidla. Metadata QC jsou vždy original_unverified.
Web nabízí 35 podporovaných veličin včetně větru, UV, PM2.5 a archivních sond, a zobrazuje všechny roky s jejich pokrytím.

## Co zůstává před schválením rekonstrukce

V pracovním archivu jsou aplikované tisíce oprav (viz přiložený JSON). Neznamená to, že byly revidovány a vydány nové denní statistiky.
Před publikací dataset=approved je nutná validace referencemi, časovými hranicemi, jednotkami, změnami kanálů a QC každé změny; poté regenerace denních souhrnů ze schválených hodnot.
Tato změna neprovádí fyzický merge šesti databází, nic nemaže, neopravuje neověřené záznamy a nic nezapisuje do produkce ani rekonstrukce.

## Interpretace

Rok s 365 platnými dny nemusí mít 100 % sekundového pokrytí. Rok bez UV před rokem 2022 neznamená nulové UV.
Srovnání dvou roků na heatmapě používá společné kalendářní dny; celoroční agregát v tabulce používá vlastní dostupné intervaly daného roku. Tyto dva výsledky mají odlišný jmenovatel.
Snapshot je časově omezený; dynamické roční API načítá zdroj znovu v bounded cache.

## Jeden graf teplot všech roků (2026-11-03)

Adresa: /klimatologie/#teplota-vsechny-roky

- API: GET /api/v1/climate/temperature-years?units=metricwx&dataset=original.
- Jeden read-only dotaz na archive_day_outTemp pro 2009 až poslední dokončený místní den.
- Každý řádek zachovává datum v Europe/Prague, teplotní průměr wsum/sumtime
  konvertovaný na °C, počet platných sekund a délku dne (23, 24 nebo 25 hodin).
- Neúplné dny mají stav partial, neplatné hodnoty suspect, chybějící souhrny missing.
  Pro neexistující datum se žádná hodnota nevyrábí, graf ponechá prázdné místo.
- Graf zobrazuje 18 let na společné ose s odděleným 29. únorem;
  měsíční průměr vzniká vážením skutečných sekund a vyžaduje alespoň 50 %
  pokrytí celého měsíce. Ostatní roky nezmizí, pouze jsou slaběji vykreslené.
- Orientační průměr a min/max interval pochází z dokončených dostupných roků;
  pro den či měsíc vyžaduje alespoň tři různé historické roky. Není to klimatický normál.
- Výběr zvýrazněného roku, zapínání všech/konkrétních roků, průměru a rozmezí
  probíhá v prohlížeči bez dalších API požadavků.
- API nikdy neposkytne approved dataset bez schválené rekonstrukce;
  veřejná staging kontrola ověřuje endpoint po nasazení backendu i frontendu.

Výkon: odpověď má nanejvýš 7500 denních řádků, pouze jednu veličinu,
cache 15 minut (jediný současný in-flight dotaz) a HTTP ETag.
