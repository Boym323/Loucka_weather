> **Stav 1. 11. 2026:** Preferenci Go uvnitř tohoto staršího architektonického dokumentu čti jako původní doporučení auditu. Novější pracovní návrh je **Fastify/TypeScript pro staging** dle `main/docs/ARCHITECTURE_DECISION_2026-10-31.md`; definitivní runtime nebyl schválen. Stabilní je pouze jazykově nezávislé OpenAPI v1 (PR #4).

# ARCHITECTURE – návrh provozní a datové architektury

Status: **NÁVRH K REVIZI**, 2026-10-30. Nepředstavuje potvrzení skutečné konfigurace LXC ani hotovou implementaci.

## 1. Rozhodnutí
- Zachovat Ecowitt GW3000, WeeWX a původní MariaDB.
- Přidat oddělený frontend/data LXC, produkční Belchertown ponechat do převzetí.
- Web: Astro + TypeScript se statickým exportem, Apache ECharts, Nginx. Žádné nutné běžící Node.js v produkci.
- Data: **dynamické read-only HTTP API přímo nad stávající MariaDB**. Po konkrétním read-only auditu je **doporučen Go** (`net/http` + `database/sql` + `go-sql-driver/mysql`); Rust (Axum+SQLx) a Python (FastAPI) zůstávají alternativy, dokud finální volba není potvrzena. Viz [BACKEND_TECHNOLOGY_AUDIT.md](BACKEND_TECHNOLOGY_AUDIT.md).
- Zdroj SQL se nesmí vybírat implicitně podle defaultního DB MCP.
- GitHub Actions build mimo produkční LXC, testy a podpis/checksum artefaktu, přepnutí release atomicky.
- **Žádné periodické JSON exporty jako primární zdroj historických dat.** Astro vykreslí statickou obálku, browser volá dynamické API; to přímo dotazuje MariaDB s krátkou volitelnou cache. Žádné rebuildy kvůli změně měření.
- Externí služby se čtou do lokální cache se zdrojem/TTL.
- **Tři úrovně statistik – cílová koncepce:** (1) `archive` pro detailní historii, (2) WeeWX `archive_day_*` pro existující denní souhrny a rychlé agregace, (3) **volitelné vlastní předpočítané odvozené statistiky** v odděleném schématu na *tomtéž* serveru MariaDB. **Pro MVP je po read-only auditu schváleno používat jen L1 + L2.** Žádná kopie celého archivu. Audit: [WEEWX_DAILY_SUMMARIES_AUDIT.md](WEEWX_DAILY_SUMMARIES_AUDIT.md).

## 2. Fyzické rozdělení
| Složka | LXC | Úloha |
|---|---|---|
| GW3000 | fyzická brána | příjem senzorů; lokální API dle firmwaru |
| WeeWX | stávající LXC 1 | sběr, ovladače, zápis archivního záznamu |
| MariaDB | stávající LXC 2 | původní archiv, souhrny WeeWX a samostatné existující rekonstrukční schéma; volitelně po schválení `loucka_weather_stats` |
| Loučka Weather | nové LXC 3 | Nginx + statický Astro, **read-only HTTP API server (preferovaně Go)** pod systemd, lokální socket/port, volitelná cache, kamera a externí zdroje |

**LXC 3** počáteční odhad 2 vCPU/2 GiB RAM, disk 10–20 GiB mimo archiv kamer; tyto hodnoty nejsou benchmark. Pro časosběry oddělené úložiště/quota a retence. LXC 1/2 neresizovat bez měření. Nejprve ověřit skutečné LXC rozmístění, firewall a možnosti záloh.

### Tok
`GW3000 -> WeeWX -> MariaDB (zapisuje jen WeeWX)`
`Astro client -> HTTPS /api/v1/* -> Nginx reverse proxy -> HTTP API (preferovaně Go, SELECT) -> MariaDB: archive / archive_day_* / případné statistické schéma`
`samostatný, teprve po schválení povolený stats worker -> validované agregace -> MariaDB.loucka_weather_stats (pouze oddělené schema)`
`WeeWX LOOP nebo GW3000 local (po ověření) -> live adaptér /api/v1/live -> Astro client`
`Kamera / ČHMÚ / Open-Meteo / další -> jednotlivé fetchery -> cache + metadata -> API/Nginx`

HTTP API v LXC 3 používá pouze SELECT; produkční `pocasi-loucka.eu` ani `loucka_reconstruction` nemění. Po případném schválení může **jiná procesní identita** (stats worker) zapisovat výhradně vlastní odvozené tabulky na stejném serveru MariaDB. Opravy originálního archivu nadále řeší samostatný kontrolovaný postup. Prohlížeč nemá přímý přístup k SQL.

## 3. Ochrana zdroje dat a read-only model
- Dedicated DB účet s minimálními SELECT právy pouze na potřebná schémata/tabulky; žádné GRANT/DDL/DML z webu.
- `DATABASE()`, host a verze schema kontrolovat při startu. Povinná konfigurace origin/reconstruction/externí; nikdy automatický default.
- Pevný allowlist SQL dotazů, parametrizace, limity rozsahu, stránkování. Nesmí existovat veřejný obecný SQL endpoint.
- WeeWX zůstává jediným writerem původního archivu `pocasi-loucka.eu`. Samostatný, **dosud nenasazený a neautorizovaný** pracovní proces může po odsouhlasení vytvářet/updatovat *jen* odvozené tabulky v `loucka_weather_stats`. To není nový primární zdroj naměřených dat. Rekonstrukce probíhají v odděleném projektu s vlastní auditní stopou; frontend a veřejné API jsou pouze konzumenti.
- Oddělit DB účty: `weather_web_ro` (pouze potřebné SELECT) a případný `weather_stats_writer` (SELECT podkladů + omezené INSERT/UPDATE do vlastních souhrnů, žádná práva na původní archive, archive_day_* ani loucka_reconstruction). Konkrétní účty/názvy jsou návrh; v této fázi se nevytvářejí.
- Dva různé zdroje produkce/reconstruction držet v datových kontraktech s `origin` a `quality`.
- Read-only ověření schématu před nasazením: přesná jména polí, zdrojové jednotky a mapování senzorů.

## 4. Přímé databázové dotazy a cache – závazná změna (2026-10-30)
**Primární zdroj veřejného webu je přímo původní MariaDB, do které zapisuje WeeWX.** Dynamické požadavky klientů se obsluhují přes malý HTTP backend. API vrací JSON sestavený při požadavku; nepoužívat předgenerovaný JSON jako náhradu přístupu k databázi.

### Provoz služby
- Astro se staticky sestaví v CI; Nginx servíruje hotové HTML/CSS/JS.
- Nginx předá `/api/v1/*` na interní Go HTTP službu (případně Rust/Python podle konečné volby) na `127.0.0.1` nebo Unix socketu; backend není vystaven na samostatném veřejném portu.
- Backend používá **omezený connection pool** (výchozí návrh 2–5 připojení, změřit), limit současných dotazů, timeouts/limity výsledků, konzistentní odpovědi 503 při nedostupnosti DB.
- Účet backendu má `SELECT` pouze na konkrétní tabulky `pocasi-loucka.eu`. WeeWX zůstává jediným běžným writerem původního archivu. Žádné změny schématu DB z webu.
- Výstupy lze cachovat v RAM s TTL; např. aktuální archiv 15–30 s, 24h graf 30–60 s, historické měsíce hodiny až do změny archivní verze. **Cache není zdrojem pravdy**. Ani restart backendu nesmí vyžadovat přepočet celé historie.
- Pro běžné denní a roční statistiky použít existující `archive_day_*`, jen pokud jsou metodicky a datově správné. Náročné specializované ukazatele, auditovanou klimatologii a rekordy lze **předpočítat** do samostatného schématu. API se na ně dotazuje přímo v MariaDB. U výpočtů pro opravenou historii neoznačovat původní denní souhrny WeeWX za automaticky validní.
- `EXPLAIN` a zátěžové testy před přidáváním indexů; změna indexů není automaticky povolena. Využívat indexovaná časová okna `dateTime`, ne `YEAR(FROM_UNIXTIME(dateTime))` ve filtru pro všechny řádky.
- Explicitně stanovit maximální časové okno a maximum bodů; backend pro měsíce/roky poskytuje agregace místo milionů surových bodů.

### Tříúrovňový model statistické vrstvy (schválená koncepce)
| Vrstva | Tabulky | Použití a aktualizace |
|---|---|---|
| L1 – detail | `pocasi-loucka.eu.archive` | Aktuální poslední archivní údaj, detailní grafy, krátká období; přímé SQL SELECT s limity |
| L2 – denní souhrny WeeWX | `pocasi-loucka.eu.archive_day_*` | Denní min/max, časově vážené průměry, denní srážky a rychlé měsíční/roční agregace; WeeWX aktualizuje podle vlastního mechanismu |
| L3 – vlastní odvozené agregace **volitelné** | navrhované schéma `loucka_weather_stats` | Klimatologické rekordy, charakteristické dny, validované měsíce/roky, QC/úplnost a rekonstrukce; samostatný worker po schválení oprávnění a migrací |

**Jedna databázová služba, žádná kopie raw archivu.** L3 je nové **schéma na existující MariaDB**, nikoli další MariaDB instance, další LXC nebo automaticky schválená mutace. L1/L2 zůstávají čtené přímo, L3 je optimalizační/analytický index s nezávislým přepočtem.

#### Případná L3 – minimální logické tabulky (názvy a DDL teprve k návrhu)
- `daily_statistics`, `monthly_statistics`, `yearly_statistics`: `metric_id`, `period_start_utc`, `period_end_utc`, `source_id`, `origin`, `unit`, `value`/`min`/`max` dle definice, `coverage_fraction`, `quality`, `rule_version`.
- `climate_records`, `climate_normals`: souhrn s doloženou metodikou; žádný nedoložený oficiální normál.
- `data_completeness`: platné intervaly, chybějící hodiny/dny, senzorové epochy.
- `calculation_runs`: id výpočtu, vstupní období, fingerprint zdrojů, verze metodiky/QC, stav, chyby, `calculated_at`, důvod přepočtu.
- Unique key pro `metric_id + period + source + origin + algorithm_version` (přesná schémata až dle návrhu). Uchovávat odkazy na provenance, ne vytvářet skrytou kopii všech raw bodů.

#### Aktualizace a přepočty
1. Poslední archivní měření API čte z `archive`; průběžné denní hodnoty lze číst z WeeWX, ale **nepovažovat nedokončený den za definitivní**.
2. Po dokončení lokálního dne (Europe/Prague) může oddělený worker idempotentně aktualizovat dotčené odvozené denní/měsíční/roční ukazatele. Ověří zdrojový `archive` vs `archive_day_*` a pravidla pokrytí.
3. **Historické opravy jsou mimo současný scope** a jejich přepočet denních souhrnů zajistí samostatný postup ve WeeWX. API musí umět po takovém přepočtu invalidovat cache a znovu načíst L2. Případná budoucí L3 si teprve po schválení řeší vlastní odvozené závislosti; změna v `loucka_reconstruction` nesmí automaticky měnit původní archiv.
4. Přepočet musí být reprodukovatelný, verzovaný a atomicky publikovaný (transakce/staging + swap), se souběžnými zámky, auditní stopou a rollbackem. Při selhání se nesmí publikovat částečně přepočtený rok.
5. Úplnost počítat z pokrytí platných intervalů a používat historicky správné jednotky/hranice `(start,end]` a DST; nepočítat pouze počet pětiminutových řádků.
6. Cache API pro L3 invalidovat podle `calculation_run/source_revision`, případně omezit TTL. API vrací `computed_at`, `source_period`, `data_origin`, `algorithm_version`, `quality`, `coverage`, `is_final`. Neplatná/stará statistika má viditelný stav, nikoliv tichý fallback na chybnou hodnotu.

#### Než budou dovoleny zápisy do L3
- Read-only ověřit existující schémata a existenci `archive_day_*` pro každou metriku.
- Navrhnout DDL, indexy a role; změřit náročnost backfillu i dopad na běžící WeeWX writer.
- Připravit migrace, zálohu, test na kopii databáze, opravný/rollback plán a approval pro vytvoření schématu i zápis.
- Do odsouhlasení běží pouze **L1 + L2 a RAM cache**, a L3 je zdokumentované budoucí rozšíření.

### Obnovování / integrace
| Oblast | Návrh | Zdroj |
|---|---|---|
| Aktuální 5min záznam | dotaz na poslední archivní řádek, cache ~15–30 s | `archive` |
| Skutečná živá měření 10–20 s | po ověření LOOP nebo GW3000 HTTP feed, zvlášť od DB | adaptér; **není** garantováno pětiminutovým SQL |
| Krátké grafy | HTTP dotaz v omezeném časovém okně, cache ~30–60 s | `archive` |
| Roční/klimatologické grafy | primárně denní souhrny; pro náročné validované ukazatele volitelná L3 po jejím nasazení | `archive_day_*`, volitelně `loucka_weather_stats` |
| Diagnostika | aktuální senzorové metriky a historie z DB | `archive` |
| Kamera | 30–60s snímek, 5min archiv podle zdroje | image worker/úložiště |
| CAP, předpověď, radar | provider fetch/TTL/cache | oficiální externí zdroje |

## 5. API kontrakt
Veřejný dynamický prefix **`/api/v1/`** (REST/JSON, pouze bezpečné GET pro veřejné historické údaje):

- `GET /api/v1/current` – poslední archivní údaje, čas posledního měření a stale stav.
- `GET /api/v1/history?metric=outTemp&from=...&to=...&resolution=auto` – vybraná veličina a omezené období, agregace podle délky okna; žádné libovolné SQL nebo nezaručené rozsahy.
- `GET /api/v1/climate/yearly?metric=outTemp&fromYear=2009&toYear=2026` – agregace z existujících denních tabulek, případně ověřených předpočtených statistik; klient neřeší jejich fyzické umístění.
- `GET /api/v1/sensors` – diagnostika a stáří měření.
- `GET /api/v1/status` – veřejný stav posledního načtení dat a konektivity bez citlivých detailů.
- `GET /api/v1/alerts`, `GET /api/v1/forecast` – externí data z ověřených zdrojů/cache.
- `GET /api/v1/camera` – metadata zveřejněných fotografií a časové řady kamery.

Odpověď zahrne `schema_version`, `observed_at`, `generated_at`, `metric`, `unit`, `source`, `origin`, `quality`, `coverage` tam, kde je to významné. Původní archiv zůstává základem; policy rekonstrukcí se řeší samostatně a nikdy se neslévá neviditelně.

Zavést OpenAPI/JSON Schema a generovat TypeScript typy; API testy ve fixture DB a read-only integračním prostředí. HTTP `Cache-Control`, ETag nebo Last-Modified pro vhodné GET výsledky, řádné stale/error stavy. Nevystavovat generický query endpoint ani metadata připojení.

V prohlížeči používat klientské `fetch('/api/v1/...')` po otevření stránky / při interakci. Na statickém Astro nespoléhat na build-time `fetch` pro živá data. Není nutné zapínat Astro SSR nebo Node runtime.

## 6. Konkrétní integrace
### Kamera
Nejdříve zjistit stávající autentizovaný lokální zdroj; nikdy nevymýšlet URL ani nepřenášet credentials do public JS. Intervalový snímek JPEG/WebP, nezávislé datum pořízení, volitelně poster, denní ffmpeg time-lapse offline. Privacy masking a kontrola, zda kamera nezabírá osoby/veřejné soukromé prostory; retence podle účelu a objemu. V reálném LXC pravidla disku a CPU quotas pro ffmpeg.

### ČHMÚ CAP
Strojově čitelné CAP zdroje z oficiálního `opendata.chmi.cz`; validovat XML bez externích entit, ošetřit obrovské soubory, deduplikovat identifikátory/aktualizace/rušení. Přesné geoprostorové filtrování podle území Loučky (příslušnost a identifikátory ověřit). Časová platnost a nejistota provider dostupnosti. Na výstupu oficiální link a zdroj/attribution.

### Předpovědi
Open-Meteo jako první provider, cache, model/čas vydání, predikce vs měření odděleně. Podmínky užití prověřit v době implementace (nekomerční limit nemusí platit při komerčním provozu). U predikčních benchmarků ukládat originální issue-time snapshots, nelze hodnotit ex post poslední model jako historickou předpověď.

### Radar, mapy, regionální stanice
Oficiální publikované produkty a licenčně povolené widgety; nevyužívat skryté tiles nebo scraping bez práv. Sousední stanice explicitně označit lokací/nadmořskou výškou a typem senzoru. Radar cache + legenda + stáří produktu. Podpůrné LuhaMet/ILOUKA4 pouze s validovanou metodikou.

## 7. Bezpečnost
- Nginx HTTPS, minimum otevřených portů, backend a DB interní síť.
- CSP navrhnout podle skutečných zdrojů map/kamer, HSTS až po ověření TLS, security headers, cache, omezení MIME.
- Integrátory stahují jen z allowlistu, bránit SSRF a interním redirectům, size/time limits.
- Secrets v env file vlastněném service účtem, žádné v public JSON a repu.
- Read-only webová aplikace nikdy neprovádí SQL migrace. Samostatný **budoucí** stats worker smí po schválení zapisovat jen do vlastního statistického schématu. Zálohy a restore zkoušky zvlášť.
- Monitoring HTTP response, dostupnosti a latence /api/v1/*, stavu DB poolu, délky SQL dotazů, stáří posledního měření, CAP fetch, kamera, CPU/RSS/disk; nemíchat „žádné výstrahy“ s „data nejsou dostupná“.

## 8. Build/release
- CI na GitHub hosted runneru, anebo izolovaném build runneru mimo produkční Proxmox. Pokud self-hosted runner sdílí hostitele, ověřit CPU/RAM/IO izolaci.
- `npm ci`/Astro typecheck/lint/unit/E2E/build v CI.
- CI provádí testy zvoleného jazyka API a golden fixtures; pro Go/Rust na produkci pouze předem zkompilovaný binární artefakt pod systemd (žádný build v LXC). Testy frontendu a API odděleně.
- Release s manifestem a checksum, artifact deploy do `/srv/loucka-weather/releases/<id>`, přepnutí `current` symlinku, smoke test, rollback.
- Pouze externí cache, kamerové snímky a dočasné pracovní soubory pod `/var/lib/loucka-weather/`, mimo read-only release. Historické měření se čte přímo přes SQL, nepublikuje se jako sada statických exportů.
- Staging `beta.pocasi-loucka.eu`; produkční Belchertown nechat do schválení.
- Build budget měřit na konkrétních verzích Astro; nepředpokládat magickou úsporu RAM, produkční LXC se však buildu neúčastní.

## 9. Srovnání alternativ
Astro vyhovuje veřejné meteorologické prezentaci s klientskou interaktivitou a bez Node runtime. Pro API je podle auditu preferován Go (jednoduché nasazení, podporovaný MariaDB ovladač a výborný connection-pool model), Rust je silná alternativa a Python vhodný pro analytické knihovny. Konkrétní výkon zatím nebyl porovnán benchmarkem. Frontend zůstane oddělený přes `/api/v1/`, aby bylo možné engine vyměnit.

## 10. Fáze a exit kritéria
P0 ověřit zdrojovou konfiguraci, DB schéma, mapování sond, live zdroj, kameru, CHMI licence.
P1 OpenAPI/JSON contract + read-only databázový HTTP backend + testy DST/jednotek/QC, SQL explain, timeouty a pool.
P2 Astro homepage/grafy/senzory na stagingu.
P3 klimatologie: primárně L1/L2 po ověření souhrnů a přepočtu WeeWX; benchmarking. **L3 pouze pro konkrétní chybějící nebo příliš drahý výpočet**, pokud to prokáže benchmark a schválí se DDL/oprávnění.
P4 CAP/předpověď/kamera/radar, každé integrační API vlastní fail-closed status.
P5 benchmark, bezpečnost, dokončení WCAG, produkční cutover po schválení.

MVP akceptace: kontrola zdrojové identity, žádné zápisy do originální DB, přesné jednotky, viditelný stale stav, dark/light, mobil, fungující 24h graf a senzory, testy + rollback.

## 11. Dokumentace a verze
Zaznamenávat Architectural Decision Records (ADR) pro přechody technologie, volby zdrojů a korekční politiku. Přesný seznam otevřených voleb v `DECISIONS.md`.

Odkazy:
- https://docs.astro.build/en/guides/on-demand-rendering/
- https://www.weewx.com/docs/
- https://opendata.chmi.cz/meteorology/weather/alerts/cap/
- https://open-meteo.com/en/docs
