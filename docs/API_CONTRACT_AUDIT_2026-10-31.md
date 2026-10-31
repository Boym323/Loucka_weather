# Loučka Weather – audit API kontraktu a plán migrace (31. 10. 2026)

**Stav: NÁVRH / NENASAZENO.** Nová definice `openapi.yaml` je koncepční veřejný kontrakt, ne automaticky kompatibilní rozhraní benchmarkových serverů. Neproběhl žádný zápis do meteorologických databází ani změna WeeWX.

## Zdroje a provedené ověření

- Prohlédnuty soubory `benchmark/lxc/node/server.mjs`, `benchmark/lxc/go/main.go`, `benchmark/lxc/rust/src/main.rs` z větve `bench/go-rust-python`. Tyto implementace poskytují jen `/current`, `/history/24h`, `/history/30d` a `/statistics/yearly` bez nových metadat jednotek/provenience/kvality. **Nové API v1 proto ještě neimplementují**.
- Z připojené produkční MariaDB načten `information_schema.columns` pro `pocasi-loucka.eu.archive` výhradně přes SELECT. K 31. 10. 2026 obsahovalo schéma **80 sloupců** (3 archivní metadata a 77 meteorologických/senzorových polí), zachycených v `schemas/metrics.json`.
- Ověřeno `SELECT usUnits, COUNT(*) ...`: **1 680 447 archivních záznamů s `usUnits=16`**, tedy WeeWX METRIC. Referenční jednotky: srážky v cm, rychlost km/h; nová API v1 bude normalizovat na mm a m/s. Původní měření zůstávají beze změn.
- Časy `dateTime` WeeWX představují konec archivního intervalu `(start,end]`. U ročních statistik se vychází z kalendáře `Europe/Prague`, nikoliv UTC půlnocí.
- Normativní zdroje: [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html), [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12), [WeeWX devnotes](https://weewx.com/docs/latest/devnotes/), [WeeWX Units](https://weewx.com/docs/4.0/customizing.htm).

## Co bylo dopracováno

1. **`openapi.yaml`:** GET `/api/v1/current`, `/api/v1/history`, `/api/v1/statistics/yearly`, `/api/v1/healthz`; explicitní parametry, rozsahy, response kódy 200/400/404/422/429/500/503 podle endpointu, jednotná chybová struktura a odkazy na externí JSON schémata.
2. **`schemas/weather.schema.json`:** JSON Schema Draft 2020-12 pro current/history/yearly/health/error, detaily measurement/quality/source/provenance, řetězce časů v UTC se `Z`, explicitní `null`, úplnost, počet bodů a jednotky vázané na název metriky. **Semantické vztahy** typu `count == len(points)` a chronologické pořadí zajišťují navíc testy – samotné JSON Schema nestačí.
3. **`schemas/metrics.json`:** úplná evidence skutečných aktuálních SQL sloupců `archive` včetně typů a nullability. **45 kandidátních měřených veličin má pro API navržené jednotky**, dalších **32 položek je `public:false`** kvůli neověřené jednotce nebo významu. Metadata `dateTime`, `usUnits`, `interval` se nepředstírají jako samostatné měřené veličiny.
4. **`tests/fixtures/*.json`:** pět syntetických vzorových odpovědí včetně `missing` a skutečné nuly.
5. **`tests/test_contract.py`:** offline validace OpenAPI, schémat a pozitivních/negativních fixture (neplatné jednotky, pole, čas, chyba, `missing` s nenulovou hodnotou).
6. **`tests/run_live.py`:** striktní black-box test skutečně běžících Fastify/Go/Rust API přes jejich **tři samostatné staging URL**, se stejným izolovaným snapshotem. Vynucuje všechny tři servery a porovnává statusy, JSON schémata, časové řady a numeriku (tolerance 1e-6); pro chybové odpovědi ignoruje jen jedinečný `requestId`.
7. **GitHub Actions `api-contract.yml`:** ověřuje **offline** testy při změně kontraktu. **Nesmí se vydávat za test tří reálných backendů**; ty zatím API v1 neimplementují.

## Spuštění

```bash
python3 -m pip install -r tests/requirements.txt
python3 -m pytest -q tests/test_contract.py
```

Až *po implementaci všech tří variant nad totožným izolovaným snapshotem*:

```bash
python3 tests/run_live.py \
  --fastify http://127.0.0.1:18131 \
  --go http://127.0.0.1:18132 \
  --rust http://127.0.0.1:18133 \
  --expected-dataset-id isolated-weewx-snapshot-v1
```

Uvedené URL jsou pouze ilustrativní. Runner nezastupuje E2E, bezpečnostní ani zátěžové testy a předpokládá, že operátor ověřil identitu snapshotu mimo tento skript.

## Omezení a kritická místa před implementací

- **Technologická volba API není schválená:** Fastify je pracovní kandidát, Go alternativa, Rust případný worker. Veřejný kontrakt má fungovat nezávisle na jazyce.
- **Neověřená pole:** `bgt`, `pb`, `GTSdate`, `soilad1`, baterie, RSSI, signály, `lightning_energy` a jiné vlastní výpočty zatím nesmějí být vydávány za spolehlivá veřejná měření. I `public:true` znamená pouze návrh možné normalizace, ne potvrzení kvality celé časové řady.
- **Historické jednotky a období:** dnešní `usUnits=16` nevypovídá o všech možných budoucích zdrojích. Přidat referenční fixture pro US/METRICWX, přechod CET/CEST, nulová/NULL data, nepravidelné intervaly, správný déšť, denní extrémy z LOOP dat a původ oprav.
- **Sémantika agregace:** průměrování větru, srážky, UV, směru větru, doba slunečního svitu a sumy není stejné; endpoint `aggregation` musí před produkcí dostat kompatibilitní matici metric→povolené agregace a vědecké referenční testy. Nesmí se slepě sčítat libovolné veličiny.
- **Completeness:** očekávaný počet bodů není mechanicky 288/den (historické intervaly, DST, vyřazená/nenainstalovaná čidla). `expected:null` a `fraction:null` jsou povolené, pokud úplnost nelze doložit.
- **Živá data:** MQTT/WebSocket/SSE je samostatný kontrakt; zatím není v tomto OpenAPI definovaný. Stará WeeWX implementace zůstává nedotčena.
- **Kamera, radar, ČHMÚ:** nejsou součástí meteorologického čtecího API v1, pro tyto integrace později samostatné zdrojové/licenční a soukromé kontrakty.
- **Bezpečnost:** parametrizované SELECT, validace `metric`, délky okna a limitu, malé levné 404, cache, auditované chyby bez DB adres nebo credentialů; nejsou tím automaticky implementovány.
- **Zátěž:** ani benchmarky šesti jazyků nedokládají schválené staging limity, protože původní full benchmark byl proti živé DB. Zátěžové testy jen na izolovaném snapshotu, ne přes původní produkční WeeWX/MariaDB.

## Kritéria dokončení

A. GitHub Actions offline validace PASS.
B. Formální revize doménových pravidel, akceptace JSON struktury a normalizace sloupců.
C. Implementace API v1 na samostatném staging LXC, s read-only přístupem k archivu.
D. Doplnění testů s referenčními historickými případy a všech relevantních endpointů.
E. **Reálná** Fastify/Go/Rust parita PASS nad stejným snapshotem; zdokumentovat případné rozdíly a rollback reverse proxy.
F. Samostatné měření výkonu a funkční smoke před produkčním přepnutím.

**Dnes je hotový návrh specifikace a testovacího rámce, nikoli tři kompatibilní produkční backendy.**

Poznámka k revizi: `outThetaE` záměrně přeřazeno do `public:false`, dokud nebude potvrzeno, zda vlastní výpočet používá Kelvin či °C. CI validátor OpenAPI načítá dokument pomocí `read_from_filename` a absolutní base URI, aby se externí schémata řešila lokálně.

### Kontrola archivních intervalů (SELECT)

Počty z produkčního `archive` k 31. 10. 2026: `interval=5`: 1 678 351, `6`: 2 090, `30`: 3, `75`: 1, `55`: 1, `10`: 1, `40`: 1. To je důkaz, že **není bezpečné vyžadovat přesně pětiminutový interval** a že délku intervalu musíme zohlednit při rekonstrukcích, časově vážených průměrech, úplnosti a downsamplingu.


## Jednotkové systémy – doplnění kontraktu (31. 10. 2026)

**Všechna původní měření zůstávají read-only.** Podporované zdrojové kódy jsou `usUnits=1` (US), `16` (METRIC) a `17` (METRICWX). Každý archivní řádek se má vyhodnotit podle vlastního `usUnits`, nikoli podle předpokladu, že celé historické období používá jednotky z dnešní databáze. Na běžící WeeWX produkci zůstává ověřená hodnota 16; jiné systémy jsou pokryté návrhem pro budoucí importy, ne potvrzené v produkčních řádcích.

**Způsob výstupu:** volitelný query parametr `units=us|metric|metricwx` na `/api/v1/current`, `/api/v1/history` a `/api/v1/statistics/yearly`. Výchozí `metricwx` dává teploty °C, srážky mm, rychlosti větru m/s a tlak hPa. Odpovědi obsahují povinné `units` a jednotlivá pole mají svůj konkrétní `unit`. Neplatný klientský výběr `units` vrací `400 BAD_REQUEST`. **Zdrojové `usUnits` není veřejný vstupní HTTP parametr** – patří ke každému skutečně načtenému zdrojovému záznamu. Volitelné `sourceUsUnits` je uvedeno u raw měření tam, kde je známo.

| Veličina | US (1) | METRIC (16) | METRICWX (17) |
|---|---|---|---|
| Teplota | °F | °C | °C |
| Tlak | inHg | hPa | hPa |
| Úhrn srážek | inch | cm | mm |
| Intenzita srážek | inch/h | cm/h | mm/h |
| Rychlost větru | mph | km/h | m/s |
| Windrun | mi | km | km |
| Základna oblačnosti | ft | m | m |
| Vlhkost, UV, radiace, směr větru | stejné jednotky | stejné jednotky | stejné jednotky |

Jediný zdroj pravdy pro názvy jednotek a jejich přiřazení každé z 45 povolených veličin: `schemas/metrics.json` (`unitGroup`, `sourceUnitsByWeeWX`, `outputUnits`). Specifika neověřených/custom senzorů se nesmějí odvozovat automaticky z `usUnits`; jsou blokovaná nebo mají explicitní neměnnou skupinu. Konkrétně `lightning_distance` je **prozatím custom km** bez tvrzení, že v US WeeWX přechází na míle; před nasazením nutno ověřit původ hodnot a dostupnost senzoru.

**Referenční normalizace:** `contracts/unit_conversion.py` poskytuje čistou Python implementaci bez databáze pro společné testovací vektory `tests/fixtures/unit-conversions.json`. Zachovává `null`, nulu a i potenciálně podezřelé záporné hodnoty bez tiché změny, odmítá neznámé `usUnits`, neznámé veličiny a nečíselné/NaN/Infinity vstupy. Nejde o runtime Fastify/Go/Rust – stejné pravidlo bude nutné realizovat a testovat v každém backendu.

**Přesnost a agregace:** převody musí být aplikovány na fyzikálně správné jednotky. Teplotu °F↔°C nelze affine převodem jednoduše aplikovat na součet teplot; roční agregační metoda `count` vrací jednotku `count` a nepřevádí hodnotu. Srážkové roční součty se převádějí jako úhrny; směrové/větrné statistiky a METRICWX/US historické změny musí být před produkcí ověřeny proti WeeWX agregátům. Cache klíče musejí zahrnovat `units` a response `Vary` politiku navrhnout podle typu cache, aby si požadavky US a metricwx nevracely cizí jednotky.

**Testování:** offline `tests/test_unit_conversion.py` pokrývá všechny povolené metriky × 3 zdrojové × 3 výstupní systémy, konkrétní zlaté vektory a chybové vstupy; `tests/test_contract.py` kontroluje schémata a parametr `units`. `tests/run_live.py` je připraven porovnávat odpovědi tří různých implementací pro všechny režimy na izolovaném snapshotu, skutečná parity zatím **neproběhla**, protože backendy `/api/v1` nejsou nasazené. Před produkcí přidat scénáře s importem US/METRICWX a validaci časových/meteo agregací.

Ověřené zdroje: [WeeWX standardní jednotky](https://weewx.com/docs/5.0/reference/units/), [WeeWX StdConvert](https://www.weewx.com/docs/5.2/reference/weewx-options/stdconvert/), [WeeWX možnost změny jednotek pro výstup](https://www.weewx.com/docs/customizing.htm).
