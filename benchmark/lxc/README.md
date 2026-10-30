# Benchmark šesti HTTP backendů pro Počasí Loučka (Debian 13 LXC)

Obsahuje **šest skutečně běžících HTTP serverů**: Go + database/sql, Rust + Axum + SQLx, Python + FastAPI + aiomysql + orjson, Node.js + Fastify, C++20 + libmicrohttpd a PHP CLI + PDO MySQL. Všechny používají stejná SQL nad skutečným schématem WeeWX `archive` a `archive_day_outTemp` + `archive_day_rain`. Nejde o simulaci HTTP ani SQL.

**Zásadní pravidlo:** na produkční MariaDB pouze `probe`, `smoke` a mírný `light`; **`full` pouze proti izolované kopii na samostatném testovacím LXC**. Žádné zápisy do původního archivu a žádné změny WeeWX konfigurace. Nikdy nespouštěj buildy na produkčním LXC, které sbírá počasí nebo hostuje MariaDB.

## 1. Na samostatném TESTOVACÍM Debian 13 LXC

Doporučeno alespoň 2 vCPU, 4 GiB RAM (kompilace Rust), 10 GiB volného disku včetně případného snapshotu. Bez Dockeru, bez zásahů do produkčních služeb.

```bash
# nejprve přenes ZIP do domovského adresáře běžného uživatele na TESTOVACÍM LXC
unzip loucka-lxc-benchmark.zip
cd loucka-lxc-benchmark
sudo ./run.sh install
cp config.example.env config.env
chmod 600 config.env
nano config.env
```

Do config.env doplň pouze databázový účet s právy `SELECT` na produkční schéma `pocasi-loucka.eu`. **Nepoužívej uživatele, pod kterým zapisuje WeeWX, ani root MariaDB.** LXC potřebuje TCP přístup k databázi na portu 3306 (neotvírat databázi do internetu). Heslo se neukládá do výstupů.

Skript sám běží **jako běžný neprivilegovaný uživatel**, pouze `install` a `create-local-snapshot.sh` používají root pro izolované testovací LXC.

## 2. Bezpečné ověření funkčnosti proti skutečné MariaDB

```bash
./run.sh probe
./run.sh smoke
./run.sh light
```

- `probe` – jen jednoduché SELECT, kontrola názvu schématu, potřebných tabulek, počtu bodů a **SHOW GRANTS**; odmítne účet s INSERT/UPDATE/DELETE/DDL.
- `smoke` – sestaví všech šest serverů, spustí je jednotlivě na `127.0.0.1:18121`, ověří JSON a shodu všech čtyř endpointů. Srovnání používá pevný `BENCH_END_TS`, aby se nově zapisovaná data během testu neposunovala.
- `light` – 1 souběžný klient, velmi malé počty požadavků: 20 current, 10×24h, 3×30d, 10×yearly na server. Nenahrazuje plný benchmark a ani ten nulovou zátěž nezaručuje.

Rozsah historie 30 dní obvykle obsahuje okolo 8 600 bodů. Roční statistika bere souhrny pro kalendářní rok `BENCH_YEAR` (výchozí 2025), s hranicemi v `Europe/Prague` (správně DST).

## 3. Volitelná kopie na TESTOVACÍM LXC – teprve pak plný test

Nejbezpečnější je samostatná MariaDB na jiném testovacím LXC než databáze WeeWX. Nainstaluj **jen na testovacím LXC** `mariadb-server mariadb-client openssl` a ověř lokální službu. Pro úplnou kopii je k dispozici **záměrně opt-in** skript `create-local-snapshot.sh`: vytvoří výhradně nové lokální schéma `weewx_bench_snapshot`, bez přepsání jakéhokoli existujícího, použije streamované `mariadb-dump --single-transaction --quick --skip-lock-tables` a vytvoří lokální `SELECT` účet. Zdrojový dump je pouze pro čtení. I tak je nutné kopírování naplánovat s ohledem na I/O zátěž produkční databáze.

```bash
# OPRAVDU jen na samostatném testovacím LXC s jeho vlastním MariaDB
sudo apt install mariadb-server mariadb-client openssl
sudo CONFIRM_ISOLATED_TEST_LXC=YES ./create-local-snapshot.sh
BENCH_CONFIG=config.snapshot.env ./run.sh full
```

**Pozor:** příkaz sudo typicky zachová jen některé proměnné; `CONFIRM_ISOLATED_TEST_LXC=YES` předává explicitně, bez proměnné kopírování odmítne. `config.env` musí být existující a s validním SELECT-only přístupem ke zdroji. Kopírování neprováděj na existujícím MariaDB LXC – pro test je určený **jiný** kontejner.

Pokud již máš samostatnou konzistentní kopii MariaDB, nic nedumpuj: vytvoř SELECT-only účet a vlastní `config.snapshot.env` s `BENCH_ISOLATED_DB='YES'` a spusť plný test přímo.

## 4. Co se měří

Stejný SQL obsah a stejné JSON výsledky; proti produkci maximálně **jedno** DB spojení na běžící server (izolovaný snapshot může použít jiný, shodný pool):

| Endpoint | Zdroj | Poznámka |
|---|---|---|
| `/current` | `archive` | poslední řádek k pevně stanovenému času |
| `/history/24h` | `archive` | pevné okno 24 hodin |
| `/history/30d` | `archive` | pevné okno 30 dní |
| `/statistics/yearly` | `archive_day_outTemp` + `archive_day_rain` | jeden dotaz přes rok a standardní lokální hranice |

`full` měří všechny endpointy pro souběžnost 1, 10 a 50 klientů a zapisuje JSON i Markdown do `results/` (RPS, p50/p95/p99, CPU sekundy procesu, špičková vzorkovaná RSS). Všech šest serverů proběhne postupně; při chybě nebo odlišné odpovědi skončí s nonzero exit statusem. Odpovědi HTTP se nevracejí do veřejného internetu, jen localhost port 18121.

## 5. Metodická omezení

- Porovnání provozu konkrétních implementací, **nikoli** univerzální rychlosti programovacích jazyků.
- Lokální MariaDB na stejném LXC má jinou síťovou a I/O charakteristiku než oddělený DB LXC. Je to zátěžový staging test, nikoliv přesná simulace produkce.
- Python používá rychlejší `orjson`, Rust typované `serde` struktury (oproti prvnímu GitHub Actions benchmarku) – nelze přímo porovnávat čísla s předchozím CI během.
- Veřejné API bude v praxi potřebovat více endpointů, stránkování, rate limiting a cache; benchmark záměrně cache nemá.
- Měření opakuj vícekrát, ideálně alespoň 5×, a zaznamenej zároveň CPU/IO testovací MariaDB, RSS a CPU LXC.
- `archive.dateTime` je stále `INT(11)` – řešit rok 2038 samostatně, nikoliv během benchmarku.

## 6. Výsledky a sdílení

Výstupy `results/benchmark_*.json` a `results/benchmark_*.md` můžeš poslat sem do chatu. **Neposílej `config.env`, `config.snapshot.env` ani žádná hesla.** Výsledkový report úmyslně neobsahuje host, uživatelské jméno ani heslo. Před sdílením zkontroluj také logy (`results/go.log`, `results/rust.log`, `results/python.log`), pokud obsahují informace o infrastruktuře.


## Rozšíření na 6 technologií (2026-10-30)

Go (standard net/http), Rust (Axum), Python (FastAPI + orjson), Node.js/TypeScript-ekosystém (Fastify + MariaDB connector, implementace .mjs), C++20 (libmicrohttpd + MariaDB C), PHP 8 (CLI HTTP test-server + PDO MySQL). Všechny mají stejné 4 endpointy a explicitní epochové časové hranice. PHP CLI server je **pouze testovací prostředí**, nelze jeho latenci zobecnit na PHP-FPM. U PHP se používá 1 worker proti živé DB a až 3 workery při izolovaném testu.

Před prvním spuštěním aktualizace: jako root jednou `sudo ./run.sh install`, už jako meteo-bench `./run.sh smoke` a `./run.sh light`. Pro ověření jen nových serverů můžeš použít `BENCH_LANGUAGES='go,node,cpp,php' ./run.sh smoke`. Režim `full` je nadále blokován, pokud `BENCH_ISOLATED_DB` není `YES`; nepřepisuj flag kvůli produkční MariaDB.

Spuštění vytváří logy v `results/` a report JSON/MD. **Žádná výkonnostní čísla nových tří jazyků zatím nejsou změřena.** Sleduje se RSS HTTP procesu včetně PHP workerů; procesorový čas je zatím pouze rodičovského procesu, u PHP není vhodný pro přímé srovnání.


## Výsledky šesti backendů – skutečný LXC test 2026-10-30

Uživatel na `zl-dev-AuditMeteo` spustil `./run.sh light` nad skutečnou MariaDB 11.8.6 (jen SELECT, pool=1, concurrency=1). **Všech 24 scénářů PASS**, žádná HTTP chyba, 4/4 shodné odpovědi u všech šesti serverů. 30denní historie, 8 638 bodů: Go **19,92 RPS**, Rust **18,08**, C++ **18,78**, Node.js **11,00**, PHP CLI **6,40**, Python **5,98**. Malé odpovědi vedlo C++ (např. `current` **59,26 RPS**); nejnižší RAM měl Rust (cca **5,16 MiB** při 30 dnech). **Úplná tabulka všech endpointů, p95, RSS a omezení:** [REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md](../REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md).

**Důležité:** `light` má pro 30denní historii jen 3 měřené requesty na backend; p95 i jemné rozdíly nejsou statisticky spolehlivé. PHP CLI je vývojový HTTP server, ne PHP-FPM. Pro `full` stále používat izolovaný DB snapshot. Do `main` tuto větev zatím neslučovat bez dalšího ověření.
