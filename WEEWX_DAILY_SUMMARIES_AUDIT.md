# Audit denních souhrnů WeeWX pro Loučka Weather

**Datum:** 2026-10-30  
**Režim:** pouze SELECT, bez oprav, doplňování, rebuildů a migrací.  
**Rozsah:** struktura, výpočetní možnosti, výběrová shoda s původním archivem a plán pro nový frontend.  
**Není předmětem tohoto auditu:** doplňování chybějících historických hodnot, porovnávání s `loucka_reconstruction` a samotný přepočet tabulek. Tyto činnosti budou řešeny samostatně v rámci WeeWX.

## Výsledek a doporučení

**WeeWX již vytváří téměř všechny základní souhrny potřebné pro veřejný meteorologický web.** Pro první verzi Loučka Weather používat **L1 `archive` + L2 existující `archive_day_*`**. Další databázové tabulky L3 zatím **nezavádět**. Zvažovat je až tehdy, když konkrétní statistiku nelze efektivně a správně sestavit z denních souhrnů.

Při budoucím přepočtu souhrnů přes WeeWX předpokládat změnu výsledků a aktualizovat/invalidate API cache. Správnost **opravených zdrojových měření** není součástí tohoto auditu.

## Skutečné technické vlastnosti produkční DB

- MariaDB: `pocasi-loucka.eu`. Přístup přes MCP vyžaduje explicitní schéma v SQL; implicitní `DATABASE()` může ukazovat jinam.
- `archive`: `dateTime` je primární klíč a UNIX timestamp; `usUnits=16` pro aktuální archiv; jednotlivé archivní intervaly mají proměnlivou délku.
- 78 statistických tabulek typu `archive_day_*` s poli `min`, `mintime`, `max`, `maxtime`, `sum`, `count`, `wsum`, `sumtime`, plus metadata tabulka `archive_day__metadata`.
- `archive_day_wind` má navíc `max_dir`, `xsum`, `ysum`, `dirsumtime`, `squaresum`, `wsquaresum`. Vektorové hodnoty umožňují korektnější výpočty směru a větru než naivní průměr `windDir`.
- `archive_day__metadata`: `Version=4.0` a `lastUpdate`; neinterpretovat verzi souhrnů jako verzi aplikace WeeWX.
- Souhrn `archive_day_outTemp`: 6090 denních řádků v intervalu 2009-03-29 až 2026-10-30 (včetně rozpracovaného dne), z toho 6069 s počtem > 0.
- Hlavní index na `archive` a kontrolovaných denních tabulkách je PK `dateTime`; `EXPLAIN` u časově omezeného `archive` i víceletého `archive_day_outTemp` použil `type=range`, `key=PRIMARY`. To **potvrzuje použití indexu**, nikoli konkrétní odezvu nebo kapacitu pod zátěží.

## Shoda souhrnů s archivem

Přesné selektované dny z různých let: 2009-08-10, 2017-06-15, 2021-07-25, 2022-04-15, 2025-06-15, 2026-10-25, 2026-10-28.

Na těchto 7 dnech:
- Počty nenulových/platných teplotních pozorování v denním souhrnu odpovídaly počtu nenulových hodnot v raw `archive`.
- Časově vážené průměry teplot `wsum / sumtime` odpovídaly přepočtu z archivních intervalů (zaokrouhlení na 3 desetinná místa).
- Časově vážené průměry relativní vlhkosti odpovídaly stejnému přepočtu (zaokrouhlení na 2 desetinná místa).
- Denní součet `rain.sum` odpovídal součtu `archive.rain` po přepočtu cm na mm. **Shoda je aritmetická**, nikoliv potvrzení fyzikální správnosti všech historických vstupů.
- Část denních extrémů se liší od raw `archive`, protože souhrny mohou zachytit extremum z průběžného LOOP měření. Příklad 2026-10-28: `archive_day_outTemp.max=15,4 °C`, max pětiminutového `archive.outTemp=15,247 °C`; oba průměry souhlasí. V přehledu uvést „Denní maximum podle WeeWX“; nenahrazovat ho naivně raw max.
- 2026-10-25: souhrn má 300 intervalů a `sumtime=90000` sekund, správně reflektuje 25hodinový lokální den při změně CEST/CET.
- 2017-06-15 obsahuje pouze 107 teplotních intervalů / 32 100 sekund. Průměr z těchto dostupných intervalů je aritmeticky správně, ale **nemůže být bez popisku vydáván za průměr celého dne**.

Tyto příklady jsou **výběrová kontrola**, nikoliv úplná konzistence všech 78 souhrnů za 17 let.

## Jaké funkce z L2 získáme bez nové DB

| Funkce | WeeWX podklad | Další práce v API |
|---|---|---|
| Denní minimum/maximum teplot a čas extrému | `archive_day_outTemp.min/max,mintime/maxtime` | lokální čas, jednotky, zobrazení |
| Denní průměr teploty a vlhkosti | `wsum/sumtime` | coverage, jednoduchá validace |
| Denní a měsíční/roční úhrn srážek | `archive_day_rain.sum` | převod cm→mm, seskupení |
| Měsíční/roční průměr teploty | `SUM(wsum)/SUM(sumtime)` přes dny | nikoli nevážený průměr denních průměrů |
| Roční maximum/minimum | `MAX(max)`, `MIN(min)` nad denními řádky | datum/čas, filtrovat neúplné dny dle metodiky |
| Mrazové/ledové/letní/tropické dny | `archive_day_outTemp.min/max` | prahové počty, pravidlo úplnosti |
| Průměr a maxima větru, vektorové statistiky | `archive_day_wind`, `archive_day_windGust` | správné formule a jednotky |
| Denní záření a UV extrémy | `archive_day_radiation`, `archive_day_UV` | QC, jednotky; případný integrál energie |
| Půdní teploty a vlhkost | `archive_day_soilTemp*`, `archive_day_soilMoist1` | doložená historie mapování senzorů |
| PM2,5 – denní průměr a maximum | `archive_day_pm25_1` | metodika QC, kvalita měření |
| Teplotní heatmapa (denní průměr/min/max) | jeden řádek na den | vhodný primární základ klimatologické heatmapy |
| „V tento den v historii“ | cca 17 denních hodnot pro datum | agregace na vyžádání; není třeba L3 |

**Roční/měsíční samostatné materializované tabulky v auditovaných zdrojích nejsou potřeba jen kvůli součtům/průměrům:** měsíční a roční dotaz nad max. několika tisíci denními řádky je přirozený a předběžné `EXPLAIN` potvrzuje využití indexu.

## Co denní souhrny nenahrazují
- Minutové/pětiminutové grafy, hodinové profily a výběr libovolného intradenního okna -> přímo `archive` (nebo nezávislý live source).
- Historická větrná růžice podle směrových sektorů a rychlostních tříd -> vyžaduje historická pozorování nebo specializovaný histogram; vektorové součty samotné celý histogram neobsahují.
- Přesné kvantily/histogramy jako P95 teploty nebo PM2,5 z jednotlivých měření -> výpočty z raw dat / vlastní agregace.
- Tropické noci v pevně definovaném nočním okně -> denní `min` nestačí.
- Detailní výpadky, hloubkové profily podle epoch a QA časových intervalů -> raw data + senzory/metodika.
- Specializované indexy GDD/HDD/CDD, sucho, vlny veder, souběh více veličin -> často lze **odvodit efektivně z L2** na vyžádání; testovat před stavbou L3.
- Statistiky s průběžnými korekcemi zdrojových dat: zde **neřešit doplňování ani nezřizovat paralelní výpočty**. Nejprve samostatně provést zamýšlený přepočet ve WeeWX a teprve poté opakovat konzistenční test L1/L2.

## Doporučení pro implementaci
1. V API zavést read-only SQL adaptéry s `metric_id -> archive_day_* / typ agregace` allowlistem.
2. Založit endpointy `/api/v1/climate/daily`, `/monthly`, `/yearly`, `/records` nad souhrny WeeWX.
3. Pro období zvolená uživatelem API slučuje denní hodnoty ze stávající MariaDB, nesestavuje vlastní trvalý `monthly_statistics` jen kvůli součtům.
4. Pro detailní grafy používat primární `archive`, časové rozsahy a rozumný počet bodů; pro long-term graf denní souhrny.
5. Při přepočtu souhrnů provedeném ve WeeWX správně zneplatnit TTL cache a případné existující derived výsledky.
6. **O L3 rozhodnout až po benchmarku reálných dotazů a doplnění konkrétních funkcí, které WeeWX neumí.**
7. Akceptační testy: výše uvedené 7 dnů; 25hodinový den; 23hodinový den; min/max včetně LOOP; roční agregace; typy jednotek a případné nedostupné senzory.

## Omezení ověření
Neproběhla úplná kontrola všech 78 tabulek v každém roce ani zátěžový test při vysoké souběžnosti. `EXPLAIN` potvrzuje plán přístupu přes PK, **není to měření latence**. V této fázi nebyly provedeny změny dat ani přepočet tabulek.

**Rozhodnutí:** Pro MVP Loučka Weather vyhovuje L1 + L2. L3 pro běžné klimatologické přehledy zatím není opodstatněná.
