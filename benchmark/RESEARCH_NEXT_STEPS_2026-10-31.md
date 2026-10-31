# Navazující technický výzkum – API a meteorologické výpočty Loučka Weather

**Datum:** 31. 10. 2026  
**Status:** technický výzkum, návrhy priorit. Bez změn produkční DB či WeeWX.  
**Zdroje:** skutečné 3 běhy 6jazykového HTTP benchmarku a samostatný offline compute benchmark v tomto repozitáři; kontrola aktuálních implementací `benchmark/lxc/` a `benchmark/compute/`; **nově provedené jednorázové read-only `EXPLAIN FORMAT=JSON` a `ANALYZE FORMAT=JSON` nad živou MariaDB** prostřednictvím Weather MCP. Online dokumentace [WeeWX](https://weewx.com/docs/latest/devnotes/), [MariaDB ANALYZE](https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/analyze-and-explain-statements/analyze-format-json), [Node.js event loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop), [PHP CLI server](https://www.php.net/manual/en/features.commandline.webserver.php), [ECharts sampling](https://apache.github.io/echarts-handbook/en/basics/release-note/5-5-0/).

## Shrnutí rozhodnutí

- **API v1: Go je dosud nejlepší pracovní volba**, ne absolutní vítěz všech kategorií. Na HTTP historii 30 dní (8 638 bodů, c10) má medián 3 nezávislých `full` běhů **31,34 RPS**; C++ 21,80, PHP CLI 19,89, Node.js 17,37, Rust 15,85, Python 6,05.
- U krátkých API odpovědí dominuje často C++ (např. `current c10` 195,34 RPS); pro produkční řešení jeho komplikovanější paměťové chování a údržba nemusí být ospravedlněné.
- Pro offline agregace syntetických 1 680 000 řádků je současný Rust nejrychlejší a paměťově úsporný: medián **4,10 s / 107,23 MiB**, oproti Go **5,26 s / 422,54 MiB**. **Nesčítat** tato čísla s HTTP měřením: nezahrnují SQL, síť ani JSON serializaci.
- **Provozní přístup:** ponechat read-only WeeWX DB, oddělit historické výpočty od webových požadavků, používat existující denní `archive_day_*`, zavést cache, server-side downsampling a instrumentaci DB/network/JSON fází.

## Nové přímé měření skutečné SQL exekuce (31. 10. 2026)

**Použit pouze read-only `EXPLAIN FORMAT=JSON` / `ANALYZE FORMAT=JSON`, bez DDL, změn dat nebo benchmarkové zátěže.** Časové hranice jsou stejné řádové období jako v posledních LXC záznamech. Jde o jednorázovou teplou/momentální DB exekuci; nelze z ní vyvozovat typické nebo p95 časy.

| Dotaz | Plán | Skutečné záznamy | `r_total_time_ms` | Další měřená metrika |
|---|---|---:|---:|---|
| `SELECT dateTime,outTemp,rain ... dateTime > 1790802000 AND dateTime <= 1793394000 ORDER BY dateTime` | `range` přes `PRIMARY(dateTime)` | **8 638** | **6,7488 ms** | `pages_accessed=374`; odhad optimizeru `rows=17010` |
| roční `SUM(t.wsum)/SUM(t.sumtime)` a `SUM(r.sum)` přes `archive_day_*` v roce 2025 | `range` přes `PRIMARY(dateTime)` pro t; `eq_ref` přes PRIMARY pro r | **363 denních řádků**, 363 join lookupů | **0,3329 ms** | denní t 6 přístupů ke stránkám, join r 731; optimizer odhad 363 |

Interpretace: **DB indexy pro současné dva hlavní dotazy fungují správně**; nepřidávat indexy bez dalšího důkazu. Rozdíl mezi vnitřní dobou serverového plánu (např. 6,75 ms) a HTTP p95 (desítky/stovky ms) sám o sobě nedokazuje, která externí fáze je viníkem; zahrnuje DB->API přenos, čekání na pool, interpretaci a převod řádků, JSON a web/klientský overhead. `ANALYZE` neměří kompletní HTTP request ani uplink celého result setu.

WeeWX výslovně doporučuje využít denní souhrny při dlouhých intervalech; pro teplotu `wsum/sumtime`, pro srážky `sum` v daném jednotkovém systému.

## Kritické metodické nedostatky současných HTTP výsledků

1. **Nesprávně deklarovaná izolace DB:** u 3 historických 6jazykových `full` runů `isolated_copy=true` vzniklo z uživatelem nastaveného `BENCH_ISOLATED_DB=YES`; podle pozdějšího potvrzení však byl endpoint živá produkční MariaDB. Takový flag je pouze deklarace, není ověření sítě/serveru. `full` dále neopakovat proti produkci. Pro další běh zkontrolovat strojově odlišné identifikátory DB hostitele, explicitní staging identity, a zakázat známý produkční host; neukládat secrets do reportu.
2. **Chybný reálný počet klientů `30d c50`:** `COUNTS['full']['30d']=24`, takže maximum současně aktivních HTTP requestů je **24**, nikoli 50. Použít na izolované DB alespoň 100–200 requestů v tomto scénáři a zaznamenávat skutečné `max_in_flight`.
3. **Nepevná a nerandomizovaná metodika:** Go → Rust → Python → Node.js → C++ → PHP pokaždé ve stejném pořadí, `end_ts` se mezi běhy mění a DB cache se ohřívá; rotovat pořadí, držet pevný snapshot a provést nejméně 5 opakování.
4. **Kontrola HTTP obsahu jen před testem:** v `benchmark/lxc/benchmark.py` měřené requesty kontrolují HTTP status a MIME, nikoli JSON identitu/body hash každé odpovědi. Zavést délku odpovědi, hash kanonizovaného JSON nebo úplnou validaci menšího vzorku přímo v měřené smyčce; zaznamenat, zda overhead validace vstupuje do latence.
5. **Nerovnocenné stacky:** PHP se měří vývojovým `php -S` CLI (ne PHP-FPM + Nginx); C++ konstruuje SQL text z interních numerických env parametrů místo bindů; Python používá `orjson`, Rust typové Serde struktury; měří se tedy konkrétní implementace, nikoli abstraktní jazyky.
6. **Nekompletní observabilita:** CPU runner měří hlavně parent process, zvlášť zkreslené u PHP multi-worker. RSS součtem workerů může započítat shared pages několikrát; sledovat procesový CPU součet a PSS/USS nebo systemd cgroup memory.current, DB CPU a I/O, čekání v connection poolu, latenci WeeWX writeru.
7. **Limity DB účtu:** `loucka_audit` má `max_user_connections=4`; při 3jazykovém `light` vedl pool=3 k SQL 1226 a HTTP 503. Při vlastním reálném provozu nevyužít sdílený audit účet jako garanci provozní kapacity. Další výzkum na oddělené kopii.

## Fázové profily: co instrumentovat

Do každého API požadavku zavést nezávislé trvání:
- `pool_wait_ms`: čekání na DB spojení (Go `db.Stats().WaitCount/WaitDuration`, pro jedno volání oddělený `db.Conn(ctx)` a měření acquire).
- `db_query_ms`: vlastní SQL + získání prvního záznamu, `db_fetch_ms`: načtení všech řádků do struktury (pozor na protokoly/ovladače).
- `transform_ms`: jednotky a agregace; `json_encode_ms`: serializace; `response_bytes`: délka těla; `write_ms`: HTTP zápis.
- `db_connections_in_use`, `db_wait_count`, `server_cpu`, `API PSS/RSS`, `DB CPU/io`, `writer_p95`, `http_p50/p95/p99`; korelovat jednotlivé fáze stejnou request ID.
- Testovat `SELECT 1` a malé typované JSON bez DB jako dvě oddělené kontrolní baseline. Teprve z rozdílů odhadovat síť, přenos dat a serializaci.

**Hypotéza k prošetření:** Rust `current`/24h/yearly měl medián cca 23 RPS prakticky bez ohledu na c=1/10/50, zatímco Go a ostatní servery s `pool_max=3` u c10 výrazně rostly. Z code review víme, že SQLx pool opravdu používá nastavitelný `BENCH_DB_POOL_MAX`. Nelze tedy tvrdit, že Rust měl jednoduše natvrdo jedno DB spojení; ověřit počty skutečně aktivních SQLx connections, contention, protokol prepare/cache, runtime scheduler a CPU, aniž by se závěr předjímal.

## Co je pro grafy důležitější než samotný backend

- 30 dnů = **8 638 bodů**. Pro typickou šířku grafu ~800–1400 CSS px posílat preferovaně z API ~500–1500 bodů; plné záznamy zpřístupnit až pro drilldown/export. Tento rozsah je návrhový, je nutná vizuální a věcná validace.
- Teplota: časový downsampling s uchováním min/max a diskontinuit (null výpadky nespojovat). ECharts má `sampling: 'lttb'` a od 5.5 `minmax`, což snižuje náklady na **vykreslení**, nikoli objem SQL ani JSON přes síť; server-side redukce je samostatný krok.
- Srážky: **SUM** skutečných intervalových úhrnů ve správných jednotkách; prostý average/downsample je meteorologicky chybný. Vítr: pro směr vektorová statistika; pro nárazy zachovat max. Historicky rekonstruovaná data označit provenance/quality a uchovat originál.
- Pro `current` krátká cache podle cyklu archivu; pro roční agregace delší cache s invalidací po rekonstrukci / přepočtu. Využívat `ETag` / `Last-Modified`, rate limiting a limity rozsahu.
- Nespoléhat na zapnutí MariaDB globální query cache: v moderní MariaDB je standardně vypnutá, zápisy invalidují dotčené výsledky; pro WeeWX je vhodnější explicitní aplikační cache a agregace.

## Offline compute: zjištění z kódu

- Současný Go worker `benchmark/compute/go/main.go` načte kompletní TSV do paměti, pak `strings.Split(raw, "\n")` a každou řádku dál rozděluje `strings.Split(..., "\t")`, drží `map[string]*Stats` pro den/měsíc/rok. To vytváří mnoho alokací a významně pomáhá vysvětlit **422,54 MiB** RSS u 1,68M. Rust používá `raw.lines()`, pro každý řádek `Vec<&str>`, tedy odkazy do původního stringu, a drží agregáty po skupinách: **107,23 MiB**.
- Před zavedením dalšího jazyka vyzkoušet **Go streaming parser** přes bufio.Reader + vlastní TSV scanner bez duplicit `strings.Split` a alokací, a pooling/reuse struktur; znovu ověřit parity testy pro UTC/CET/CEST, `NULL`, jednotky a zdroje rekonstruovaných měření.
- Pokud na reálném snapshotu a při shodné metodice Rust u výpočtů stále vyhrává s významným odstupem, použít případně **samostatný Rust batch worker** pro dlouhé přepočty, ne jako povinné jádro prvního webového API.
- U C++ zkoumat nárůst HTTP RSS až na **94 MiB** při velkých datech; jedna vzorkovaná špička neznamená memory leak. Porovnat alokace nlohmann/json a textové řádky/počet paralelních požadavků.

## Prioritizovaný plán (bez změny produkce)

| Priorita | Úkol | Ověřitelné kritérium |
|---|---|---|
| P0 | Opravit identitu staging DB, zabránit `full` proti známému produkčnímu hostu | test odmítne chybně nastavené `isolated_copy=YES` na produkci |
| P0 | Opravit počty `30d c50`, zaznamenávat `actual_max_in_flight`, kontrolovat HTTP payload | min. 100 měřených HTTP requestů a max in-flight 50 na stagingu; shodné JSON |
| P1 | Rozdělit čas na DB pool / query / fetch / JSON / HTTP | pro každý endpoint median, p95 každé fáze; není záměna DB vs API |
| P1 | Spravedlivá statistika: pevný snapshot, 5 opakování, rotace pořadí, vyhodnocení rozptylu | 5 konzistentních běhů; DB CPU/IO a writer metriky |
| P1 | Prototyp Go API s cache a server-side downsamplingem | meteorologické extrémy a sumy zachované, mobilní graf ověřen |
| P2 | Optimalizace Go offline TSV parseru + rebenchmark Rust/Go | na stejném datasetu PASS parity, časy a RSS před/po |
| P2 | Volitelný PHP-FPM+Nginx benchmark, pokud PHP skutečně zůstává kandidátem | srovnatelný worker/pool budget; žádné závěry z PHP CLI jako z produkce |

## Výzkumný verdikt

**Nehledat další rychlejší jazyk jen podle jedné RPS tabulky.** Současné indexy a denní souhrny MariaDB už obsluhují dotazy dobře. Nejdřív zlepšit aplikační datový kontrakt, caching/downsampling a fázové měření. **Go pro první read-only API, Rust jako potenciální offline compute worker** je prakticky zdůvodněná pracovní volba; finální kapacitní rozhodnutí vyžaduje izolovanou kopii skutečné DB, bezpečný staging a spravedlivý test.
