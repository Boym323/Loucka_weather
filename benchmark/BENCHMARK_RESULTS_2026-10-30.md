# Skutečný benchmark tří HTTP API serverů: Go, Rust, Python

**Datum:** 2026-10-30. **Run:** [GitHub Actions #41110187795](https://github.com/Boym323/Loucka_weather/actions/runs/41110187795) · **závěr CI:** SUCCESS.

## Vstupní metodika

- V GitHub Actions `ubuntu-latest` běžely **tři samostatné HTTP serverové procesy** ve stanoveném pořadí Go → Rust → Python. Každý proces vykonával reálné parametrizované SELECT dotazy proti jedinému dočasnému kontejneru **MariaDB 11.8.9**.
- **Stejná syntetická testovací databáze**: 57 600 archivních řádků (200 dnů × 288 pětiminutových hodnot), 200 denních řádků pro teplotu a srážky. Tato fixture napodobuje některé tabulky WeeWX, ale není úplnou kopií produkční DB a nepokrývá historické změny schématu.
- Nejprve ověřeno, že **všechna čtyři API vracejí stejné JSON hodnoty** napříč jazyky. Následně měřeno 4 endpointy × 3 úrovně concurrency × 3 jazyky = **36 scénářů**; **0 HTTP chyb**.
- Pool každé implementace max. **3 SQL připojení**. Jeden Python HTTPX generátor zatížení, přístup na localhost. Každý endpoint před měřením zahřát 12 požadavky. Počty requestů na scénář: current 300, 24h 150, 30d 24, yearly 250.
- Latence v **milisekundách**, propustnost v požadavcích za sekundu (RPS). CPU jde jen o serverový proces, bez databázového kontejneru. Rust a Go kompilované v CI, Python přes uvicorn/FastAPI.

## Naměřené hodnoty

V tabulkách má každá buňka formát **p95 ms / RPS**. Nižší p95 a vyšší RPS jsou lepší. Hodnoty jsou z jednoho běhu, mezi jazyky mohou hrát roli i rozdíly serializace JSON.

### Poslední měření (`/current`)

| Souběžnost | Go p95 / RPS | Rust p95 / RPS | Python p95 / RPS |
|---:|---:|---:|---:|
| 1 | 1.44 / 743.4 | 1.46 / 719.5 | 1.88 / 588.1 |
| 10 | 37.78 / 523.4 | 38.47 / 494.8 | 32.93 / 490.5 |
| 50 | 287.10 / 449.2 | 270.76 / 442.7 | 298.04 / 428.8 |

### Graf 24 hodin (`/history/24h`)

| Souběžnost | Go p95 / RPS | Rust p95 / RPS | Python p95 / RPS |
|---:|---:|---:|---:|
| 1 | 2.18 / 516.8 | 1.94 / 536.6 | 6.09 / 174.2 |
| 10 | 51.18 / 419.6 | 20.93 / 449.9 | 39.38 / 222.8 |
| 50 | 262.44 / 397.5 | 283.43 / 400.5 | 647.66 / 212.3 |

### Graf 30 dní (`/history/30d`)

| Souběžnost | Go p95 / RPS | Rust p95 / RPS | Python p95 / RPS |
|---:|---:|---:|---:|
| 1 | 9.11 / 119.5 | 17.28 / 73.4 | 112.03 / 9.0 |
| 10 | 75.92 / 200.1 | 86.28 / 129.2 | 2569.32 / 9.1 |
| 50 | 119.24 / 192.4 | 175.20 / 129.5 | 2574.15 / 9.0 |

### Roční agregace (`/statistics/yearly`)

| Souběžnost | Go p95 / RPS | Rust p95 / RPS | Python p95 / RPS |
|---:|---:|---:|---:|
| 1 | 2.06 / 517.1 | 1.92 / 565.5 | 3.13 / 336.5 |
| 10 | 27.58 / 412.2 | 27.81 / 451.5 | 17.59 / 430.9 |
| 50 | 341.78 / 385.6 | 268.87 / 413.6 | 358.23 / 329.4 |

## RAM a sestavení

| Metrika | Go | Rust | Python |
|---|---:|---:|---:|
| Nejvyšší zaznamenané RSS MiB | 17.6 | 57.9 | 55.6 |
| Jednorázová kompilace CI | 11.12 s | 56.36 s | Neprovádí se |

**Metodická výhrada:** RAM se vzorkuje před/po scénáři, ne kontinuálně – tyto hodnoty tedy nejsou přesné absolutní špičky. Build není opakovaná cold/warm studie; Go čas zahrnuje vlastní `go build` po `go mod tidy`, Rust `cargo build --release` s nastavením runneru. Zápisy a běh WeeWX se netestovaly.

## Doplňkový CPU procesový čas

Reálný JSON artefakt `benchmark-results` obsahuje `server_cpu_s` pro každých 36 scénářů. Vybrané příklady z artefaktu:

| Scénář | Go CPU s | Rust CPU s | Python CPU s |
|---|---:|---:|---:|
| current, concurrency 1 | 0.09 | 0.06 | 0.17 |
| history24h, concurrency 1 | 0.12 | 0.09 | 0.63 |
| history30d, concurrency 10 | 0.21 | 0.39 | 2.64 |
| yearly, concurrency 10 | 0.16 | 0.07 | 0.57 |

## Interpretace

- **Go** dosáhlo u 30denního grafu concurrency 10 **200,1 RPS**; Rust **129,2 RPS**, Python **9,1 RPS**. Go vyšlo v tomto konkrétním testu současně s nejnižší zaznamenanou RSS.
- **Rust** vyhrál některé krátké/scénářové testy, zvlášť roční agregaci; výsledek není důkaz, že Rust je obecně pomalejší.
- **Python** s uvedenou implementací FastAPI + aiomysql má výrazně pomalejší serializaci velké JSON časové řady; lze ji optimalizovat `orjson`, streamingem, dávkovým čtením nebo jiným frameworkem. Výsledky nelze vydávat za strop Pythonu.
- Všechny varianty přitom spoléhají hlavně na primární časový index a předpočtené denní souhrny WeeWX. Produkční výkon ovlivní disk, síť LXC ↔ MariaDB, konkrétní schéma a počet návštěvníků.

## Verdikt a omezení

**Doporučení: Go pro první API Loučka Weather.** Výkon a provozní RAM byly u námi implementovaného HTTP+SQL workloadu příznivé. Rust zůstává plnohodnotná alternativa, Python je pro čistý export velkých JSON odpovědí v této implementaci nevýhodný.

**Nebylo provedeno:** test s plnou skutečnou databází 1,68M řádků, měření dopadu na WeeWX writer, síťová latence reálných LXC, srovnání po více nezávislých opakováních, průběžný záznam RSS peak, analytická validace reálné meteorologie. Benchmark tedy slouží jako **evidenčně podložené rozhodnutí pro implementaci v1**, ne jako finální produkční kapacitní test.

**Původní data nezměněna.** Veřejné API nad produkcí bude mít výhradně účet SELECT, správné hranice CET/CEST a limity požadavků. Po nasazení stagingu zopakovat měření proti read-only kopii skutečné databáze, především u dražších filtrů a historie.

## Reprodukce

- [Zdrojové implementace Go/Rust/Python, fixture a benchmark runner](benchmark/README.md)
- [GitHub Actions workflow](.github/workflows/bench-backends.yml)
- [Konkrétní úspěšný běh a JSON artefakt s úplnými výsledky](https://github.com/Boym323/Loucka_weather/actions/runs/41110187795)


## Nezávislé opakování (ověřeno 2026-10-30)

[GitHub Actions run #41110937447](https://github.com/Boym323/Loucka_weather/actions/runs/41110937447) skončil SUCCESS; opět **36/36 scénářů bez HTTP chyb** a stejné odpovědi.

| Jazyk | 30d 10 klientů 1. běh RPS | 2. běh RPS | p95 1. běh ms | p95 2. běh ms |
|---|---:|---:|---:|---:|
| Go | 200.1 | 192.9 | 75.92 | 68.71 |
| Rust | 129.2 | 120.6 | 86.28 | 93.48 |
| Python | 9.1 | 8.8 | 2569.32 | 1833.79 |

Build časy: první běh Go 11.12 s, Rust 56.36 s; druhý Go 11.97 s, Rust 63.12 s. Reprodukovatelné pořadí u tohoto scénáře neznamená prokázanou výhodu ve všech workloadech. Nepokládat dvě měření na sdílených runners za úplnou statistickou studii.

## Samostatné přímé ověření SQL na produkčním WeeWX (read-only)

S použitím Weather MCP a **explicitního** `pocasi-loucka.eu` byly úspěšně otestovány dotazy: poslední řádek `archive`, propojené denní souhrny `archive_day_outTemp` / `archive_day_rain`, časové okno 30d (8638 řádků při zvoleném timestampu) a roční agregace 2025 (363 dennich souhrnů).

To prokazuje reálnou strukturu a použitelnost SQL, **nikoliv** skutečnou latenci Go/Rust/Python nad produkční databází. Měření transportního času přes MCP zahrnuje externí síť/tool overhead a nesmí se zaměňovat za SQL execution time. Další postup: [REAL_DB_VALIDATION_PLAN.md](REAL_DB_VALIDATION_PLAN.md).
