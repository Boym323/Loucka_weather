# STATISTICS_SPEC – meteorologické výpočty a původ dat

Status: **NÁVRH K REVIZI**, vydání 2026-10-30. Žádný výpočet nesmí být vydáván za ověřený, dokud neprojde fixture testy proti datům z archivu.

## 1. Zdroje: rozlišit a pevně určit
- `pocasi-loucka.eu.archive`: původní produkční WeeWX archiv. Čtení pouze SELECT.
- `pocasi-loucka.eu.archive_day_*`: existující denní souhrny WeeWX. Mohou obsahovat historické chyby převzaté z původního archivu; nepokládat automaticky za očištěné.
- `loucka_reconstruction.archive`: samostatná rekonstrukční databáze (existence ověřena); neznámou strukturu nebo stav oprav ověřit introspekcí a auditní evidencí. Čtení pouze SELECT v portálu.
- Další historické zdroje, např. `pocasi-loucka.eu_GW1000`, `old_weewx`, `weewx_WH1080`: **nikdy nevybírat implicitně**. Staré problematické WH1080 hodnoty nelze automaticky použít pro opravu vlhkosti.
- Okolní stanice (LuhaMet, ILOUKA4, další) jsou podpůrné zdroje, ne náhrada místního měření; ověřit umístění, senzor, jednotky, čas a povolení.
- Externí modely/ČHMÚ: samostatný zdroj se svým časem vydání a účinnosti.

Při startu engine selže uzavřeně (fail-closed), pokud chybí explicitní schema/database či neodpovídá ověřený `DATABASE()` a host. MCP má pozorované proměnlivé výchozí schema – nikdy se na něj nespoléhat. Zdroj SQL je konfigurován plně kvalifikovanými názvy/allowlistem, ne uživatelským vstupem.

## 2. Model jedné hodnoty
Jednotné schéma každého bodu:
- `observed_at_utc`, `interval_start_utc` (je-li intervalový), `interval_end_utc`, `published_at_utc`.
- `metric_id`, `value` (číslo nebo null), `unit` (kanonická), `aggregation`, `source_id`, `sensor_id` pokud znám.
- `origin`: measured / corrected / reconstructed / model / external_station.
- `quality`: valid / suspect / invalid / missing / unverified.
- `quality_reason_codes`, `rule_version`, `coverage_fraction`, `record_count`, `lineage_id` (při opravách).
- Origin a kvalita jsou dvě NEZÁVISLÉ osy: rekonstruovaná hodnota může být kvalitně ověřená nebo podezřelá.

Nepřepisovat null na 0, neoznačovat model jako měření, neztratit původní hodnotu. U plných grafů lze provenance sdílet jako metadata série, pouze pokud je pro všechny body skutečně stejná.

## 3. Jednotky a historická kompatibilita
Ověřený současný archiv obsahuje `usUnits=16` (METRIC). Podle WeeWX typicky teplota °C, vítr km/h, srážkové množství cm, tlak mbar/hPa; výchozí `rainRate` v cm/h. Měrné jednotky odvozených / vlastních polí explicitně verifikovat, nespoléhat na název sloupce.

Cílové prezentační jednotky: °C, %, m/s, mm, mm/h, hPa, W/m², UV index, µg/m³, dBm, případně °C v půdě. Konverze uchová přesnost ve výpočtu a až při zobrazení zaokrouhlí:
- km/h -> m/s / 3.6.
- cm -> mm * 10.
- cm/h -> mm/h * 10, jen pokud je doložen původ `rainRate`.
- Pro tlak `pressure`, `barometer`, `altimeter` nelze zaměňovat význam.
- Relativní vlhkost v % a body teploty neagregovat jako srážky.

Pro více systémů jednotek konvertovat na kanonické interní jednotky **před** agregacemi; nešířit jednu konstantní historickou jednotku bez ověření. Výstup má vždy `unit`.

## 4. Časy a intervaly
- Každý archivní záznam WeeWX patří k intervalu `(dateTime - interval*60, dateTime]`; `dateTime` je pravý konec.
- `dateTime` ukládá Unix sekundy (UTC). Denní hranice se vymezují v `Europe/Prague`, včetně 23/25hodinových dnů při DST.
- Denní souhrny WeeWX mohou být označené lokální půlnocí (ověřit na skutečných záznamech).
- Historicky existují i 6min intervaly; nepočítat počet záznamů jako jedinou míru úplnosti.
- Při časovém rozdělení intervalů na hranici hodin/dnů použít korektní vážení nebo dokumentované pravidlo. U intervalu srážek bez rozložení uvnitř intervalu nelze rekonstruovat přesný čas dopadu.
- Deduplikace: identita původu a časové okno, nikoliv pouhý `dateTime` při slučování heterogenních DB.
- Historické časové posuny, změny migrací, dst a `GTSdate` vyžadují zvláštní testy.

## 5. Závazný registr veličin
| Kód | Zdroj (příklad) | Typ veličiny | Základní agregace | Poznámka |
|---|---|---|---|---|
| air.temperature | outTemp | intervalová | časově vážený průměr, min, max | senzorové epochy |
| air.humidity | outHumidity | intervalová | časově vážený průměr, min/max | historické mezery |
| air.dewpoint | dewpoint | odvozená | časově vážený průměr | hodnotit validity vstupů |
| air.pressure | barometer | intervalová | časově vážený průměr, min/max | barometr vs absolutní tlak |
| wind.speed | windSpeed | intervalová | časově vážený průměr | ne směrový průměr |
| wind.gust | windGust | extrém | maximum | zachovat peak |
| wind.direction | windDir | kruhová | vektor/circular mean | váha větrem, bezvětří řešit zvlášť |
| rain.amount | rain | přírůstek | SUM | historické neplatné pulsy / návaznost |
| rain.rate | rainRate | intenzita | maximum, časový průběh | nezaměnit s úhrnem |
| solar.radiation | radiation | výkonová | interval. průměr/max, integrál energie | podezřelé extrémy |
| solar.uv | UV | index | maximum | nezaměnit s energií |
| soil.temperature.N | soilTemp1..6 | intervalová | časově vážený průměr/min/max | mapování sond v čase NEOVĚŘENO |
| soil.moisture.N | soilMoist1 a případné další | senzorová | medián/průměr, trend | jiný význam než déšť |
| air.pm25 | pm25_1 | koncentrace | průměr/medián/percentily | horní rozsah WH41, mlha |
| lightning.events | lightning_strike_count | stav čítače | závisí na semantics | nezsumovat kumulativní čítač |
| lightning.distance | lightning_distance | událost | poslední detekce | null není 0 km |
| sensor.rssi.* | *_rssi | diagnostika | poslední/časový průběh | null ≠ offline |
| derived.vpd | vpd | odvozená | podle metodiky | podmínky platnosti |

U každého `metric_id` uvést `first_valid_at`, `last_valid_at`, sensor mapping epoch, unit rule, aggregation rule, QC version a licenční stav (externí).

## 6. Výpočet agregací
- U teploty a podobných veličin vážit časem z platných intervalů; denní `wsum / sumtime` může být použit, pokud denní tabulka odpovídá zvolené datové vrstvě a QC.
- Min/max je skutečný extrém platného zdroje, součástí je timestamp a režim (ARCHIVE vs LOOP). Nevymýšlet sekundovou přesnost, pokud ji nemáme.
- Srážky: SUM platných přírůstků po správném převodu; nesmí se sumarizovat cumul rain jako přírůstek.
- Intenzita: velikost cm/h nebo mm/h ověřit pro jednotlivé epochy. `rain>0, rainRate=0` může být normální; `rain=0, rainRate>0` může odrážet klouzavé okno.
- Vítr: směr podle kruhové statistiky, rychlost intervalově váženě, nárazy maxima. Při redukci bodů zachovat extrémy.
- PM2,5: označovat senzorově limitované hodnoty 999.9 a vysokou vlhkost jako důvod k přezkumu, nikoliv automaticky mazat.
- Sluneční záření: maximální hodnoty výrazně nad očekávanou fyzikální hladinou nejprve označit suspect; energetický integrál = časová integrace W/m² -> Wh/m² nebo kWh/m².
- Denní průměry z neúplných období musí nést `coverage_fraction`; platná úplnost není totéž co počet řádků.

## 7. Úplnost
Počítat pokrytí jako délku sjednocených platných intervalů pro danou veličinu / délku požadovaného časového okna. Překryvy nesčítat vícekrát. V období neexistujícího senzoru uvádět `not_installed`, ne nulu. Vliv DST vychází ze skutečné délky lokálního dne.

Předběžné publikační prahy (přesné schválit na reálných datech):
- <= 80 %: nepublikovat hodnotu jako plnohodnotný klimatický průměr, pouze s jasným varováním.
- 80–95 %: označit „neúplné“.
- >= 95 %: může být považováno za dostatečné pokrytí, pokud nejsou jiné QC nálezy.
- Rekordy vyžadují přísnější a metrikově specifická pravidla; prahy nejsou univerzální pro extrémy.

Počet dnů v ročních agregacích musí rozlišovat „není senzor“ vs „chybí data“.

## 8. Klimatologie
- Charakteristické dny: mrazový `Tmin < 0` °C, ledový `Tmax < 0` °C, letní `Tmax >= 25` °C, tropický `Tmax >= 30` °C; tropická noc vyžaduje definované noční okno, ne automaticky denní minimum.
- Roční trend a „v tento den“: ukázat období měření a nejistotu, pro 29. únor zvláštní pravidlo.
- GDD, HDD, CDD: pevně verzované základní prahy a definice; nepřebírat nezdokumentované GTS/yearGDD bez ověření.
- Rozdíl k 2009–2025 průměru vlastní stanice není „oficiální klimatologický normál“. Proměny senzorů mohou porušovat homogenitu.
- Blesky jsou lokální detekce, ne úplný registr atmosférických výbojů.
- Srážková bilance a sucho: explicitní prahy a srovnání se sousedními stanicemi pouze jako kontext.

## 9. Historické rekonstrukce – rozhodnutí k odsouhlasení
**Návrh:** produkční originální archiv zůstává nedotčen, pro veřejnou klimatologii je možné použít prověřené opravy z `loucka_reconstruction.archive` pouze s doloženým původem, příznakem kvality a verzi pravidel; neověřené rekonstrukce defaultně nepublikovat jako fakt. Umožnit v grafu pohled „originál / ověřená oprava“ a rozdíl; při absenci provenance raději originál s varováním. Politika preferovaného zdroje je otevřená položka Q1.

## 10. Povinná sada regresí
1. Jarní přechod CET -> CEST, 23h den.
2. Podzimní přechod CEST -> CET, 25h den a duplicitní lokální hodina.
3. WeeWX 5min vs 6min interval a historické záznamy 10/30/40/55/75 min.
4. Interval přes místní půlnoc, kontrola `(start, end]`.
5. `rain=0`, `rainRate>0` a naopak; převody cm, cm/h.
6. Potvrzené falešné impulsy červenec 2021 vs platné srážky.
7. Vlhkost 2015–2019 a leden–červenec 2022, bez nahrazení smazanými špatnými WH1080 daty.
8. Sluneční maximum ~2367.8 W/m², PM2.5 999.9.
9. Přeznačené půdní sondy, záznamy bez mapování.
10. Záznam s korekcí: původní a výsledná hodnota a lineage.
11. Neúplný měsíc vs úplný měsíc.
12. Chybějící RSSI při dostupné vlastní metrice čidla.
13. Opakovaný export: deterministický hash dat pro stejné vstupy.
14. Předpočtený WeeWX denní souhrn vs přepočet z očištěných archivních intervalů.

## 11. Akceptační kritéria
- Každá karta a export má původ, jednotku, QC a časové okno.
- Všechny výpočty mají unit/fixture test; testy na hranicích DST.
- Kompletní historie se nečte pro každého návštěvníka.
- Žádná neověřená historická rekonstrukce se nevydává za naměřený fakt.
- Originální DB se pouze čte; engine není oprávněn opravovat zdrojový archiv.
- Rebuild denních agregací po validované korekci má explicitní trigger/version a není automatickou SQL mutací zdrojové DB.

## 12. Technické odkazy
https://www.weewx.com/docs/ ; https://weewx.com/docs/latest/devnotes/ ; https://opendata.chmi.cz/meteorology/weather/alerts/cap/
