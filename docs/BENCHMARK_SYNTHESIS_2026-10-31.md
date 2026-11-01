# Loučka Weather – syntéza benchmarků šesti jazyků

**Aktualizováno:** 31. 10. 2026. **Stav:** existující měření na LXC a dokumentované omezení, nikoli finální schválení produkčního stacku.

## 1. HTTP/SQL API – tři plné běhy

Šest skutečných HTTP implementací: Go `database/sql`, Rust Axum+SQLx, Python FastAPI+aiomysql+orjson, Node.js Fastify, C++20 libmicrohttpd, PHP CLI+PDO MySQL. Stejné čtyři endpointy: `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`, zátěže 1/10/50, 6 backendů × 4 endpoints × 3 souběžnosti × 3 běhy = **216 scénářů** a **39 096 HTTP requestů bez HTTP chyby**.

| Jazyk | Historie 30 dní, c10 – medián RPS ze tří běhů |
|---|---:|
| **Go** | **31,34** |
| C++20 | 21,80 |
| PHP CLI | 19,89 |
| Node.js | **17,37** |
| Rust | 15,85 |
| Python | 6,05 |

Go vyhrálo test větší historické odpovědi (`30d c10`) ve všech třech bězích: **24,89 / 31,34 / 36,67 RPS**. C++ mělo nejlepší mediány u několika kratších endpointů. Node.js bylo konkurenceschopné u krátkých a středních odpovědí. **Nezobecňovat** `30d` výkon na veškeré API.

**Kritická metodická výhrada:** všechny tři běhy ve skutečnosti běžely proti **produkční MariaDB**, ač JSON chybně uvádělo `db.isolated_copy=true`. `pool_max=3`; scénář `30d c50` odesílal **pouze 24 requestů celkem**, takže **nezměřil reálně 50 současných klientů**. Bez měření DB CPU/IO a dopadu na WeeWX writer nelze tvrdit definitivní bezpečné kapacitní limity. Budoucí plné HTTP stress testy výhradně na **izolovaném lokálním snapshotu**. Roční endpoint používal denní tabulky WeeWX `archive_day_outTemp` a `archive_day_rain` a **netestoval kompletní nové výpočty statistik**.

### Všechna tři originální časová okna
- `benchmark_20261030T205008Z.json`
- `benchmark_20261030T210318Z.json`
- `benchmark_20261030T211154Z.json`

Podrobně: [verifikovaný tříběhový HTTP report](https://github.com/Boym323/Loucka_weather/blob/bench/go-rust-python/benchmark/REAL_LXC_SIX_LANGUAGES_FULL_THREE_RUNS_2026-10-30.md).

## 2. Offline přepočet vlastních statistik – tři režimy

Jde o samostatný **offline** test nativních implementací Go/Rust/Python/Node/C++/PHP. Každý výpočet bere **syntetické lokální** TSV, parsuje do struktury a počítá vlastní denní/měsíční/roční/celohistorické agregace včetně časově vážené teploty/vlhkosti, min/max, intervalových srážek a větru jako vektorů. **Nedotýká se MariaDB, nepoužívá HTTP, čtení disku ani JSON serializace nejsou v měřeném intervalu.**

`smoke`: 288 řádků, `light`: 10 000 řádků, `full`: 105 120 a 1 680 000 řádků. Šest jazyků × (3 + 3 + 6) = **72 individuálních měření, 72/72 PARITY PASS**. Ověření parity znamená vzájemnou numerickou shodu, ne potvrzení všech reálných klimatologických výpočtů.

| Jazyk | 10k řádků ms (medián) | 105 120 řádků ms (medián) | 1,68M řádků s (medián) | 1,68M RSS MiB (medián) |
|---|---:|---:|---:|---:|
| **Rust** | **19,31** | **263,92** | **4,10** | **107,23** |
| Go | 24,09 | 284,89 | 5,26 | 422,54 |
| C++ | 32,20 | 534,18 | 9,13 | 112,32 |
| Node.js | 109,82 | 1 124,36 | **15,36** | 272,25 |
| PHP | 122,80 | 1 012,76 | 19,54 | 304,59 |
| Python | 208,29 | 3 146,99 | 37,82 | 318,69 |

U 1,68M je Rust zhruba **22 % rychlejší než Go** a má cca **čtvrtinovou RSS** oproti Go v těchto konkrétních implementacích; Node.js je **3,7× pomalejší než Rust** a **2,9× pomalejší než Go**, avšak v rámci jednorázového dávkového procesu může být 15,36 s přijatelné. Go má znatelně vyšší RAM než Rust zejména kvůli implementaci parseru a struktur; optimalizace může pořadí změnit.

Záznamy, jejichž metadata uvádí testovací běhy:
- `compute_20261031T070708Z.json` (smoke)
- `compute_20261031T070730Z.json` (light)
- `compute_20261031T071410Z.json` (full)

**Originální tři compute JSON nejsou commitované; výsledky jsou potvrzeny uživatelským stdout.** Podrobný report: [offline šestijazyčný výpočet](https://github.com/Boym323/Loucka_weather/blob/bench/go-rust-python/benchmark/compute/REAL_LXC_OFFLINE_RESULTS_2026-10-31.md). Kód a CI: [compute benchmark](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python/benchmark/compute).

## 3. Co dokazuje produkční reálná návštěvnost

Matomo (216 návštěv/říjen) a NPM (54 966 requestů za 35 dnů) ukazují, že **uživatelská zátěž současného webu je nízká**, ale automatické skenery mohou vytvořit krátké bursty **247 upstream requestů/s**. Tento konkrétní scénář je především věcí Nginx ochrany a levných 404, ne jediné volby backend jazyka. Nevíme počet souběžných MQTT socketů, rychlost skutečných meteorologických zpráv ani dopad na budoucí HTTP API. Nejrychlejší šestijazyčný microbenchmark se tedy **nerovná** nejvhodnější produkční architektuře.

## 4. Rozhodnutí pro vývoj v1

**Pracovní doporučení: Astro + TypeScript + ECharts a Node.js/Fastify API; pro živá data sdílené MQTT/WebSocket; pro historii cache/časové agregace; pro statistiky inkrementální dávkový přepočet.** Go ponechat jako alternativu při vysoké zátěži historických endpointů. Rust lze později vyčlenit pro skutečně náročné rekonstrukce, až pokud optimalizace Node/Go a nové měření na reálné staging DB prokážou přínos. **Není to schválený výběr a není nasazený nový web.**

## 5. Další nutné testy

1. Reálný **lokální** WeeWX export obsahující také validované opravy a jejich provenienci – parita s referenčními meteo metodikami, nejen parita kódu.
2. Srovnat Node vs Go na cache-hit/cache-miss profilech historie, odezvu při 10 souběžných klientech a zátěž CPU/RSS/DB; SQL výlučně na kopii.
3. Při běhu Node benchmarku doplnit p95/p99, event-loop delay, upstream timings, cache hit rate; odděleně simulovat levné 404 bursty.
4. Spočítat reconnect, trvání spojení, současné WS klienty a objem zpráv/s (NPM access log to neposkytuje).
5. Mít jednoznačný postup, jak změna rekonstruovaných záznamů aktualizuje pouze dotčené denní/měsíční/roční agregace.

[Kontext AI](PROJECT_CONTEXT.md) · [ADR](ARCHITECTURE_DECISION_2026-10-31.md) · [NPM audit](TRAFFIC_AUDIT_2026-10-31.md).
