# Audit backendu pro MariaDB WeeWX – výběr jazyka a technologie

> **Aktualizace 1. 11. 2026 – pořadí doporučení:** Tento dokument historicky vyhodnocoval Go před dokončením šestijazyčných HTTP benchmarků a architektonického rozhodování. Současný [ADR 31. 10.](docs/ARCHITECTURE_DECISION_2026-10-31.md) navrhuje pro první **staging Node.js + Fastify + TypeScript**; Go zůstává relevantní alternativou. API se řídí nezávislým OpenAPI kontraktem PR #4. Ani Fastify, ani Go nejsou potvrzené jako finální produkční runtime. Níže uvedené dobové závěry zůstávají historickým podkladem, nikoli novým rozhodnutím.


**Datum:** 2026-10-30  
**Repozitář:** `Boym323/Loucka_weather`  
**Režim auditu:** pouze read-only SELECT / information_schema / EXPLAIN; žádný zápis, rebuild ani změna provozu.  
**Stav:** odborné **doporučení**, nikoliv schválená implementace; chybí identické runtime benchmarky Go/Rust/Python na stagingu.

## Výsledek

**Doporučení pro první verzi nového API: Go, standardní `net/http` (nebo lehký router chi), `database/sql` a `github.com/go-sql-driver/mysql`.** Pro současnou MariaDB 11.8 a převážně read-only REST API je to vhodná kombinace výkonu, provozní jednoduchosti, podporovaného driveru, testovatelnosti a malé produkční závislosti. Kompilovat v CI, na LXC 3 nasadit jeden binární soubor pod systemd a vystavit API přes Nginx.

**Druhá volba: Rust + Axum + SQLx (Tokio)**. SQLx uvádí MariaDB jako tier-1 podporovaný databázový systém. Rust má silný typový model a nízký runtime overhead, ale pro čtení relativně malých množin denních souhrnů nepřináší prokázané zrychlení oproti Go. Kompilace a implementace bývá náročnější.

**Třetí volba: Python + FastAPI**, dobrá pro rychlé prototypování, pokročilou analýzu a datové knihovny, ale produkční runtime a závislosti přidávají provozní složitost. Výkonu pro tento objem dat by s dobrým SQL pravděpodobně stačil; žádné měření na daném LXC zatím neproběhlo.

Node/TypeScript API, PHP 8.4 a další varianty nejsou pro konkrétní zadání vhodnější než Go; přidání celého SSR runtime není potřebné. V architektuře ponechat statický Astro + TS + ECharts; jazyk API je na webu nezávislý díky `/api/v1`.

## Skutečná databáze (ověřeno SELECT)

| Charakteristika | Výsledek |
|---|---|
| Server | MariaDB `11.8.6-MariaDB-0+deb13u1`, Debian 13 |
| Storage engine | InnoDB |
| Schéma aplikace | `pocasi-loucka.eu` (nutné explicitně uvádět; defaultní DB MCP se může lišit) |
| Archiv | `archive`, primární klíč `dateTime INT(11)` |
| Počet skutečných záznamů archivu | `1 680 129` (COUNT(*), 2026-10-30) |
| Přibližná datová velikost `archive` | 735.97 MiB (`information_schema.TABLES.DATA_LENGTH`) |
| Celé schéma WeeWX | cca 767.77 MiB dat; InnoDB statistikami odhadované číslo |
| Existující agregace | 78 `archive_day_*` + `archive_day__metadata`; celkem 80 tabulek s archivem |
| Denní teplotní řádky | 6090; 6069 s `count > 0` |
| Vektorový vítr | `archive_day_wind` má `xsum`, `ysum`, `max_dir`, `dirsumtime`, `wsquaresum` |
| Indexy | Kontrolované tabulky `archive`, `archive_day_outTemp`, `archive_day_rain`, `archive_day_wind`, `archive_day_pm25_1` mají pouze `PRIMARY(dateTime)` |
| InnoDB buffer pool | 2 GiB; ostatní databáze sdílejí zdroje, proto nevyvozovat celý archiv „v RAM“ |
| Max connections | 151; webu přidělit **malý** pool |
| DB default timezone | `@@time_zone=SYSTEM`, `@@system_time_zone=CET`; API samo provádí lokální kalendářní hranice `Europe/Prague` |
| Jednotky | `usUnits=16` v zjištěném aktuálním archivu (METRIC), přesně definovat konverze |

### Reálná množství dat pro dotazy

- Posledních 24 hodin: **289** archivních řádků ve vybraném časovém okně.
- Posledních 30 dní: **8639** archivních řádků.
- Posledních 365 dní: **103 556** archivních řádků.
- Denní souhrny teploty od 2009 do 2026: **6090** řádků.
- Roční graf z L2 má obvykle ~365 hodnot, z L1 může přesáhnout 100 tisíc. API nesmí poslat všechny pětiminutové body pro desetiletý přehled.

### EXPLAIN bez změn DB

| Vzor požadavku | `type` | `key` | Poznámka |
|---|---|---|---|
| `ORDER BY dateTime DESC LIMIT 1` pro aktuální měření | `index` | `PRIMARY` | Odhad 1 řádek |
| Omezit historii přes `WHERE dateTime >= ? AND dateTime <= ?` | `range` | `PRIMARY` | Odhad pro 24h vzor 576 řádků |
| Měsíční/roční denní agregace s časovým filtrem | `range` | `PRIMARY` | V kontrolovaném vzoru odhad 363 denních řádků |
| Spojení denních tabulek podle `dateTime` | `range` + `eq_ref` | `PRIMARY` | Dobrý výchozí vzor pro karty |
| `GROUP BY YEAR(FROM_UNIXTIME(dateTime))` přes celé L2 | `ALL` | bez klíče | cca 6183 odhadnutých denních řádků, temporary/filesort; na této velikosti nemusí vadit |
| Větrná růžice za rok, `GROUP BY FLOOR(windDir/22.5)` | `range` | `PRIMARY` | časový index pomůže omezit interval, seskupení používá temporary/filesort |

**Interpretace:** `EXPLAIN` dokazuje plán, nikoli skutečnou dobu odezvy, CPU nebo p95. Nelze na jeho základě vydávat výsledky za runtime benchmark.

## Co z toho plyne pro výběr jazyka

### Go
- Plná kompatibilita driveru `go-sql-driver/mysql` s MariaDB 10.11+ podle aktuální dokumentace, tedy i 11.8.
- `database/sql` poskytuje pool, `QueryContext`, cancelace požadavků a statistiky poolu `DB.Stats()`.
- Nativní binární nasazení, minimální další služby, jednoduché běžné REST/JSON a historické query.
- Méně složité než Rust pro udržování převážně I/O-bound endpointů; není potřeba Python runtime pro API.
- Nevýhoda: při složitých analytických algoritmech má Python bohatší vědecký ekosystém; při přísné statické kontrole některých stavů Rust přísnější typy.

### Rust
- SQLx uvádí MariaDB 10.1+ jako Tier 1; Axum + Tokio podporují běžné HTTP, JSON a middleware.
- Nízký overhead a typová bezpečnost vhodné pro extrémně složité streamy či výpočetní moduly.
- Vyšší vývojová/kompilační cena a větší složitost Cargo/SQLx ekosystému; u dotazů agregujících 365/6090 řádků není podložený výrazný výkonový přínos.
- Volba dává smysl, pokud vznikne rozsáhlá CPU-heavy statistika nebo je Rust strategický standard projektu.

### Python
- FastAPI + vhodný MariaDB/MySQL driver vyhoví velikosti dat, protože výkon určuje SQL a `archive_day_*`.
- Knihovny vhodné pro klimatologické a výzkumné výpočty a snadný vývoj.
- Vyžaduje Python prostředí s reprodukovatelnými závislostmi a běžící ASGI proces. Pořád legitimní volba, ale pro čistý read-only HTTP adaptér není nejjednodušším produkčním artefaktem.

## Cílové API – návrh pro Go

- `GET /api/v1/current`: pouze poslední záznam z `archive`, čas měření a stáří; pokud je požadavek na skutečné sekundy živých dat, přidat až po ověření WeeWX LOOP/GW3000 zdroje.
- `GET /api/v1/history?metric=outTemp&from=...&to=...&resolution=auto`: whitelist veličin, detail z `archive` pro omezená okna, denní `archive_day_*` pro dlouhé intervaly.
- `GET /api/v1/statistics/daily?date=...`: `min/max/mintime/maxtime/wsum/sumtime` a `rain.sum`.
- `GET /api/v1/statistics/monthly|yearly`: agregace v SQL nad *denními* souhrny WeeWX.
- `GET /api/v1/climate/records`: extrémy z denních `min/max` (ne jen raw archiv, LOOP extrémy mohou být přesnější).
- `GET /api/v1/sensors`: pouze aktuálně dostupné sloupce; `NULL` není nula.

### Implementační zásady
1. **SELECT-only DB účet**, přesně dané schéma s názvem obsahujícím `-` a `.`; identifikátory pevně v kódu, SQL parametrizováno. Při startu ověřit správný DB host a schéma.
2. Connection pool při prvním stagingu `MaxOpenConns=3`, `MaxIdleConns=2`, `ConnMaxLifetime=3m`; čísla **orientační**, upravit po měření. Nevyužít maximum 151 jako počet spojení API.
3. Dotazy s `QueryContext` a timeoutem (výchozí návrh 2–3 s pro krátká okna), max. velikost výsledku, max. window podle resolution, fronta a rate limit pro dražší výpočty.
4. Nad `dateTime` používat **numerické UTC hranice** vypočtené v aplikaci pro lokální kalendář `Europe/Prague`; nesestavovat WHERE s `DATE(FROM_UNIXTIME(dateTime))`, které by ztrácelo efektivní využití PK pro rozsah.
5. `dateTime` je **signed INT(11)**, tedy potenciální **problém roku 2038**; dlouhodobě plánovat oddělenou migraci WeeWX databáze, v API interně používat `int64`. Neprovádět tuto migraci bez analýzy kompatibility WeeWX a zálohy.
6. `DOUBLE` hodnoty mohou být NULL; použít `sql.NullFloat64`, kvalitní jednotkové převody a nepropouštět neplatná float čísla do JSON.
7. `sumtime` převést na coverage s reálnou délkou lokálního dne (23/24/25 h), nikoliv fixními 86400 sekundami.
8. Denní extrémy WeeWX mohou obsahovat LOOP min/max, proto pro klimatologické „denní rekordy“ používat správná `archive_day_*` pole.
9. Povinné `source`, `observed_at`, `generated_at`, `unit`, `coverage`, `quality`; neoznačovat opravovaný historický stav za automaticky ověřený.
10. Klasickou historii nepředgenerovávat do JSON souborů; lze použít TTL/ETag cache. Pro dlouhodobou analýzu mimo kapacity L2 až následně měřit potřebu vlastní L3.
11. Observabilita: DB pool in-use/idle/wait, SQL histogram p50/p95/p99, error rate, stale measurement, RSS/CPU, délka JSON a rate limiting.
12. SQL testy nad fixture kopií s 5/6min intervalem, DST 23/25h dnem, `NULL`, srážkami METRIC cm, vzdálenou DB unavailable, současnými uživateli.

## Akceptační benchmark před definitivním výběrem
Stejné SQL, stejné odpovědi a stejné pool limity pro Go a Rust (Python volitelný baseline), pouze testovací kopie dat nebo read-only nízká zátěž mimo kritický writer:
- `/current` – index posledního záznamu.
- `/history` za 24h (řádově 288 bodů), za 30d (cca 8640 bodů), celoroční detail 103k bodů pouze jako kontrolovaná dávka a downsampling.
- `/statistics/yearly` za 2009–2026 z `archive_day_*`.
- Větrná růžice a komplexní senzorový detail jako CPU+SQL scénář.
- Měřit opakovaně při souběhu 1, 10, 50 klientů: API p50/p95/p99, DB query time, CPU/RSS API, DB CPU/IO, ovlivnění WeeWX writeru, počty DB spojení, velikost response a CI cold/warm build.
- Stanovit zátěžový limit, při kterém se dotaz odmítne/zjednoduší. Bez těchto měření netvrdit absolutní výkonové vítězství žádného jazyka.

## Finální doporučení
**Go pro API v1**; **Rust alternativně** při strategické preferenci nebo při naměřených výpočetně náročných operacích. V prvním kroku neměnit databázi, nepřidávat indexy a nevytvářet L3. Výkon dá primárně používání existujících `archive_day_*`, omezení historických rozsahů a efektivní SQL podle `dateTime`.

Zůstává v platnosti: **opravy a přepočet historických dat řeší WeeWX samostatně**, frontend pouze čte výsledky. Nezakládat nové rekonstrukční procesy pod webem.

## Zdroje
- Oficiální driver Go + podporované verze MariaDB: https://github.com/go-sql-driver/mysql
- Pool Go `database/sql`: https://go.dev/doc/database/manage-connections
- SQLx a MariaDB tier-1: https://docs.rs/sqlx/latest/sqlx/database/index.html
- Axum: https://docs.rs/axum/latest/axum/
- WeeWX MySQL/MariaDB: https://weewx.com/docs/latest/usersguide/mysql-mariadb/
- MariaDB indexy a EXPLAIN: https://mariadb.com/docs/server/mariadb-quickstart-guides/mariadb-indexes-guide
