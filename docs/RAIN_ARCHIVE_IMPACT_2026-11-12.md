# Historické srážky 2009–2026: dopad existujících oprav a pravidla atlasu

**Stav 12. 11. 2026 – skutečné read-only SELECT, bez nových oprav a bez publikace rekonstrukčního datasetu.** Navazuje na [forenzní audit srážek](https://github.com/Boym323/Meteo_audit/tree/main/reports/parallel-audit) a [publikační připravenost](https://github.com/Boym323/Meteo_audit/blob/main/reports/2026-11-02-publication-readiness.md). Účel: uzavřít číselný dopad již existujících oprav a zabránit tomu, aby atlas interpretoval problematický původní archiv jako certifikovaný klimatický trend.

## Rozsah a metodika

Původní `pocasi-loucka.eu.archive` a pracovní `loucka_reconstruction.archive` byly čteny přímo přes Weather MCP v 18 samostatných ročních oknech, po měsících. Stejná horní hranice obou archivů: **2026-10-29 15:10:00 UTC** (poslední timestamp rekonstrukce, 1793286600). Originál již obsahoval novější údaje do 2026-11-12 07:50 UTC, ty nejsou do porovnání zahrnuty. První existující timestamp obou archivů 29. 3. 2009.

WeeWX `dateTime` je konec intervalu (start,end]. Hranice místních měsíců/roků byly vypočteny explicitně v Europe/Prague a dotazy používají `dateTime > from AND dateTime <= to`. Konverze `usUnits=1 → 25,4`, `16 → 10`, `17 → 1` na mm, obdobně mm/h. V obou hlavních archivech nebyly ve srovnávaném rozsahu nalezeny záporné hodnoty rain ani neznámé kódy jednotek. To není důkaz fyzikální kalibrace, nepoužívají se zde kumulativní staré WH1080 čítače.

## Roční dopad

Součty dostupných intervalů, nikoli nezávisle potvrzené roční klimatologické úhrny. Počty existujících řádků a NULL jsou skutečné; zejména u starších let nelze podíl počtu řádků vůči teoretické 5min mřížce zaměňovat za časové pokrytí (jiné intervaly, off-grid a překryvy).

| Rok | Originál mm | Rekonstrukce mm | Rozdíl R−O mm | Originální řádky | Rek. řádky | Pův. rain NULL | Rek. rain NULL |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2009 | 437.500 | 384.580 | −52.920 | 78094 | 78094 | 3 | 3 |
| 2010 | 783.540 | 552.570 | −230.970 | 104090 | 104090 | 0 | 0 |
| 2011 | 523.680 | 439.950 | −83.730 | 62854 | 62854 | 0 | 0 |
| 2012 | 308.070 | 308.070 | 0 | 75335 | 75335 | 0 | 0 |
| 2013 | 550.680 | 550.680 | 0 | 95491 | 95491 | 1358 | 1358 |
| 2014 | 642.300 | 642.300 | 0 | 95774 | 95774 | 5 | 5 |
| 2015 | 437.700 | 437.700 | 0 | 101261 | 101261 | 0 | 0 |
| 2016 | 492.000 | 492.000 | 0 | 87913 | 87913 | 175 | 175 |
| 2017 | 597.900 | 597.900 | 0 | 76820 | 76820 | 82 | 82 |
| 2018 | 333.000 | 333.000 | 0 | 87623 | 87623 | 11 | 11 |
| 2019 | 656.700 | 656.700 | 0 | 104750 | 104750 | 43 | 43 |
| 2020 | 715.824 | 715.824 | 0 | 102995 | 102995 | 8126 | 8124 |
| 2021 | 1218.743 | 560.295 | −658.448 | 103459 | 103466 | 294 | 295 |
| 2022 | 579.589 | 579.589 | 0 | 104140 | 104140 | 90 | 90 |
| 2023 | 972.700 | 972.700 | 0 | 104434 | 104434 | 31 | 31 |
| 2024 | 1057.700 | 1057.700 | 0 | 104935 | 104935 | 237 | 237 |
| 2025 | 769.900 | 739.400 | −30.500 | 102946 | 102946 | 93 | 93 |
| 2026* | 507.500 | 507.500 | 0 | 86888 | 86888 | 127 | 125 |

\* neuzavřené období do cutoff. 2009 nezačíná v lednu, 2011–2012 obsahují několikaměsíční výpadek, před dubnem 2013 není uzavřena fyzikální kalibrace. V roce 2026 počet řádků převyšuje teoretickou 5min mřížku o 6; samotný počet proto nesmí být použit jako skutečné pokrytí.

Rozdíly jsou soustředěny do pěti let: přibližně **−1056,568 mm** součtu dostupných intervalů (součet za různě pokryté roky, ne klimatologická veličina).
- 2009–2011: −367,62 mm, potvrzen dosavadní audit Fáze A (resetové a přenosové artefakty). Červen 2010: 210,96 → 49,20 mm.
- Červenec 2021: 701,015 → 42,567 mm; sedm dodatečných pracovních archivních řádků v tomto měsíci. Původní roční rekord se tím mění. Dosavadní pracovní rekonstrukce vychází z interpolace ČHMÚ; není místním originálem.
- 27. 2. 2025: 30,5mm podezřelý impuls v původním archivu; po dosavadní pracovní korekci měsíční úhrn 41,7 → 11,2 mm; den 38,9 → 8,4 mm.
- 2020 a 2026: po dvou doplněných nulových rain hodnotách, bez změny úhrnu. V červnu 2021 navíc jeden původně dostupný rain v rekonstrukci NULL.

## Rekordy a význam pro web

Denní maxima byla znovu vypočtena přímo z intervalů všech 18 let, s ověřeným session SYSTEM/CET (zimní UTC+1, letní UTC+2; `DATE(FROM_UNIXTIME(dateTime-1))` odpovídá lokálnímu konci intervalu). Hodnoty z raw archive nejsou automaticky totožné s dnešními veřejnými WeeWX denními souhrny.

| Kandidát na rekord | Originál | Pracovní rekonstrukce |
|---|---|---|
| Roční úhrn | 2021: 1218,743 mm | 2024: 1057,700 mm |
| Denní úhrn | 25. 7. 2021: 107,848 mm, 288/288 řádků s hodnotou | 30. 6. 2011: 63,96 mm, 287/288 řádků |
| Měsíční úhrn | 2021-07: 701,015 mm | 2023-08: 206,0 mm (historická úplná měsíční tabulka 2014–2026, přímo znovu ověřen; maxima 2009–2013 znovu zkontrolována) |

Rok 2011 má nevyřešenou historickou kalibraci; **ani nový nejvyšší denní pracovní úhrn není certifikovaný rekord**. Srážkový rekord 2024-09-14, 53 mm v obou archivech (288 platných záznamů), je dobrý kandidát k další cílené revizi; není tvrzeno, že jde o definitivní rekord. Srpen 2023 má 8879 platných archivních řádků; jeho 206 mm je předběžný součet.

## Aktuální čekající návrhy

V `reconstruction_candidates` × `reconstruction_batches.state=pending` je stále 14 rain a 207 rainRate návrhů. Přímé porovnání cílů s oběma archivy:
- 4 číselné návrhy doplnění nuly (2020-07 a 2026-10) již v pracovní kopii přesně existují. Neprovádět znovu. Samotný stav pending tím nezmizel.
- 9 rain návrhů je bez číselné náhrady: historické čítače, kalibrace, anomálie. Z toho 2011-03-28 a 2025-02-27 už mají v pracovní kopii nulu; 2013-07-01 zůstává NULL a neimportovat hodnotu z potenciálně porouchaného multisenzorového záznamu. Dva GW1000 extrémy v květnu 2026 nepatří do originálního archivu a neobnovují se.
- 1 missing-record 2022-09-15 12:55 UTC: přesný původní pětiminutový řádek existuje v `pocasi-loucka.eu_old`, nikoli v originálu, GW1000 ani pracovní kopii. Zdroj má `usUnits=16`, rain 3,3528 mm, RH a teplotu v návaznosti na okolní originální intervaly (12:50 a 13:00 UTC). K obnově celého řádku je nutná revize všech sloupců, původu a deduplikace, nikoli import pouze rain.
- 204 rainRate `manual-review` kandidátů nemá číselnou náhradu. Ve všech je současný pracovní rate nula; 48 má kladné rain, 156 rain=0. Dřívější GW1000 špičky sahají do 451,2 mm/h. Potvrdit příčinu a časové okno, nulu nepovažovat za ověřenou skutečnou intenzitu.
- 3 numerické rainRate návrhy: 2013-08-04 21:35 UTC (180 mm/h), 2023-06-09 13:25 UTC (61,64 mm/h), 2023-08-26 10:00 UTC (108,84 mm/h). Aktuální GW1000 potvrzuje přesné zdrojové hodnoty, stejné usUnits=16 a stejné kladné rain (15, 11,1, 11,8 mm) jako pracovní kopie; ta má rate=0. V aplikované historii přesně těchto tří timestampů pro rainRate nebyl nalezen záznam state=applied. Jde o prioritní cílenou revizi dešťové události, ne automatické povolení obnovy.

**Rozdíl proti starším reportům:** aktuální roční SELECT pro 2021 zjišťuje v pracovní kopii 4567 kladných rainRate (starší průzkumný audit uváděl 2336), 774 mokrých intervalů s uloženou nulovou intenzitou (starší 617). Důvod rozdílu nebyl v tomto kroku ověřen; starý výsledek není nový stav databáze. Pro 2009–2025 má současný původní archiv roční počet kladných rainRate **0**, přestože jsou srážky nenulové. Intenzitu a úhrn je nutno považovat za rozdílné veličiny. Neprovádět plošné `rainRate = rain × 12`; intervalový průměr, okamžitá intenzita a klouzavá intenzita nejsou totéž.

## První implementace srážkového atlasu

Frontendová sekce `/klimatologie/trendy/#srazky-archiv` používá jediný existující veřejný denní `history?metric=rain&resolution=daily&units=metricwx&dataset=original` dotaz na vybraný dokončený rok. Měsíční úhrn je součet dostupných použitelných denních souhrnů; nulový den se nezaměňuje za chybějící, podezřelé/negativní hodnoty jsou zvlášť, zcela chybějící měsíc má hodnotu null. Lokální kalendář včetně DST, jednoznačné hranice dne, odmítnutí reconstructed/reference provenance a chybných jednotek. Žádná kopie neschválených čísel do veřejného frontend buildu.

Roční srážkový graf a tabulka stále zobrazují původní data, ale **do popisného Theil–Senova sklonu** již nezařazují roky 2009–2013 (historická kalibrace a artefakty), 2020 (dlouhé mezery), 2021 a 2025 (doložené významné původní anomálie). Vyžadují dokončený rok, ≥90 % dní s hodnotou, známé časové pokrytí ≥90 % a původní mm souhrn; známá omezení jsou ve veřejné tabulce viditelná. Ostatní roky nejsou automaticky QC-approved. U nedostatečné časové řady se sklon nezobrazuje. Teplotní a větrná pravidla zůstávají. Stránka Extrémy upozorňuje na známé problematické datum případného původního maxima, aniž by zobrazila náhradní rekord z pracovní kopie.

Testy syntetických denních hodnot, chybějících/negative/suspect, nul, leap/DST, provenance, ročního filtru a reálné browser interakce. Žádná nová SQL služba, databázový zápis, restart, veřejný approved dataset či automatický souhlas. Stav CI a nasazení ověřovat odděleně.

**Navazující praktická práce:** místo dalšího plošného skenu vyřešit 4 již splněné pending položky administrativně, samostatně revizi jednoho chybějícího originálního řádku a tří číselných rate případů, následně prioritně 48 mokrých intervalů s vynulovanou intenzitou. Jakýkoli zápis pouze výslovně odsouhlaseným procesem do pracovní rekonstrukce s provenance a rollbackem. Historické roční rekordy zůstávají předběžné.
