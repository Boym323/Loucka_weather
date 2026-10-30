# Loučka Weather

Nový meteorologický portál pro https://pocasi-loucka.eu/ – **návrhová fáze**.

Tento repozitář se inicializuje dokumentací; zatím **neobsahuje běžící web** ani automatizované změny produkce.

## Směr projektu
- Ecowitt GW3000 a stávající WeeWX zůstávají sběrnou vrstvou.
- Stávající MariaDB s historickými daty zůstává; původní archiv je bez zásahů.
- Web: Astro + TypeScript; grafy ECharts; statický build mimo produkci.
- Oddělené read-only API nad stávající MariaDB: **pro v1 preferováno Go** na základě [skutečného LXC benchmarku](benchmark/REAL_LXC_FULL_2026-10-30.md) a [syntetického CI benchmarku](benchmark/BENCHMARK_RESULTS_2026-10-30.md). Rust a Python zůstávají podložené alternativy; produkční API ještě není implementováno.
- Tři LXC: stávající WeeWX, MariaDB a nový frontend + datová vrstva.
- Nový web nejprve pouze na stagingu. Produkční Belchertown zůstává dostupný.

Rozpracovaná specifikace bude ve větvi `docs/frontend-audit-v1`. Rozhodnutí s otevřenými variantami je třeba odsouhlasit před implementací.

## Zásadní bezpečnostní pravidla
- Žádné zápisy do produkčních databází ani změny WeeWX bez výslovného schválení.
- Nevystavovat přihlašovací údaje, interní adresy ani kamerová URL.
- Nepokládat chybějící měření za 0, nevydávat rekonstruované hodnoty za původní.

## Ověření backendu (30. 10. 2026)

Na testovacím LXC `zl-dev-AuditMeteo` byly spuštěny Go, Rust a Python servery proti **živé produkční MariaDB WeeWX 11.8.6** s účtem pouze `SELECT`. `./run.sh full`: 36/36 scénářů, 0 HTTP chyb, shodné výsledky endpointů. Pool každého serveru omezen na **1 spojení** kvůli účtovému limitu `max_user_connections=4`. U historie 30 dní / 10 klientů: Go 24,32 RPS, Rust 15,84 RPS, Python 6,81 RPS; Python vycházel lépe u malých odpovědí, Rust měl nejnižší RSS. Číselné výsledky pocházejí z terminálového výpisu, nikoliv ze stažených souborů LXC. Nejde o potvrzení nulového vlivu na WeeWX writer ani maximální výkon při 50 klientských spojeních.

[Úplný report z reálného LXC](benchmark/REAL_LXC_FULL_2026-10-30.md) · [Benchmarkové PR #2](https://github.com/Boym323/Loucka_weather/pull/2)
