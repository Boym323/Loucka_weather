# Loučka Weather

Moderní meteorologický portál pro **https://pocasi-loucka.eu/**. **Stav 31. 10. 2026: návrh a vyhodnocování architektury; nový web ještě není postavený ani nasazený.** Původní WeeWX + Belchertown běží dál.

> **Pro nový chat / Codex / jiné AI:** začni v [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md), následně načti [AGENTS.md](AGENTS.md). Základní dokumenty jsou už v **main**, nikoliv pouze ve větvi benchmarků.

## Návrh řešení (čeká na finální schválení)

- **Frontend:** Astro + TypeScript, grafy ECharts, preferovat statické stránky a kvalitní mobilní UX.
- **Datová vrstva v1:** předběžně **Node.js + Fastify + TypeScript**, po ověření reálného provozu, Matomo a šesti jazyků. Go je alternativou pro náročné historické endpointy, Rust případným dávkovým workerem – **zatím je nenasazovat bez prokázané potřeby**.
- **Zdroje:** Ecowitt GW3000 → stávající WeeWX → historická MariaDB. Aplikace pracuje vůči původní DB **read-only**. Rekonstruované hodnoty spravovat zvlášť přes auditované postupy a jejich provenienci.
- **Datové dotazy:** krátké aktualizace aktuálního počasí; dlouhé historie z cache/agregovaných časových řad; inkrementální přepočítávání dotčených statistik.
- **Živý režim:** sdílený MQTT/WebSocket feed, nikoli opakovaný SQL dotaz pro každý prohlížeč.
- **Provoz:** samostatný staging, Nginx Proxy Manager, ochrana proti automatizovaným skenerům, monitoring latencí a otevřených spojení. Produkční WeeWX a Belchertown ponechat.

## Dokumentace a podklady (31. 10. 2026)

| Dokument | Co obsahuje |
|---|---|
| [Kontext pro AI a nové chaty](docs/PROJECT_CONTEXT.md) | Technologie, původ dat, skutečná data, pracovní stav, otevřené úkoly |
| [ADR – rozhodování Node.js / Go / Rust](docs/ARCHITECTURE_DECISION_2026-10-31.md) | Návrh stacku, výhody/nevýhody, provozní rizika, testy před schválením |
| [Vyměnitelné API – hranice služeb a migrace](docs/API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md) | Oddělení WeeWX / API / Astro, OpenAPI v1, paritní testy, Fastify → Go/Rust, rollback |
| [OpenAPI v1 a audit kompatibility](docs/API_CONTRACT_AUDIT_2026-10-31.md) | Návrh OpenAPI 3.1, 80 sloupců WeeWX, JSON schémata, offline testy a staging Fastify/Go/Rust |
| [Nginx provozní audit](docs/TRAFFIC_AUDIT_2026-10-31.md) | **54 966 HTTP požadavků / 5 logů / ~35 dní**, špičky, roboti, chyby, MQTT |
| [Matomo audit](docs/MATOMO_AUDIT_2026-10-31.md) | Říjen: **216 návštěv**, nejčastější stránky, zařízení, zdroje návštěv |
| [Šestijazyčné benchmarky](docs/BENCHMARK_SYNTHESIS_2026-10-31.md) | 216 HTTP scénářů / 39 096 requestů; 72 offline výpočetních pokusů |
| [Zdroje a reprodukovatelnost](docs/SOURCES_AND_REPRODUCIBILITY.md) | Co je doloženo, co heuristika, omezení, soukromí |
| [Souhrn metrik pro AI (JSON)](docs/data/observations_2026-10-31.json) | Strojově čitelná čísla bez osobních identifikátorů |
| [Počty požadavků po dnech (CSV)](docs/data/traffic_daily_2026-09-27_2026-10-31.csv) | 35 dní provozu bez IP adres |

Výkonnostní implementace, kompletní HTTP reporty a compute benchmark jsou stále ve větvi [`bench/go-rust-python`](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python) a v otevřeném **draft [PR #2](https://github.com/Boym323/Loucka_weather/pull/2)**; nejsou v `main` a nejsou to produkční služby.

## Bezpečnostní zásady

- **Žádné zásahy do původních produkčních meteorologických dat**, žádné plošné čištění či domnělé doplňování chybějících hodnot.
- **Žádné plné load testy na živé MariaDB.** Historický benchmark proti produkci už jednou proběhl omylem – hodnotu `isolated_copy=true` v JSON nelze považovat za důkaz izolace.
- Veřejný repozitář **nesmí obsahovat syrové access logy, osobní IP adresy návštěvníků, interní adresy, přístupové údaje nebo URL kamer**. Publikovány jsou pouze agregáty.
- Chybějící meteodata nejsou `0`; opravené/rekonstruované hodnoty musí být jasně označené a dohledatelné.
- Před prvním nasazením ověřit bezpečnost, read-only přístup aplikace, správnost numeriky, přechody CET/CEST a HTTP/MQTT zátěž na stagingu.

**Pozor:** README před audity uvádělo jako první kandidát datové vrstvy Python. Tento návrh je v roce 2026 nahrazen **pracovní preferencí Node.js/Fastify** popsanou v [ADR](docs/ARCHITECTURE_DECISION_2026-10-31.md), nikoli hotovým schválením.

Před implementací backendu čtěte [API v1 – produktový kontrakt](docs/API_V1_PRODUCT_CONTRACT.md). API je nadále pouze návrh v draft PR #4.

Pětiminutová archivní aktualizace a událost `archive-updated`: [kontrakt obnovy archivu](docs/ARCHIVE_REFRESH_CONTRACT.md) (draft, ne nasazená služba).
