# AI / Codex pokyny – Loučka Weather

## Povinný start pro každého nového agenta
1. Přečti [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).
2. Přečti [docs/ARCHITECTURE_DECISION_2026-10-31.md](docs/ARCHITECTURE_DECISION_2026-10-31.md), [docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md](docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md), [docs/TRAFFIC_AUDIT_2026-10-31.md](docs/TRAFFIC_AUDIT_2026-10-31.md), [docs/MATOMO_AUDIT_2026-10-31.md](docs/MATOMO_AUDIT_2026-10-31.md) a [docs/BENCHMARK_SYNTHESIS_2026-10-31.md](docs/BENCHMARK_SYNTHESIS_2026-10-31.md).
3. Strojově čitelná data: [docs/data/observations_2026-10-31.json](docs/data/observations_2026-10-31.json), [docs/data/traffic_daily_2026-09-27_2026-10-31.csv](docs/data/traffic_daily_2026-09-27_2026-10-31.csv).
4. Referenční šestijazyčné benchmarky byly sloučeny do `main` v [PR #2](https://github.com/Boym323/Loucka_weather/pull/2) dne 1. 11. 2026; jejich výsledky jsou **historické a neprokazují výkon produkčního API**. Testovací portál běží odděleně na `dev.pocasi-loucka.eu`; původní veřejný web nebyl nahrazen. Vždy samostatně ověř aktuální commit nasazení.
5. Rozlišuj zdrojově ověřené hodnoty, orientační heuristiky, syntetická měření a návrhy. Nikdy netvrď, že benchmark numeriky použil skutečné meteo archive, ani že plné HTTP benchmarky byly na izolované DB.

## Nepřekročitelné meze
- **WeeWX + Belchertown, MariaDB a produkční měření musí zůstat funkční.** Původní `pocasi-loucka.eu.archive` měnit nesmíš. Pro aplikaci je read-only. Správa opravených hodnot patří do `loucka_reconstruction` přes výslovně schválený, auditovatelný proces.
- Neprováděj intenzivní SQL/HTTP benchmark proti produkci. Používej oddělený lokální snapshot.
- Nezveřejňuj privátní IP, osobní údaje návštěvníků, surové NPM logy, přihlašovací údaje, adresy interních hostů ani citlivá URL. GitHub repozitář je **veřejný**.
- Meteorologické konvence: WeeWX `dateTime` je konec intervalu `(start,end]`, lokální kalendář `Europe/Prague`, DST CET/CEST, jednotky `usUnits` (US/METRIC/METRICWX), neměň NULL na nulu, odděluj originální a rekonstruovaná data, počítej úplnost dat.
- Nezaměňuj současnou návštěvnost Matomo s počtem HTTP requestů Nginx, `101` s počtem aktivních websocketů ani `404` automaticky s chybami UX.
- **Node.js/Fastify je již nasazené a testované na stagingu** (poslední veřejný smoke 6. 11. 2026, commit `c8a5ab11`). Nejde o schválení produkční migrace. V produkci zůstává původní WeeWX/Belchertown.

## Praktický postup v repozitáři
- Před návrhem změny zkontroluj aktuální `main`, otevřené PR a pracovní dokumentaci, abys zbytečně nepřepisoval novější změny.
- API provozuj odděleně od WeeWX (v MVP může běžet jako samostatná služba vedle Astro v novém LXC); frontend musí záviset jen na jazykově nezávislém verzovaném OpenAPI kontraktu, ne na Fastify nebo Go. Při výměně backendu vyžaduj paritní testy, staging a možnost rollbacku.
- Pro Node API nejprve definuj čtecí kontrakty `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`, `/healthz` a jejich bezpečnostní omezení. Využívej cache a agregáty, náročné činnosti mimo HTTP.
- Výsledky nových měření zapisuj do `docs/` včetně data, rozsahu, zdroje, metrik, metodiky, omezení, případných dostupných JSON výstupů a odkazu na relevantní PR.
- Pokud se objeví rozpor mezi existujícími reporty a měřením, zaznamenej ho výslovně, nic potichu nepřepisuj.
- Když uživatel žádá postup pro nový chat, odkazuj na `main/docs/PROJECT_CONTEXT.md` a tento `AGENTS.md`, nevyžaduj opakování už zdokumentovaných informací.

## Doplněné odborné podklady
- K meteo statistice čti `STATISTICS_SPEC.md` a `WEEWX_DAILY_SUMMARIES_AUDIT.md`, k průběhu rozhodnutí `DECISIONS.md`.
- Audit `BACKEND_TECHNOLOGY_AUDIT.md` z 30. 10. historicky navrhoval Go. **Současný staging běží na Fastify/TypeScript**, nikoli pouze jako návrh; finální rozhodnutí o produkční architektuře a přepnutí webu zůstává oddělené.

## API v1 – kontrakt z PR #4 (součást main, jednotlivé funkcionality ověřuj dle skutečného kódu)
- Před zahájením implementace API čti `openapi.yaml`, `schemas/weather.schema.json`, `schemas/features.schema.json`, `schemas/metrics.json`, `schemas/aggregation-policy.json` a `docs/API_V1_PRODUCT_CONTRACT.md` (zatím dokumentační kontrakt).
## Pravidlo pro jednotky API v1 (kontrakt z PR #4)
- Zdrojové `usUnits` čti **z každého záznamu**; podporuj pouze 1 (US), 16 (METRIC), 17 (METRICWX), neznámé odmítni, nic nehádaj.
- Query `units=us|metric|metricwx` vybírá **výstupní** jednotky (default metricwx); zdrojový `usUnits` se tím nemění.
- Jednotky pro každou veřejnou veličinu jsou v `schemas/metrics.json`; použij společné golden fixtures a testy konverzí před změnou runtime Fastify/Go/Rust.
- Bez souhlasu nezměň původní WeeWX, SQL schéma, historické měření ani `usUnits` produkční DB. `null` není `0`, nelze slepě převádět teplotní součty.

## Doplněné zadání API v1 (historický PR #4, sloučen do main 1. 11. 2026)
- Povinně čti docs/API_V1_PRODUCT_CONTRACT.md, schemas/aggregation-policy.json a schemas/features.schema.json.
- Nepovoluj libovolné numerické agregace: kontroluj dvojice metric x aggregation a stav zdrojových senzorů.
- Dataset original je výchozí. Approved vyžaduje schválený QC proces. Live a kamera mohou být reálně nedostupné.

## Automatická obnova archivních dat
- Povinně čti [docs/ARCHIVE_REFRESH_CONTRACT.md](docs/ARCHIVE_REFRESH_CONTRACT.md) pro `archive-updated`, `summaryStatus`, deduplikaci, backfill, cache a návrat po výpadku.
- Jeden centrální read-only poller, žádný SQL dotaz per návštěvník, žádný slib přesného času 5min zápisu. Schémata v `schemas/features.schema.json`, referenční model `contracts/archive_refresh.py`, testy `tests/test_archive_refresh.py`.
- Dokud nejsou prokazatelně aktuální `archive_day_*` souhrny, nepublikuj `summaryStatus=ready` ani jejich údajně čerstvé statistiky.

## Průběžný changelog a dokumentace
- Při každé věcné změně doplň `CHANGELOG.md` datem, popisem a případnými omezeními. Aktualizuj související README a `docs/PROJECT_CONTEXT.md`, pokud se změnil stav funkcí nebo provozu.
- Rozlišuj stav zdrojového kódu v `main`, výsledek testů a skutečně ověřenou nasazenou verzi. Neoznačuj návrhové endpointy a nepotvrzené zdroje za hotové.
