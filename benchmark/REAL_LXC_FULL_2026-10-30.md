# Plný HTTP benchmark Go / Rust / Python na LXC proti produkční MariaDB WeeWX

**Datum testu:** 30. 10. 2026  
**Prostředí:** Debian 13 LXC `zl-dev-AuditMeteo`; aplikace běžely pod neprivilegovaným účtem `meteo-bench` (podle dodaného terminálového výstupu)  
**Databáze:** MariaDB `11.8.6-MariaDB-0+deb13u1`, `pocasi-loucka.eu`; přístup přes účet pouze s `SELECT`  
**Příkaz:** `./run.sh full`; 4 endpointy × 3 stupně souběžnosti × 3 jazyky = **36 scénářů**, výsledný stav **PASS**, 0 HTTP chyb, 4/4 shodných odpovědí u každého jazyka  
**Původ důkazů:** uživatelem vložený úplný výpis terminálu. Soubory JSON a serverové logy na jeho LXC **nebyly v rámci této aktualizace přímo staženy ani nezávisle ověřeny**.

## Předběžný závěr

**Pro API v1 doporučit Go**, protože v daném implementačním stacku zpracovalo 30denní historii nejrychleji při souběžnosti 10 (24,32 req/s) a mělo nízkou RAM (cca 12 MiB). Nelze ale prohlásit Go za univerzálního vítěze: **Python vedl v propustnosti malých odpovědí** (`current`, `24h`, `yearly`), zatímco **Rust měl nejnižší zaznamenané RSS** (přibližně 5–8 MiB). Test byl navržen pro čtení dat WeeWX; nejde o benchmark izolované rychlosti programovacích jazyků.

## Nastavení a průběh

- Před testem byl kvůli reálnému limitu `loucka_audit` `max_user_connections=4` snížen **connection pool všech tří serverů z 3 na 1**. Dřívější přechodné HTTP 503 byly způsobeny SQL chybou **1226 (42000), překročený počet spojení**, nikoli prokázanou chybou Rustu.
- `smoke` a následné tři opakované `light` testy po změně poolu skončily PASS bez chyb.
- Při `full` měřeny úrovně **1, 10 a 50 souběžných HTTP požadavků**, vždy s **pouze jedním databázovým spojením**; tři aplikace testovány postupně.
- Kontrolní metadata: `last_epoch=1793390400`, posledních 24 h **288 bodů**, 30 dní **8638 bodů**, za rok 2025 **363 denních souhrnů**.
- `SELECT` dotazy byly read-only. Test neprovedl SQL zápis. **Není k dispozici telemetrie CPU/IO MariaDB ani doby zápisů WeeWX v průběhu testu**, takže nelze doložit nepřítomnost provozního zpomalení.
- Serverovou RSS uvádíme jako `RSS_peak` zaznamenané skriptem; nejde o peak celé databáze nebo LXC.

## Kompletní výsledky

Jednotky: propustnost = **HTTP požadavky/s (RPS)**; p95 = **ms**; RAM = **RSS_peak MiB**. Ve všech níže uvedených měřeních bylo `err=0`.

### Aktuální měření

| Současní HTTP klienti | Go RPS | Go p95 ms | Go RSS MiB | Rust RPS | Rust p95 ms | Rust RSS MiB | Python RPS | Python p95 ms | Python RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 31.13 | 36.08 | 8.89 | 23.62 | 44.50 | 5.14 | 54.19 | 22.05 | 44.44 |
| 10 | 34.94 | 802.27 | 9.16 | 23.77 | 425.08 | 5.24 | 67.28 | 155.03 | 44.48 |
| 50 | 34.85 | 3626.35 | 10.57 | 23.68 | 2117.87 | 6.20 | 64.41 | 1546.95 | 44.56 |

### Historie 24 hodin

| Současní HTTP klienti | Go RPS | Go p95 ms | Go RSS MiB | Rust RPS | Rust p95 ms | Rust RSS MiB | Python RPS | Python p95 ms | Python RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 27.96 | 42.11 | 11.21 | 23.22 | 46.03 | 6.36 | 35.44 | 40.17 | 44.58 |
| 10 | 33.67 | 827.83 | 11.23 | 23.16 | 438.13 | 6.46 | 49.18 | 254.02 | 44.58 |
| 50 | 33.36 | 3269.73 | 11.12 | 23.15 | 2166.83 | 6.91 | 49.22 | 1107.27 | 44.61 |

### Historie 30 dní

| Současní HTTP klienti | Go RPS | Go p95 ms | Go RSS MiB | Rust RPS | Rust p95 ms | Rust RSS MiB | Python RPS | Python p95 ms | Python RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16.00 | 84.12 | 12.22 | 17.07 | 71.61 | 7.80 | 4.85 | 284.51 | 46.79 |
| 10 | 24.32 | 776.99 | 12.19 | 15.84 | 629.60 | 7.80 | 6.81 | 2874.92 | 46.80 |
| 50 | 18.58 | 1201.75 | 12.39 | 16.12 | 1393.18 | 7.86 | 6.09 | 3852.51 | 46.80 |

### Roční souhrn

| Současní HTTP klienti | Go RPS | Go p95 ms | Go RSS MiB | Rust RPS | Rust p95 ms | Rust RSS MiB | Python RPS | Python p95 ms | Python RSS MiB |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 30.51 | 35.77 | 11.61 | 22.91 | 45.15 | 7.86 | 48.68 | 27.84 | 46.80 |
| 10 | 34.31 | 726.05 | 11.61 | 23.48 | 432.35 | 7.88 | 66.34 | 153.92 | 46.80 |
| 50 | 33.80 | 3574.19 | 11.20 | 23.46 | 2134.56 | 7.96 | 65.87 | 756.54 | 46.80 |

## Praktická interpretace

1. **Malé odpovědi:** pro `current` při 10 klientech Python **67,28 RPS**, Go **34,94 RPS**, Rust **23,77 RPS**; pro `yearly` Python **66,34 RPS**, Go **34,31 RPS**, Rust **23,48 RPS**. Python přitom používal řádově více paměti.
2. **Velká časová řada:** `30d`, 10 klientů: Go **24,32 RPS, p95 776,99 ms, RSS 12,19 MiB**; Rust **15,84 RPS, p95 629,60 ms, RSS 7,80 MiB**; Python **6,81 RPS, p95 2874,92 ms, RSS 46,80 MiB**. Go je v propustnosti oproti Rustu asi **1,54×** výše, ale Rust má při daném testu nižší p95.
3. **Fronta při 50 klientech:** protože na server připadá **jediná DB connection**, vysoká p95 (např. Go `current` **3626 ms**, Rust **2118 ms**, Python **1547 ms**) může být dána čekáním na databázové spojení a smíšenou zátěží hostitele/sítě. Nelze to vydávat za maximální kapacitu jazyka či produkční odhad 50 návštěvníků.
4. **Neoptimalizovaná serializace:** Python u 30d vrací objemný JSON. Možné zlepšení: orjson, datové downsampling a cache; stejné optimalizace musí být porovnány spravedlivě u všech jazyků.
5. **Jedno kompletní `full` měření:** opakované `light` testy ověřily stabilitu s poolem=1, ale tento konkrétní `full` test nebyl zopakován v dalších nezávislých bězích. Významná kolísání a vliv SQL cache nejsou úplně charakterizovány.

## Bezpečnost a provozní stav

- Potvrzeno výstupem skriptu: `DB prava: kontrolovana, SELECT-only. Zadny SQL zapis.`, `PASS: vsechny 3 servery konzistentni; zadne SQL mutace.`
- **Důležitá výjimka:** tento `full` běh už **proběhl proti živé produkční MariaDB**, nikoliv izolovanému snapshotu. SQL bylo read-only, ale zátěž čtením mohla ovlivnit WeeWX writer. Není důkaz o zpomalení ani o jeho absenci.
- Běh nebyl ověřován naším přímým měřením DB CPU/IO; při dalším zátěžovém porovnání a pro zvýšení poolu nad 1 používat snapshot.
- Kvůli sdílenému limitu `max_user_connections=4` pro účet `loucka_audit` **nezvyšovat pool** na živé produkci bez zajištění izolace účtu a dohledového monitoringu.

## Dokumentace a provenance

Výsledky byly uloženy na LXC do:
- `/home/meteo-bench/loucka-lxc-benchmark/results/benchmark_20261030T200543Z.json`
- `/home/meteo-bench/loucka-lxc-benchmark/results/benchmark_20261030T200543Z.md`

Tyto cesty jsou **cesty na LXC**, soubory nebyly nahrány jako přílohy do GitHubu. Výpis uživatele je podkladem této zprávy. Syntetické CI měření má oddělený dokument [BENCHMARK_RESULTS_2026-10-30.md](BENCHMARK_RESULTS_2026-10-30.md). Původní lehký test: [REAL_LXC_LIGHT_2026-10-30.md](REAL_LXC_LIGHT_2026-10-30.md), přechodná chyba spojení: [REAL_LXC_LIGHT_REPEAT_FAILURES_2026-10-30.md](REAL_LXC_LIGHT_REPEAT_FAILURES_2026-10-30.md).

## Rozhodnutí pro implementaci

- **Backend v1: předběžná preferovaná volba Go** (`net/http`, `database/sql`, `go-sql-driver/mysql`). U rychlých endpointů může být Python konkurenceschopný a Rust je nejúspornější v RAM; vyšší komplexita Rustu se v tomto rozsahu neukázala jako nutná.
- **Nedělat změny DB kvůli benchmarku.** V API použít existující `archive` a `archive_day_*`, parametrizované SQL, timeouts, validaci rozsahů, cache a automatický downsampling.
- **Další krok není více testů proti živé DB:** implementovat reálné API a jeho testy; provozní limity a bezpečnost ověřovat na staging kopii, případně vysoce omezeným monitorovaným read-only testem.
