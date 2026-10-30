# Tři ověřené šestijazyčné FULL benchmarky – produkční WeeWX MariaDB (2026-10-30)

**Podklad:** první dva originální JSON z `loucka-full-6x3(1).zip` (`benchmark_20261030T205008Z.json`, `benchmark_20261030T210318Z.json`), třetí samostatně dodaný `benchmark_20261030T211154Z.json`. Všechny byly lokálně strojově validovány.

## Ověřený rozsah a omezení

- **3 kompletní běhy × 72 scénářů = 216/216 PASS**, **39 096 úspěšných HTTP požadavků, 0 chyb**. Šest backendů, čtyři endpointy, omezení souběžnosti 1/10/50.
- MariaDB **11.8.6**, schéma `pocasi-loucka.eu`, 24h 288, 30d 8 638 záznamů, 2025 363 denních statistik; `pool_max="3"` a `cpu_count=2` ve všech JSON.
- `end_ts` ve třech souborech: `1793392800`, `1793393700`, `1793394300` – živá data a zatížení DB se mohla mezi běhy změnit.
- **Nesprávná metadata:** všechna JSON mají `db.isolated_copy=true`, ale uživatel výslovně potvrdil **živou produkční MariaDB**. Příznak `BENCH_ISOLATED_DB=YES` není důkazem fyzické izolace; další `full` by neměl běžet proti produkci.
- Pro `30d` se na každou kombinaci odesílá pouze **24 requestů**. `c=50` v této větvi znamená **nejvýše 24 skutečně aktivních požadavků**, nikoliv ověření 50 současných 30denních exportů. Kvůli 24 requestům jsou p95/p99 málo stabilní.
- Tabulky uvádějí **medián ze tří hodnot**. Medián p95 ze tří běhů **není** totéž jako pooled p95 ze všech jednotlivých latencí. Nejsou k dispozici skutečné per-request časy, telemetrie DB CPU/IO ani vliv na WeeWX writer.
- Fixní pořadí serverů Go → Rust → Python → Node.js → C++ → PHP; DB cache a okolní produkční provoz mohly pořadí či hodnoty zkreslit. Přímé srovnání je specifické pro implementace, SQL/JSON a použité DB klienty, nikoli obecnou rychlost jazyka.

## Propustnost RPS: medián tří běhů (vyšší = lepší)

| Endpoint | c | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| `current` | 1 | 31,22 | 23,24 | 48,52 | 48,39 | 55,60 | 12,92 |
| `current` | 10 | 103,46 | 23,63 | 138,86 | 158,24 | 195,34 | 55,38 |
| `current` | 50 | 76,40 | 23,35 | 107,26 | 117,97 | 140,22 | 55,60 |
| `24h` | 1 | 26,15 | 22,89 | 35,31 | 41,71 | 39,60 | 12,63 |
| `24h` | 10 | 97,29 | 22,89 | 66,82 | 131,41 | 142,80 | 53,77 |
| `24h` | 50 | 78,21 | 22,88 | 67,80 | 88,63 | 92,47 | 53,13 |
| `30d` | 1 | 15,01 | 15,30 | 5,84 | 15,21 | 13,11 | 6,15 |
| `30d` | 10 | 31,34 | 15,85 | 6,05 | 17,37 | 21,80 | 19,89 |
| `30d` | 50 | 28,31 | 15,36 | 5,19 | 32,05 | 22,51 | 18,70 |
| `yearly` | 1 | 29,44 | 23,18 | 46,74 | 42,16 | 49,62 | 12,10 |
| `yearly` | 10 | 97,91 | 23,36 | 175,64 | 141,01 | 178,37 | 54,52 |
| `yearly` | 50 | 71,46 | 23,26 | 96,65 | 92,45 | 118,44 | 54,28 |

## Latence p95 [ms]: medián tří samostatných p95 (nižší = lepší)

| Endpoint | c | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| `current` | 1 | 36,81 | 47,42 | 29,67 | 29,16 | 23,00 | 86,29 |
| `current` | 10 | 209,83 | 438,45 | 137,26 | 110,61 | 75,61 | 205,42 |
| `current` | 50 | 1672,88 | 2157,69 | 1209,05 | 1154,23 | 908,17 | 982,73 |
| `24h` | 1 | 47,41 | 49,63 | 45,17 | 35,36 | 33,25 | 90,75 |
| `24h` | 10 | 214,10 | 461,48 | 258,70 | 127,97 | 117,24 | 218,78 |
| `24h` | 50 | 1270,24 | 2181,07 | 1535,49 | 1201,41 | 990,12 | 947,68 |
| `30d` | 1 | 98,21 | 70,17 | 307,82 | 103,85 | 120,79 | 179,10 |
| `30d` | 10 | 498,13 | 657,32 | 2182,32 | 619,19 | 571,55 | 880,31 |
| `30d` | 50 | 822,32 | 1456,53 | 4606,76 | 697,93 | 1041,68 | 1108,13 |
| `yearly` | 1 | 42,65 | 47,85 | 29,93 | 32,20 | 27,43 | 90,37 |
| `yearly` | 10 | 216,14 | 449,54 | 90,29 | 121,45 | 93,04 | 219,39 |
| `yearly` | 50 | 1560,78 | 2166,81 | 1220,72 | 1374,54 | 1093,21 | 1184,62 |

## Historie 30d při c=10 – jednotlivé běhy

| Jazyk | 1. běh | 2. běh | 3. běh | Medián RPS | CV RPS |
|---|---:|---:|---:|---:|---:|
| Go | 24,89 | 31,34 | 36,67 | **31,34** | 19,05 % |
| C++ | 21,36 | 21,80 | 24,23 | **21,80** | 6,88 % |
| PHP CLI | 22,65 | 13,99 | 19,89 | **19,89** | 23,48 % |
| Node.js | 16,29 | 22,21 | 17,37 | **17,37** | 16,93 % |
| Rust | 16,03 | 15,85 | 11,72 | **15,85** | 16,78 % |
| Python | 6,05 | 6,97 | 5,37 | **6,05** | 13,10 % |

Go zvítězilo v **každém ze tří** měření `30d c=10`, ale rostoucí RPS napříč běhy naznačuje, že podmínky nemusely být zcela identické. Výsledky C++ jsou v tomto scénáři stabilnější.

## Paměť: maximum vzorkované RSS v jakémkoliv ze tří běhů

| Backend | Max RSS [MiB] |
|---|---:|
| Rust | **8,48** |
| Go | 14,53 |
| Python | 49,79 |
| PHP CLI | 81,34 |
| C++ | 94,04 |
| Node.js | 120,46 |

RSS zahrnuje testovací HTTP proces a potomky, nikoli MariaDB. PHP běželo jako CLI HTTP server se třemi workery, nikoliv přes PHP-FPM; CPU seconds v runneru měří primárně rodiče a nelze je u PHP přímo porovnávat s ostatními bez korekce.

## Syntéza

- **Go:** medián `30d c10` **31,34 RPS**, p95 **498,13 ms**, maximální RSS **14,53 MiB**; konzistentní vítěz velké historie při c10, rozumný provozní kompromis.
- **C++:** nejvyšší medián RPS u `current c10` **195,34**, `24h c10` **142,80** a `yearly c10` **178,37**. Při mnoha 30d exportech RSS až 94,04 MiB; neprokázaný memory leak, vyžaduje profilování.
- **Node.js:** nejvyšší medián `30d c50` **32,05 RPS**, ale z omezených 24 requestů; jednotlivé běhy **37,31 / 22,28 / 32,05**.
- **Rust:** minimální RAM, avšak třetí běh u některých endpointů znatelně zpomalil; bez telemetrie neznáme příčinu.
- **Python:** rychlý na krátkých odpovědích, pomalý na serializaci 8 638 bodů při `30d c10` (medián **6,05 RPS**).
- **PHP CLI:** medián `30d c10` **19,89 RPS**; není to reprezentativní produkční PHP-FPM benchmark.

**Pracovní doporučení:** pro API v1 zůstává **Go** nejvyváženější volbou, C++ vhodný kandidát pro úzké výkonově kritické části a Rust pro mimořádně paměťově omezené provozy. Ještě nejde o definitivní kapacitní výsledek. Následující benchmark pouze na fyzicky izolované kopii DB, opravit `30d` počty (>50) a monitorovat DB CPU/I/O a latenci zápisů.

## Související historie

- [Analýza prvních dvou full běhů](REAL_LXC_SIX_LANGUAGES_FULL_TWO_RUNS_2026-10-30.md)
- [Detail prvního full běhu](REAL_LXC_SIX_LANGUAGES_FULL_2026-10-30.md)
- [Původní light benchmark](REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md)
