# AI / Codex pokyny – Loučka Weather

## Povinný start pro každého nového agenta
1. Přečti [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md).
2. Přečti [docs/API_CONTRACT_AUDIT_2026-10-31.md](docs/API_CONTRACT_AUDIT_2026-10-31.md) a formální návrh [openapi.yaml](openapi.yaml), [schemas/weather.schema.json](schemas/weather.schema.json), [schemas/metrics.json](schemas/metrics.json) (API v1 je zatím jen návrh, benchmarkové servery nejsou kompatibilní).
3. Přečti [docs/ARCHITECTURE_DECISION_2026-10-31.md](docs/ARCHITECTURE_DECISION_2026-10-31.md), [docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md](docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md), [docs/TRAFFIC_AUDIT_2026-10-31.md](docs/TRAFFIC_AUDIT_2026-10-31.md), [docs/MATOMO_AUDIT_2026-10-31.md](docs/MATOMO_AUDIT_2026-10-31.md) a [docs/BENCHMARK_SYNTHESIS_2026-10-31.md](docs/BENCHMARK_SYNTHESIS_2026-10-31.md).
4. Strojově čitelná data: [docs/data/observations_2026-10-31.json](docs/data/observations_2026-10-31.json), [docs/data/traffic_daily_2026-09-27_2026-10-31.csv](docs/data/traffic_daily_2026-09-27_2026-10-31.csv).
5. Benchmark kód je v samostatné větvi `bench/go-rust-python`, návrh [PR #2](https://github.com/Boym323/Loucka_weather/pull/2) **je draft**; nikdy netvrď, že byl merge do main nebo že nový web už běží.
6. Rozlišuj zdrojově ověřené hodnoty, orientační heuristiky, syntetická měření a návrhy. Nikdy netvrď, že benchmark numeriky použil skutečné meteo archive, ani že plné HTTP benchmarky byly na izolované DB.

## Nepřekročitelné meze
- **WeeWX + Belchertown, MariaDB a produkční měření musí zůstat funkční.** Původní `pocasi-loucka.eu.archive` měnit nesmíš. Pro aplikaci je read-only. Správa opravených hodnot patří do `loucka_reconstruction` přes výslovně schválený, auditovatelný proces.
- Neprováděj intenzivní SQL/HTTP benchmark proti produkci. Používej oddělený lokální snapshot.
- Nezveřejňuj privátní IP, osobní údaje návštěvníků, surové NPM logy, přihlašovací údaje, adresy interních hostů ani citlivá URL. GitHub repozitář je **veřejný**.
- Meteorologické konvence: WeeWX `dateTime` je konec intervalu `(start,end]`, lokální kalendář `Europe/Prague`, DST CET/CEST, jednotky `usUnits` (US/METRIC/METRICWX), neměň NULL na nulu, odděluj originální a rekonstruovaná data, počítej úplnost dat.
- Nezaměňuj současnou návštěvnost Matomo s počtem HTTP requestů Nginx, `101` s počtem aktivních websocketů ani `404` automaticky s chybami UX.
- Volba **Node.js/Fastify** je aktuální **pracovní návrh**, nikoli definitivně schválené nebo nasazené řešení.

## Praktický postup v repozitáři
- Před návrhem změny zkontroluj aktuální `main`, otevřené PR a pracovní dokumentaci, abys zbytečně nepřepisoval novější změny.
- API provozuj odděleně od WeeWX (v MVP může běžet jako samostatná služba vedle Astro v novém LXC); frontend musí záviset jen na jazykově nezávislém verzovaném OpenAPI kontraktu, ne na Fastify nebo Go. Při výměně backendu vyžaduj paritní testy, staging a možnost rollbacku.
- Pro Node API nejprve definuj čtecí kontrakty `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`, `/healthz` a jejich bezpečnostní omezení. Využívej cache a agregáty, náročné činnosti mimo HTTP.
- Výsledky nových měření zapisuj do `docs/` včetně data, rozsahu, zdroje, metrik, metodiky, omezení, případných dostupných JSON výstupů a odkazu na relevantní PR.
- Pokud se objeví rozpor mezi existujícími reporty a měřením, zaznamenej ho výslovně, nic potichu nepřepisuj.
- Když uživatel žádá postup pro nový chat, odkazuj na `main/docs/PROJECT_CONTEXT.md` a tento `AGENTS.md`, nevyžaduj opakování už zdokumentovaných informací.
