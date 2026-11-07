# Loučka Weather – kontext pro nový chat a AI agenty

**Aktualizace vstupního přehledu: 7. 11. 2026.** Zdroj pravdy je aktuální `main`, historická dokumentace ve `main/docs/` a samostatné provozní důkazy. Referenční benchmarky byly sloučeny v [PR #2](https://github.com/Boym323/Loucka_weather/pull/2) 1. 11. 2026. Astro frontend a Fastify API běží na testovacím náhledu; poslední potvrzený veřejný smoke 6. 11. ověřil commit `c8a5ab11` na 11 trasách pro desktop a mobil. Ověření z tohoto dne není automaticky dnešní aktuální nasazení. Původní veřejný web zůstává samostatný.

**Provozní výkonnostní audit:** Issue [#36](https://github.com/Boym323/Loucka_weather/issues/36) byl uzavřen 5. 11. po sloučení změn observer shutdown/profilovací sondy a jejich staging ověření; metodika a omezení jsou v [auditu 5. 11. 2026](API_PERFORMANCE_AUDIT_2026-11-05.md). Následný [Issue #55](https://github.com/Boym323/Loucka_weather/issues/55) stále řeší dlouhodobý trend RSS/heap, cold refresh a živě ověřený SSE shutdown. Krátké profilování **neprokazuje** paměťový leak ani dlouhodobou stabilitu.

## Klimatologický atlas – vývojová etapa (7. 11. 2026)

Na samostatné frontend větvi se připravuje nový přehled
`/klimatologie/`, kapitoly `/klimatologie/extremy/`,
`/klimatologie/trendy/`, `/klimatologie/sezony/` a
`/klimatologie/rocenka/`. Základem jsou existující read-only
`/api/v1/climate/records`, `/api/v1/climate/annual-matrix` a
`/api/v1/history`. Původní klimatologické grafy, srovnání roků a
heatmapy zůstávají na `/klimatologie/` se stejnými kotvami. Ročenka
nabízí pouze tisk / uložení do PDF přes dialog prohlížeče.
Vše je **předběžné**: období 2009–2026 není 30letý normál,
forenzní rekonstrukce není dokončena a srážkové anomálie mohou
ovlivnit souhrny. Neoznačovat práci za sloučenou nebo nasazenou,
dokud neproběhne PR, jeho zelené CI a veřejný smoke.

## Cíl
Navrhnout moderní portál **Počasí Loučka** pro veřejný web `https://pocasi-loucka.eu/`, s mobilním rozhraním, živými údaji, historickými grafy, statistikami a přehledem kvality dat. Původní **WeeWX + Belchertown** nadále provozovat, neměnit beze schválení produkční sběr dat. Meteorologická stanice Ecowitt GW3000, WeeWX a historický MariaDB archiv. Součástí většího projektu je historický audit a rekonstrukce chybějících/anomálních měření.

## Důležité skutečnosti
- Archiv obsahuje přibližně **1,68–1,7 milionu** měření od 2009 do 2026. Za ověřené poslední 24hodinové okno při posledním dotazu na Weather MCP bylo **288 záznamů, všechny s intervalem 5 minut**. Historicky nemusí intervaly být vždy 5 minut a jsou výpadky.
- Původní databáze `pocasi-loucka.eu`, tabulka `archive` (WeeWX), se **nesmí měnit**. Opravy patří pouze do `loucka_reconstruction` podle schválených rekonstrukčních postupů; nelze předpokládat, že každá položka rekonstrukční DB byla opravena, ani že má konkrétní původ.
- Existují okolní referenční stanice a několik zdrojových databází; jejich časové hranice, jednotky, věrohodnost a provenienci ověřovat. Chybějící měření nikdy automaticky nedoplňovat nulou; rekonstruovaná data nezaměňovat za naměřená.
- WeeWX archivní `dateTime` označuje **konec intervalu (start, end]**. Pro přiřazení dne použít `Europe/Prague`, zohlednit CET/CEST; přiřazení koncového času přesně na půlnoc je důležité.
- V současném webu jsou živá MQTT/WebSocket spojení a staticky poskytované JSON soubory. V Nginx proxy logu je `/mqtt` **251 požadavků (250× HTTP 101, 1× HTTP 502)**; nevypovídá to o současném počtu spojení.
- Matomo za **říjen 2026**: 216 návštěv, 73 unikátních návštěvníků, 314 akcí. Nginx za 27. 9. – 31. 10. 2026: **54 966** HTTP záznamů; významnou část tvoří automatizované skenování, monitorovací roboti a crawlery. Podrobnosti níže.
- **Stack v1 – předběžná pracovní preference, ne definitivně schválený architektonický závěr:** Astro + TypeScript + ECharts pro web; Node.js + Fastify jako datová vrstva; MariaDB pouze pro čtení v aplikačním backendu; cache a předpočítané agregace; živé aktualizace přes MQTT/WebSocket. Go zůstává kandidátem na API; Rust případně na batch worker, **zatím nepřidávat bez výkonové potřeby**.
- Referenční HTTP benchmark šesti backendů vykázal pro 30denní historii při c10: Go 31,34 RPS, Node.js 17,37 RPS (mediány 3 běhů); velký plný benchmark **běžel proti živé produkční databázi**, ač `isolated_copy=true` v JSON chybně tvrdilo opak. NIKDY neopakovat full test proti produkci.
- Offline výpočet celohistorických statistik na **syntetických** 1,68M řádcích: Rust 4,10 s / 107,23 MiB RSS; Go 5,26 s / 422,54 MiB; Node.js 15,36 s / 272,25 MiB. Všech 72 pokusů napříč profilem smoke/light/full mělo numerickou shodu. Nejde o výkonnost celé aplikace ani nezávislé ověření vědecké správnosti statistik.

## Povinné čtení pro další AI
1. [Rozhodnutí o architektuře – v1](ARCHITECTURE_DECISION_2026-10-31.md) – stav, výběr Node.js/Go/Rust, provedená a zbývající ověření.
   - [Audit návrhového API kontraktu v1](API_CONTRACT_AUDIT_2026-10-31.md) – OpenAPI 3.1, katalog 80 SQL sloupců, návrhová schémata a hranice offline/živé parity.
   - [Vyměnitelné API a migrace](API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md) – samostatné API mimo WeeWX, verzovaný kontrakt, parity testy a přepnutí Fastify → Go/Rust bez přepisu frontendu.
2. [Audit skutečného HTTP provozu](TRAFFIC_AUDIT_2026-10-31.md) – kompletní zpracování 5 souborů NPM, bezpečnost, špičky, cache, MQTT.
3. [Audit Matomo](MATOMO_AUDIT_2026-10-31.md) – návštěvnost, mobilní zařízení, nejpoužívanější stránky.
4. [Syntéza všech benchmarků](BENCHMARK_SYNTHESIS_2026-10-31.md) – přímé porovnání a rizika interpretace.
5. [Zdroje, ověřitelnost a ochrana soukromí](SOURCES_AND_REPRODUCIBILITY.md) – provenance čísel, dostupnost zdrojových dat a testovací hranice.
6. [Nginx data po dnech bez IP adres](data/traffic_daily_2026-09-27_2026-10-31.csv).
7. [Branch benchmarků](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python/benchmark/) a [offline compute](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python/benchmark/compute/).

## Co není hotové
- Testovací frontend a Fastify API běží na `dev.pocasi-loucka.eu`. Veřejný Playwright smoke 6. 11. ověřil 11 tras na desktopu a mobilu. Zbývající audit: dokázat skutečné vykreslení lazy-loaded klimatologie, mobilní ergonomii, proxy/rate limit a pořadí publikace při aktivaci API. Tuto kontrolu nelze zaměňovat za úplný audit produkčního prostředí.
- V repozitáři nejsou původní surové HTTP logy ani osobní IP adresy a nejsou zde originální soubory Matomo; reporty uvádějí agregáty ověřené read-only konektorem.
- Zbývá ověřit zátěž **všech** požadovaných API endpointů na testovací kopii DB, efekt aktivních MQTT spojení, správnost statistik nad reálnou rekonstruovanou historií a reálný dopad na DB a WeeWX writer.
- Neexistuje ještě finální přijetí stacku v produkci. Před samotnou implementací schválit přesné moduly, provozní hranice a bezpečnostní pravidla.

## Instrukce pro nový chat
„Pokračujeme v projektu Boym323/Loucka_weather. Nejprve načti `main/docs/PROJECT_CONTEXT.md` a všechny zde odkazované audity. Původní benchmarky hledej v `main/benchmark/` a historickém PR #2. Nezaměňuj syntetické/produkční měření, respektuj read-only produkční archiv a nic nemaž. Nejprve vyhodnoť aktuální stav projektu a navrhni nejbližší bezpečné kroky.“


## Jednotky v návrhu API v1
Doplněn `?units=us|metric|metricwx` (default metricwx); zdrojová normalizace podle `usUnits` každého řádku 1/16/17. Odpovědi musí uvádět skutečné jednotky; golden vektory v `tests/fixtures/unit-conversions.json` a referenční převodník `contracts/unit_conversion.py`. Detaily v [API auditu](API_CONTRACT_AUDIT_2026-10-31.md). Úplný kontrakt je návrh; část API v1 je implementovaná na testovacím webu.

## API v1 – aktuální zadání
Kontrakt v [API_V1_PRODUCT_CONTRACT.md](API_V1_PRODUCT_CONTRACT.md) a OpenAPI 3.1 definuje metadata, historii, statistiky, SSE a status kamery. Aktuální `main` obsahuje Fastify API s historií, statistikami, read-only archivním observerem a live GW3000 HTTP přenosem; jeho skutečné staging chování ověřuj z aktuálních testů a `deployment.json`. Produkční nasazení původního webu, plná historická QC a parita případné alternativy Go/Rust zůstávají samostatnými úkoly.

## Archivní refresh – staging implementace
Read-only archivní observer a SSE `archive-updated` jsou již implementované na stagingu. Podmínky `summaryStatus` nadále závisí na ověřené čerstvosti souhrnů a nesmí vytvářet domnělou čerstvost. Stav GW3000 live HTTP přenosu je oddělený od MQTT. Kontrakt a omezení jsou v [ARCHIVE_REFRESH_CONTRACT.md](ARCHIVE_REFRESH_CONTRACT.md), provozní kontrola v auditu 5. 11. a otevřeném Issue #55.

## Průběžná dokumentace

Aktuální změny zapisovat do [CHANGELOG.md](../CHANGELOG.md), stav rozhraní a otevřené problémy udržovat ve [frontend/README.md](../frontend/README.md). Nové nasazení ověřovat samostatně, GitHub `main` ani úspěšné CI nejsou důkazem nasazeného commitu.
