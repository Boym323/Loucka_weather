# Reálný šestijazyčný benchmark nad produkční WeeWX MariaDB – light (2026-10-30)

**Stav:** PASS – 6 HTTP serverů × 4 endpointy = **24 měřených scénářů**; žádné HTTP chyby a 4/4 vzájemně shodných API odpovědí pro každý server. **Žádné SQL mutace**. Test vykonal uživatel na samostatném Debian 13 LXC `zl-dev-AuditMeteo`, nikoliv tento GitHub workflow nebo ChatGPT. Čísla jsou převzata z jeho terminálového výpisu; originální JSON a logy nebyly do repozitáře nahrány.

**Databáze:** MariaDB 11.8.6-MariaDB-0+deb13u1, schéma `pocasi-loucka.eu`, dedikovaný read-only účet `loucka_audit` (limit `max_user_connections=4`). Na produkci je u všech šesti backendů **pool max. 1 DB spojení**. `light` používá 1 současného HTTP klienta, nejedná se o zátěžový test s 10/50 klienty.

**Časový řez:** `BENCH_END_TS=1793392500`, posledních 24 hodin 288 záznamů, posledních 30 dní 8638 záznamů, rok 2025 363 denních agregátů. Všechna měření postupně na stejném LXC a při přibližně stejném stavu dat.

**Zdrojový soubor na LXC (nikoliv součást GitHubu):** `/home/meteo-bench/loucka-lxc-benchmark/results/benchmark_20261030T203925Z.json`; vedle něj `benchmark_20261030T203925Z.md`.

## Kompletní výsledky (RPS / p95 ms / vzorkovaná RSS_peak MiB)

Pro každý řádek `err=0`. RPS čím vyšší, tím lepší; latence p95 a RSS čím nižší, tím lepší.

### Aktuální měření (/current)

| Backend | RPS | p95 [ms] | RSS_peak [MiB] |
|---|---:|---:|---:|
| Go | 29,15 | 35,47 | 6,88 |
| Rust | 23,54 | 45,04 | 5,12 |
| Python | 55,66 | 20,67 | 44,38 |
| Node.js | 43,05 | 28,99 | 74,26 |
| C++ | 59,26 | 18,29 | 13,25 |
| PHP | 13,22 | 80,64 | 52,50 |

### 24 hodin (/history/24h)

| Backend | RPS | p95 [ms] | RSS_peak [MiB] |
|---|---:|---:|---:|
| Go | 30,66 | 34,06 | 7,43 |
| Rust | 23,31 | 43,35 | 5,12 |
| Python | 45,16 | 25,54 | 44,38 |
| Node.js | 37,97 | 34,83 | 76,30 |
| C++ | 53,67 | 20,79 | 13,25 |
| PHP | 12,53 | 85,71 | 51,29 |

### 30 dní (/history/30d)

| Backend | RPS | p95 [ms] | RSS_peak [MiB] |
|---|---:|---:|---:|
| Go | 19,92 | 52,49 | 10,14 |
| Rust | 18,08 | 56,36 | 5,16 |
| Python | 5,98 | 222,25 | 45,35 |
| Node.js | 11,00 | 105,20 | 90,96 |
| C++ | 18,78 | 55,53 | 14,39 |
| PHP | 6,40 | 157,82 | 62,59 |

### Roční agregace (/statistics/yearly)

| Backend | RPS | p95 [ms] | RSS_peak [MiB] |
|---|---:|---:|---:|
| Go | 29,85 | 35,06 | 10,13 |
| Rust | 23,07 | 47,45 | 5,16 |
| Python | 50,08 | 23,61 | 45,35 |
| Node.js | 37,20 | 35,96 | 91,26 |
| C++ | 58,13 | 19,66 | 14,39 |
| PHP | 12,85 | 82,93 | 53,93 |

## Syntéza a důležité výhrady

- **C++20 / libmicrohttpd + MariaDB Connector/C** má nejvyšší propustnost pro `/current` (59,26 RPS), 24 h (53,67 RPS) a roční agregaci (58,13 RPS). V případě `30d` je blízko Go (18,78 vs. 19,92 RPS). RSS zhruba 13–14,4 MiB.
- **Go** vede u největšího JSON `30d` (19,92 RPS, 52,49 ms p95), s RSS 10,14 MiB. Je velmi rozumným kompromisem výkonu a složitosti provozu.
- **Rust** vede v paměťové úspornosti: `30d` zaznamenáno 5,16 MiB RSS; propustnost 18,08 RPS.
- **Python** (FastAPI/aiomysql/orjson) je velmi rychlý u malých odpovědí (55,66 RPS `current`), ale u 30denní historie výrazně zaostává (5,98 RPS).
- **Node.js/Fastify** dosahuje 43,05 RPS u `current`, 11,00 RPS u `30d`, ale spotřeba RAM v tomto testu rostla na cca 91 MiB; TypeScript sám o sobě nebyl samostatně benchmarkován, jde o JS server na Node.
- **PHP** bylo měřeno přes **vestavěný PHP CLI HTTP server**, nikoliv produkčně typické Nginx + PHP-FPM, a vytváří nové PDO připojení na request. Výsledek 13,22 RPS `current` a 6,40 RPS `30d` nelze označit za konečné možnosti optimalizovaného PHP-FPM.

### Omezení statistické interpretace

1. **Jediný `light` běh šesti jazyků.** Reprodukce a opakování zatím nebyly doloženy.
2. `light` pro endpoint `30d` vykoná pouze **3 požadavky na backend**. Z tohoto počtu nelze dobře odhadnout p95 ani stabilitu rozdílů 19,92 vs 18,78 RPS.
3. Všechny servery postupně sdílely jednu skutečnou MariaDB a síť LXC → DB. Mezi měřeními může působit DB page cache, pořadí a zatížení okolních služeb.
4. Srovnávají se **konkrétní implementace** (serializace JSON, HTTP framework, správa spojení), ne základní rychlost jazyka. Například PHP CLI server není srovnatelný s produkčním PHP-FPM a není potvrzená ekvivalence výkonových optimalizací.
5. Z počtu SELECT-only dotazů nelze určit dopad na produkční WeeWX writer; v tomto testu nejsou údaje o DB CPU, IO ani zpoždění zápisů.
6. Nezahrnovat to do průměru s [předchozím plným testem tří jazyků](REAL_LXC_FULL_2026-10-30.md), který měl jiné zatížení a jiné časové okamžiky, ani s [fixture CI testem](BENCHMARK_RESULTS_2026-10-30.md).

## Doporučené další rozhodnutí

**Pro implementaci v1 zůstává preferované Go**. C++ nyní představuje relevantní výkonovou alternativu (rychlé malé odpovědi, podobná 30denní historie), ale vyžaduje odůvodnění složitějšího vývoje, build toolchainu a bezpečnostní údržby. **Neuzavírat finální volbu pouze na základě jednoho `light` běhu.**

Další postup: 3–5 × opakovat `light` při nízké DB zátěži, bez zvyšování DB poolu či souběžnosti na produkci; následně izolovaný snapshot pro `full` 1/10/50 klientů, variabilní pořadí jazyků, stejné podmínky. U PHP odděleně otestovat PHP-FPM s transparentně nastaveným počtem workerů a jeho počtem DB připojení.

**Poznámka k testovací infrastruktuře:** lokální LXC implementace šesti serverů je zdokumentována v [`benchmark/lxc/`](lxc/README.md). Zachovat bezprodukční režim `full`: `BENCH_ISOLATED_DB=YES` jen pro skutečně izolovanou kopii.
