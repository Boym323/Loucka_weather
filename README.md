# Loučka Weather

Moderní meteorologický portál pro **https://pocasi-loucka.eu/**. **Stav ověřený 6. 11. 2026: testovací Astro portál a Fastify API na `dev.pocasi-loucka.eu` prošly veřejným Chromium smoke pro 11 tras / desktop a mobil; na webu byl commit `c8a5ab11`. Není to automatické potvrzení stavu 7. 11. ani přepnutí původního produkčního webu.** Původní WeeWX + Belchertown běží dál.

> **Pro nový chat / Codex / jiné AI:** začni v [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md), následně načti [AGENTS.md](AGENTS.md). Základní dokumenty jsou už v **main**, nikoliv pouze ve větvi benchmarků.

## Návrh řešení (čeká na finální schválení)

- **Frontend:** Astro + TypeScript, grafy ECharts, preferovat statické stránky a kvalitní mobilní UX.
- **Datová vrstva stagingu:** nasazený **Node.js 24 + Fastify + TypeScript**; závěrečné schválení produkční architektury a migrace původního webu zůstává otevřené. Srovnání proběhlo podle reálného provozu, Matomo a šesti jazyků. Go je alternativou pro náročné historické endpointy, Rust případným dávkovým workerem – **zatím je nenasazovat bez prokázané potřeby**.
- **Zdroje:** Ecowitt GW3000 → stávající WeeWX → historická MariaDB. Aplikace pracuje vůči původní DB **read-only**. Rekonstruované hodnoty spravovat zvlášť přes auditované postupy a jejich provenienci.
- **Datové dotazy:** krátké aktualizace aktuálního počasí; dlouhé historie z cache/agregovaných časových řad; inkrementální přepočítávání dotčených statistik.
- **Živý režim:** sdílený MQTT/WebSocket feed, nikoli opakovaný SQL dotaz pro každý prohlížeč.
- **Provoz:** samostatný staging, Nginx Proxy Manager, ochrana proti automatizovaným skenerům, monitoring latencí a otevřených spojení. Produkční WeeWX a Belchertown ponechat.

## Dokumentace a podklady

Změny průběžně zaznamenává [CHANGELOG.md](CHANGELOG.md). Stav funkcí a nevyřešené úkoly jsou ve [frontend/README.md](frontend/README.md).

### Historické audity (31. 10. 2026)

| Dokument | Co obsahuje |
|---|---|
| [Kontext pro AI a nové chaty](docs/PROJECT_CONTEXT.md) | Technologie, původ dat, skutečná data, pracovní stav, otevřené úkoly |
| [ADR – rozhodování Node.js / Go / Rust](docs/ARCHITECTURE_DECISION_2026-10-31.md) | Návrh stacku, výhody/nevýhody, provozní rizika, testy před schválením |
| [Vyměnitelné API – hranice služeb a migrace](docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md) | Oddělení WeeWX / API / Astro, OpenAPI v1, paritní testy, Fastify → Go/Rust, rollback |
| [OpenAPI v1 a audit kompatibility](docs/API_CONTRACT_AUDIT_2026-10-31.md) | Návrh OpenAPI 3.1, katalog WeeWX, JSON schémata, offline testy a staging Fastify/Go/Rust |
| [Nginx provozní audit](docs/TRAFFIC_AUDIT_2026-10-31.md) | **54 966 HTTP požadavků / 5 logů / ~35 dní**, špičky, roboti, chyby, MQTT |
| [Matomo audit](docs/MATOMO_AUDIT_2026-10-31.md) | Říjen: **216 návštěv**, nejčastější stránky, zařízení, zdroje návštěv |
| [Šestijazyčné benchmarky](docs/BENCHMARK_SYNTHESIS_2026-10-31.md) | 216 HTTP scénářů / 39 096 requestů; 72 offline výpočetních pokusů |
| [Zdroje a reprodukovatelnost](docs/SOURCES_AND_REPRODUCIBILITY.md) | Co je doloženo, co heuristika, omezení, soukromí |
| [Souhrn metrik pro AI (JSON)](docs/data/observations_2026-10-31.json) | Strojově čitelná čísla bez osobních identifikátorů |
| [Počty požadavků po dnech (CSV)](docs/data/traffic_daily_2026-09-27_2026-10-31.csv) | 35 dní provozu bez IP adres |

Referenční implementace a reporty šestijazyčného benchmarku jsou v [`benchmark/`](benchmark/) a pocházejí z [PR #2](https://github.com/Boym323/Loucka_weather/pull/2). Nejde o produkční API. **Plný benchmark je blokován bez ověření skutečného cílového DB snapshotu** (samostatné testovací LXC, test-only schéma, unikátní marker na cílovém serveru). Viz [bezpečnostní postup](benchmark/lxc/README.md).

## Bezpečnostní zásady

- **Žádné zásahy do původních produkčních meteorologických dat**, žádné plošné čištění či domnělé doplňování chybějících hodnot.
- **Žádné plné load testy na živé MariaDB.** Historický benchmark proti produkci už jednou proběhl omylem – hodnotu `isolated_copy=true` v JSON nelze považovat za důkaz izolace.
- Veřejný repozitář **nesmí obsahovat syrové access logy, osobní IP adresy návštěvníků, interní adresy, přístupové údaje nebo URL kamer**. Publikovány jsou pouze agregáty.
- Chybějící meteodata nejsou `0`; opravené/rekonstruované hodnoty musí být jasně označené a dohledatelné.
- Před přepnutím **veřejné produkce** ověřit bezpečnost, read-only přístup aplikace, správnost numeriky, CET/CEST a zátěž na stagingu. Staging již běží; úspěšné CI neprokazuje provozní bezpečnost.

**Pozor:** Historické ADR popisuje tehdy předběžnou preferenci Node.js/Fastify; na stagingu již běží. Rozhodnutí o produkční migraci je samostatné a původní WeeWX zůstává bez zásahu.

## Doplňující historické audity a specifikace (PR #1)
- [Rozhodovací log a původní varianty](DECISIONS.md) – historické závěry doplněné o současný pracovní směr Fastify.
- [Audit MariaDB a denních souhrnů](WEEWX_DAILY_SUMMARIES_AUDIT.md) a [pravidla statistik](STATISTICS_SPEC.md) – pro první verzi preferovat L1 archive + L2 archive_day_*, bez L3 zápisů.
- [Původní audit Go backendu](BACKEND_TECHNOLOGY_AUDIT.md) a [komponenty frontendu](FRONTEND_SPEC.md) – metodické podklady, nikoli potvrzené nasazení.

Podrobný [produktový kontrakt API v1](docs/API_V1_PRODUCT_CONTRACT.md) a [pětiminutové archivní aktualizace](docs/ARCHIVE_REFRESH_CONTRACT.md) jsou součástí specifikace. **Testovací API implementuje část kontraktu**; offline kontraktové testy nejsou integračním ověřením všech endpointů.
