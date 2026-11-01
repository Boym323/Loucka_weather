# Srovnávací benchmark Go / Rust / Python nad MariaDB

**Tento adresář obsahuje dvě odlišná měření:** zde popsaný GitHub Actions benchmark používá syntetickou MariaDB. Vedle něj proběhlo samostatné **reálné měření Go/Rust/Python z LXC proti produkční MariaDB WeeWX 11.8.6**; jeho kompletní výsledky jsou v [REAL_LXC_FULL_2026-10-30.md](REAL_LXC_FULL_2026-10-30.md). Spouští tři reálné HTTP servery jeden po druhém na totožném GitHub Actions runneru a proti stejnému dočasnému MariaDB 11.8 servisu se syntetickými daty podobnými archivnímu rozložení WeeWX.

## Předpoklady
- Go 1.23+, Rust stable/Cargo, Python 3.12+, MariaDB 11.8 a dostupné balíčky z internetu.
- MariaDB databáze `weewx` s testovacím uživatelem `bench`, heslo `bench`, pouze v **izolovaném CI kontejneru**; na produkci nepoužívat.
- `fixture.py` vytváří `archive`, `archive_day_outTemp` a `archive_day_rain` ve zjednodušeném *testovacím* schématu, 200 dní × 288 pětiminutových řádků = **57 600 měření** a 200 denních agregátů.
- Tyto fixture tabulky nemají všechny atributy skutečné WeeWX databáze; benchmark ověřuje typický SELECT workload, nikoliv komplexní meteorologickou správnost historické instance.

## Endpointy ve všech třech jazycích
| Endpoint | SQL |
|---|---|
| `/current` | `ORDER BY dateTime DESC LIMIT 1` |
| `/history/24h` | časový index `dateTime`, 288 řádků |
| `/history/30d` | časový index `dateTime`, 8640 řádků |
| `/statistics/yearly` | čtení 200 `archive_day_*` řádků a časově vážený průměr + úhrn srážek |

Stejný connection pool maximálně 3, lokální HTTP loopback, průběžné porovnání skutečných JSON hodnot. Každý server se spouští samostatně, aby se vzájemně nepředbíhaly. Testuje se souběh 1/10/50 klientů a opakuje se sada dotazů. Měří se HTTP p50/p95/p99, requests/sec, CPU procesového času, resident memory a čas kompilace.

**Omezení:** Runner není dedikovaný laboratorní stroj a sdílí CPU s databázovým kontejnerem; jde o end-to-end aplikační benchmark, nikoliv oddělené měření samotného HTTP parseru/ovladače. Výsledky mohou kolísat; pro produkční rozhodnutí navázat benchmarkem na stagingu poblíž skutečné DB, s monitorováním vlivu na WeeWX writer. Rust/Go/Python mohou mít rozdílnou optimalizaci JSON; to je součást porovnávaného produkčního stacku. Vysoká koncurrency při pouze 3 DB spojeních simuluje frontu.

## Spuštění
Workflow: `.github/workflows/bench-backends.yml`. Spouští se po změnách v benchmark větvi. Po úspěšném běhu jsou výsledky v `benchmark/results.json` jako artefakt `benchmark-results`; časy buildů v logu workflow.

Pokud instalace závislostí, compile nebo validace odpovědí selže, benchmark se označí jako FAILED, nesmí se hlásit neexistující výkonové výsledky. Nepracuje s produkční MariaDB a neprovádí na ní žádnou změnu.

## Skutečný LXC benchmark (externě provedené měření)

Na LXC `zl-dev-AuditMeteo` uživatel spustil `./run.sh full` proti **živé MariaDB WeeWX**. Lokální balíček je samostatný od výše popsané CI fixture. Měření mělo **1 DB spojení na server** kvůli `max_user_connections=4` účtu `loucka_audit`, zatímco CI fixture používá 3 spojení. Tato čísla proto neslučovat do jednoho výkonového průměru.

Výsledek: 3 jazyky × 4 endpointy × 3 stupně souběžnosti (1, 10, 50) = **36 scénářů**, všechny `err=0`, 4/4 odpovědi se shodovaly. Na 30denní historii při 10 HTTP klientech: Go 24,32 RPS, Rust 15,84 RPS, Python 6,81 RPS. U 50 klientů se projevovala vysoká latence, která může být podstatně ovlivněna frontou na jediné DB spojení.

Při testu nebyla provedena SQL mutace; **nebyl ale měřen dopad čtení na produkční WeeWX writer**. JSON a originální logy jsou zatím jen na uživatelském LXC, GitHub obsahuje záznam hodnot z jeho terminálového výpisu. Pro další zátěžové testy využít izolovaný snapshot.

- [Plný report z LXC (36 scénářů)](REAL_LXC_FULL_2026-10-30.md)
- [Původní light test](REAL_LXC_LIGHT_2026-10-30.md)
- [Vysvětlení dřívějších SQL 1226 / HTTP 503](REAL_LXC_LIGHT_REPEAT_FAILURES_2026-10-30.md)
- [Plán testů proti izolované kopii DB](REAL_DB_VALIDATION_PLAN.md)

## Šestijazyčný benchmark na Debian 13 LXC

Nová implementace v [`benchmark/lxc/`](lxc/README.md) rozšiřuje původní srovnání o:

| Jazyk | HTTP server | Databázový ovladač |
|---|---|---|
| Go | net/http | go-sql-driver/mysql |
| Rust | Axum | SQLx |
| Python | FastAPI + uvicorn | aiomysql + orjson |
| Node.js / JavaScript | Fastify | oficiální mariadb connector |
| C++20 | GNU libmicrohttpd | MariaDB Connector/C |
| PHP | lokální PHP CLI server (benchmark-only) | PDO MySQL |

**Stejné endpointy**: `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`. Všechny implementace používají read-only SELECT nad WeeWX s `NULL` hodnotami a společnými hranicemi epochy. Runner před měřením porovnává JSON s referenčním Go API a ukládá diagnostické logy. Pro PHP CLI server se na izolované DB zvyšuje počet workerů podle počtu DB spojení; **nejde o reprezentativní PHP-FPM benchmark**.

[Postup aktualizace existujícího LXC](lxc/UPDATE_LXC.md) · [Zdrojový runner](lxc/run.sh) · [Všech šest serverů](lxc/)

Bezpečnost: na živé MariaDB se vynucuje **pool=1** a `full` je zablokován bez `BENCH_ISOLATED_DB=YES`. Nastavení `YES` je určeno výhradně pro skutečně izolovanou kopii. Workflow má druhý job `six-language`, který proti izolované syntetické MariaDB ověřuje smoke a light. **Výsledky nové trojice Node/C++/PHP neexistují, dokud CI či LXC test úspěšně nedoběhne.** Staré číselné tabulky se proto nemění.


## Rozšíření LXC benchmarku na šest backendů (2026-10-30)

Nad skutečnou MariaDB 11.8.6 proběhl `./run.sh light` se **šesti** variantami: Go, Rust, Python, Node.js/Fastify, C++20/libmicrohttpd, PHP CLI/PDO. Všech 24 scénářů PASS při pool=1 a 1 souběžném HTTP klientovi. `30d` (8 638 bodů): Go 19,92 RPS, C++ 18,78, Rust 18,08, Node.js 11,00, PHP 6,40, Python 5,98. `current`: nejlepší C++ 59,26 RPS.

[Kompletní reálný šestijazyčný report](REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md) · [Zdrojové kódy, balíček a instalace na LXC](lxc/README.md). Výsledky nelze porovnávat prostým průměrem se syntetickým CI nebo předchozím full benchmarkem; zejména PHP CLI není PHP-FPM a tři 30denní requesty tvoří nedostatečný vzorek pro p95.


## Full benchmark šesti backendů – ověřený JSON z produkčního LXC

[Forenzní rozbor 72 scénářů](REAL_LXC_SIX_LANGUAGES_FULL_2026-10-30.md) obsahuje výkon RPS a latenci p95 všech šesti jazyků při c=1/10/50 z **jediného** nahraného JSON souboru. Prokazatelný počet požadavků: 13 032, nula HTTP chyb. **Varování: metadata `isolated_copy=true` nejsou pravdivá** (uživatel potvrdil živou MariaDB); `pool_max=3` a `30d c=50` znamená max. 24 současných požadavků. Nezaměňovat s předešlým `light` nebo s CI fixture. Hodnoty nepředstavují definitivní kapacitní limit a není doložen jejich dopad na WeeWX writer.


## Druhý šestijazyčný FULL běh a agregovaná analýza

Původní JSON soubory z LXC byly nyní přečteny a zkontrolovány. [Rozbor dvou skutečně dokončených `full` běhů](REAL_LXC_SIX_LANGUAGES_FULL_TWO_RUNS_2026-10-30.md) zahrnuje **144 scénářů / 26 064 requestů bez HTTP chyby**, průměr RPS a průměr dvou p95 pro každou kombinaci, špičky vzorkované RAM a metodická omezení. Třetí JSON v dodaném archivu chyběl; `pool_max=3`, `isolated_copy=true` přestože šlo o **produkci**, a `30d c=50` odesílá jen 24 requestů. Nepoužívat tento test jako definitivní SLA ani benchmark 50 současných 30denních exportů.


## Finální souhrn tří šestijazyčných FULL běhů

[Ověřený 3-běhový report](REAL_LXC_SIX_LANGUAGES_FULL_THREE_RUNS_2026-10-30.md) na základě tří původních JSON (205008Z, 210318Z, 211154Z) zahrnuje **216 scénářů / 39 096 HTTP requestů / 0 chyb**, mediány RPS a p95, nejvyšší RSS a porovnání kolísání. U `30d c10`: Go **31,34 RPS medián**, C++ 21,80, PHP CLI 19,89, Node.js 17,37, Rust 15,85, Python 6,05. **Důrazně rozlišovat**: šlo o produkční DB s pool=3, přestože v JSON bylo chybné `isolated_copy=true`; `30d c50` tvoří jen 24 požadavků. Tři běhy nejsou izolovaný kapacitní test ani důkaz bezpečnosti vůči WeeWX writeru.


## Offline výpočet vlastních meteorologických statistik – 6 backendů (2026-10-31)

[Reálný LXC report nad syntetickými lokálními daty](compute/REAL_LXC_OFFLINE_RESULTS_2026-10-31.md): Go, Rust, Python, Node.js, C++ a PHP implementují stejnou denní/měsíční/roční/celkovou agregaci. **72/72 PARITY PASS** na `smoke` (288), `light` (10k) a `full` (105 120 a 1 680 000). U 1,68M záznamů: Rust **4,10 s/107,23 MiB RSS**, Go **5,26 s/422,54 MiB**; C++ **9,13 s/112,32 MiB**; Node.js **15,36 s**, PHP **19,54 s**, Python **37,82 s**. Časy zahrnují parsování již načteného TSV a výpočty, nikoli disk I/O/SQL/HTTP/JSON. **Tyto výsledky se nesmějí vydávat za výkon API ani za validaci nad skutečnými archive WeeWX.**
