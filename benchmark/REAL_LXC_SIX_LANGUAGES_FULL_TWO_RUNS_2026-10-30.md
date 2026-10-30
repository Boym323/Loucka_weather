# Rozbor 2 plných benchmarků šesti backendů nad skutečnou MariaDB (30. října 2026)

## Původ a validace

Podklady: **skutečný uživatelem nahraný** archiv `loucka-full-6x3(1).zip`, obsahující přesně **2** JSON soubory `benchmark_20261030T205008Z.json` a `benchmark_20261030T210318Z.json`. Originální soubory zůstaly mimo GitHub; toto je ověřený analytický přepis. Třetí běh v ZIP **není**.

- Každý běh obsahuje **72 jedinečných scénářů**, celkem tedy **144/144 PASS**; **26 064 úspěšných HTTP požadavků, 0 chyb**.
- Ve všech šesti serverech bylo před měřením ověřeno 4/4 shodných endpointů. Database MariaDB `11.8.6-MariaDB-0+deb13u1`, schéma `pocasi-loucka.eu`, 8 638 bodů za 30 dní, 363 denních souhrnů za rok 2025.
- Oba záznamy uvádějí `environment.pool_max="3"`, `environment.cpu_count=2`. **Metadata `db.isolated_copy=true` jsou chybně nastavená**: uživatel výslovně potvrdil, že oba testy běžely proti **živé produkční MariaDB**, nikoliv jejímu snapshotu. Ochranný příznak `BENCH_ISOLATED_DB=YES` není skutečný důkaz izolace.
- `end_ts` se mezi běhy změnilo (`1793392800` vs `1793393700`). Měření nejsou laboratorně identická a produkční zatížení DB nebylo monitorováno.
- Jeden scénář `current` poslal 300 requestů, `24h` 150, `30d` **24** a `yearly` 250; pro každou hodnotu concurrency zvlášť.

## Průměr RPS ze dvou běhů (vyšší je lepší)

**Aritmetický průměr dvou naměřených RPS**, nikoliv garantovaná produkční propustnost.

| Endpoint | Souběžnost | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 1 | 31,30 | 23,38 | 49,82 | 46,38 | 51,38 | 12,41 |
| current | 10 | 103,70 | 23,65 | 152,02 | 128,47 | 164,51 | 54,59 |
| current | 50 | 87,72 | 23,39 | 100,63 | 91,78 | 122,32 | 54,08 |
| 24h | 1 | 26,79 | 23,01 | 35,66 | 36,14 | 42,45 | 12,35 |
| 24h | 10 | 97,79 | 22,97 | 79,79 | 115,19 | 161,62 | 53,40 |
| 24h | 50 | 82,14 | 22,25 | 66,61 | 107,13 | 88,50 | 52,02 |
| 30d | 1 | 14,34 | 16,52 | 5,27 | 13,20 | 12,72 | 5,66 |
| 30d | 10 | 28,12 | 15,94 | 6,51 | 19,25 | 21,58 | 18,32 |
| 30d | 50 | 27,28 | 15,69 | 5,60 | 29,80 | 27,53 | 19,50 |
| yearly | 1 | 29,65 | 23,25 | 44,49 | 38,39 | 48,62 | 12,19 |
| yearly | 10 | 98,48 | 23,40 | 162,09 | 146,13 | 160,33 | 53,49 |
| yearly | 50 | 76,50 | 23,31 | 94,74 | 89,74 | 116,97 | 53,06 |

## Průměr ze dvou p95 latencí v milisekundách (nižší je lepší)

Jde o **průměr dvou samostatně spočtených p95**, nikoliv o p95 ze všech spojených HTTP requestů.

| Endpoint | Souběžnost | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 1 | 36,36 | 47,25 | 27,93 | 30,92 | 26,69 | 94,07 |
| current | 10 | 201,44 | 436,88 | 128,27 | 151,84 | 114,10 | 207,28 |
| current | 50 | 1509,21 | 2155,32 | 1324,17 | 1495,29 | 1020,38 | 985,51 |
| 24h | 1 | 45,40 | 48,61 | 43,13 | 42,80 | 33,38 | 95,80 |
| 24h | 10 | 208,21 | 455,57 | 221,39 | 162,57 | 98,01 | 207,70 |
| 24h | 50 | 1454,88 | 2287,93 | 1641,59 | 1061,79 | 1131,20 | 1352,98 |
| 30d | 1 | 101,51 | 66,41 | 309,32 | 116,08 | 107,87 | 211,64 |
| 30d | 10 | 499,71 | 644,72 | 2111,23 | 563,76 | 562,23 | 1068,63 |
| 30d | 50 | 850,23 | 1429,81 | 4283,48 | 815,45 | 874,28 | 1073,11 |
| yearly | 1 | 41,09 | 47,75 | 32,72 | 36,46 | 27,56 | 103,59 |
| yearly | 10 | 215,50 | 442,98 | 105,20 | 118,55 | 99,30 | 232,93 |
| yearly | 50 | 1466,65 | 2154,60 | 1342,75 | 1451,33 | 1079,10 | 1238,52 |

## Rozsah RAM

| Jazyk | Maximum RSS 1. běh (MiB) | Maximum RSS 2. běh (MiB) | Nejvyšší z obou (MiB) |
|---|---:|---:|---:|
| Rust | 7,70 | 8,48 | **8,48** |
| Go | 14,47 | 14,00 | **14,47** |
| Python | 49,59 | 49,38 | **49,59** |
| PHP CLI | 81,28 | 80,31 | **81,28** |
| C++ | 94,04 | 91,02 | **94,04** |
| Node.js | 114,23 | 120,46 | **120,46** |

RSS je vzorkovaná paměť serverového procesu a potomků (ne databáze); CPU metrika runneru se primárně vztahuje na rodičovský proces a nelze ji bez další korekce porovnávat s PHP workery.

## Důležité jednotlivé výsledky a variabilita

- `30d, c=10`: **Go 24,89 → 31,34 RPS** (průměr **28,12**), před C++ (**21,36 → 21,80**), Node.js (**16,29 → 22,21**), Rust (**16,03 → 15,85**), PHP (**22,65 → 13,99**) a Pythonem (**6,05 → 6,97**). Go je první v **obou** bězích.
- `24h, c=10`: **C++ 180,43 → 142,80 RPS**, první v obou bězích; Go **98,28 → 97,29**, Node.js **131,41 → 98,96**.
- `30d, c=50`: první běh Node.js **37,31 RPS**, C++ **21,23**, Go **26,24**; druhý běh C++ **33,82**, Go **28,31**, Node.js **22,28**. Pořadí Node.js/C++ se obrátilo; jeden rychlý výsledek Node.js není stabilně potvrzený.
- Další vysoké kolísání: Node.js `current c=50` **117,97 → 65,59 RPS**, C++ `current c=50` **156,83 → 87,81**, C++ `yearly c=10` **200,84 → 119,82**.
- Rust v obou bězích měřil nejnižší paměťovou zátěž, i když nebyl nejrychlejší při více současných klientech.

### Metodická chyba: 30 dní, `c=50`

Runner nastavuje `concurrency=50`, ale pro `30d` spouští **celkem jen 24 HTTP požadavků**. V dané metodice tedy skutečná souběžnost nemohla překročit 24 aktivních requestů. Výsledek nelze označovat jako ověření **50 souběžných odpovědí s 8 638 datovými body**. Vzorek 24 requestů je také malý pro stabilní p95/p99.

## Verdikt a bezpečnost

**Go je stále vhodná preferovaná volba v1** kvůli vyváženému výkonu dlouhých časových řad, nízké RAM a jednodušší údržbě. C++ je velmi silné u krátkých dotazů, Node.js umí v některých scénářích dobře škálovat, ale více kolísá a využívá více RAM; Rust je nejúspornější. Srovnávají se **konkrétní implementace**, ne rychlost jazyka jako takového. PHP je měřené přes **PHP CLI**, ne PHP-FPM.

**Nejde o definitivní rozhodnutí:** pouze dva kompletní běhy na produkční DB s pool=3, bez telemetrie DB CPU/IO a zápisové latence WeeWX. `SELECT` zaručuje, že test nedělal SQL mutace, nikoliv že nijak nezatížil živou DB. **Další `full` proti produkci nedoporučujeme**; pro validní kapacitní test připravit samostatný snapshot, opravit počet `30d` požadavků na ≥100, střídání pořadí serverů a opakování s monitoringem.

## Související dokumenty

- [Detail prvního běhu](REAL_LXC_SIX_LANGUAGES_FULL_2026-10-30.md)
- [Lehký šestijazyčný test](REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md)
- [Zdrojový LXC runner](lxc/benchmark.py)
