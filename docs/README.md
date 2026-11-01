# Dokumentace Loučka Weather

**Začni tady:** [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) a kořenový [AGENTS.md](../AGENTS.md).

## Audity a rozhodnutí
- [ADR 001 – pracovní volba Astro/TypeScript/Node.js Fastify](ARCHITECTURE_DECISION_2026-10-31.md)
- [Audit funkcí nového webu, webkamery, radaru, senzorů a výstrah](FRONTEND_FEATURES_CAMERA_AUDIT_2026-10-31.md)
- [Návrh vyměnitelného API – OpenAPI kontrakt, provoz vedle Astro, testy a migrace](API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md)
- [OpenAPI v1 – audit sloupců, JSON schémata a testy parity](API_CONTRACT_AUDIT_2026-10-31.md)
- [API v1 – produktový kontrakt, meteorologické výpočty a provoz](API_V1_PRODUCT_CONTRACT.md)
- [Detekce 5min archivu a SSE archive-updated](ARCHIVE_REFRESH_CONTRACT.md)
- [Nginx Proxy Manager – 54 966 HTTP událostí a špičky](TRAFFIC_AUDIT_2026-10-31.md)
- [Matomo – návštěvnost říjen 2026 a trend](MATOMO_AUDIT_2026-10-31.md)
- [Benchmarky Go, Rust, Python, Node.js, C++ a PHP](BENCHMARK_SYNTHESIS_2026-10-31.md)
- [Metodika, zdroje a omezení](SOURCES_AND_REPRODUCIBILITY.md)

## Strojově čitelná data
- [Agregované metriky v JSON](data/observations_2026-10-31.json)
- [Denní HTTP požadavky v CSV](data/traffic_daily_2026-09-27_2026-10-31.csv)

## Kód benchmarků
- [`bench/go-rust-python`](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python)
- [Draft PR #2](https://github.com/Boym323/Loucka_weather/pull/2)

**Pravidlo:** Nezveřejňovat raw HTTP logy, IP adresy ani tajné údaje. Neměnit originální meteorologickou databázi. Nespouštět plné zátěžové benchmarky na produkční DB.
