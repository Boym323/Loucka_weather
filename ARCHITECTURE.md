# ARCHITECTURE – návrh provozní a datové architektury

Status: **NÁVRH K REVIZI**, 2026-10-30. Nepředstavuje potvrzení skutečné konfigurace LXC ani hotovou implementaci.

## 1. Rozhodnutí
- Zachovat Ecowitt GW3000, WeeWX a původní MariaDB.
- Přidat oddělený frontend/data LXC, produkční Belchertown ponechat do převzetí.
- Web: Astro + TypeScript se statickým exportem, Apache ECharts, Nginx. Žádné nutné běžící Node.js v produkci.
- Data: **dynamické read-only HTTP API přímo nad stávající MariaDB**, první realizace Python (např. FastAPI). Rust může backend později nahradit po benchmarku.
- Zdroj SQL se nesmí vybírat implicitně podle defaultního DB MCP.
- GitHub Actions build mimo produkční LXC, testy a podpis/checksum artefaktu, přepnutí release atomicky.
- **Žádné periodické JSON exporty jako primární zdroj historických dat.** Astro vykreslí statickou obálku, browser volá dynamické API; to přímo dotazuje MariaDB s krátkou volitelnou cache. Žádné rebuildy kvůli změně měření.
- Externí služby se čtou do lokální cache se zdrojem/TTL.

## 2. Fyzické rozdělení
| Složka | LXC | Úloha |
|---|---|---|
| GW3000 | fyzická brána | příjem senzorů; lokální API dle firmwaru |
| WeeWX | stávající LXC 1 | sběr, ovladače, zápis archivního záznamu |
| MariaDB | stávající LXC 2 | originální archiv, denní souhrny a případně oddělené schéma rekonstrukcí |
| Loučka Weather | nové LXC 3 | Nginx + statický Astro, **Python HTTP API server** (systemd, lokální socket/port), volitelná cache, integrace kamery a externích zdrojů |

**LXC 3** počáteční odhad 2 vCPU/2 GiB RAM, disk 10–20 GiB mimo archiv kamer; tyto hodnoty nejsou benchmark. Pro časosběry oddělené úložiště/quota a retence. LXC 1/2 neresizovat bez měření. Nejprve ověřit skutečné LXC rozmístění, firewall a možnosti záloh.

### Tok
`GW3000 -> WeeWX -> MariaDB (zapisuje jen WeeWX)`
`Astro client -> HTTPS /api/v1/* -> Nginx reverse proxy -> Python API -> MariaDB (SELECT)`
`WeeWX LOOP nebo GW3000 local (po ověření) -> live adaptér /api/v1/live -> Astro client`
`Kamera / ČHMÚ / Open-Meteo / další -> jednotlivé fetchery -> cache + metadata -> API/Nginx`

LXC 3 nikdy nemění produkční DB; ostatní opravy řeší samostatný kontrolovaný postup. Web nemá přímý přístup k SQL.

## 3. Ochrana zdroje dat a read-only model
- Dedicated DB účet s minimálními SELECT právy pouze na potřebná schémata/tabulky; žádné GRANT/DDL/DML z webu.
- `DATABASE()`, host a verze schema kontrolovat při startu. Povinná konfigurace origin/reconstruction/externí; nikdy automatický default.
- Pevný allowlist SQL dotazů, parametrizace, limity rozsahu, stránkování. Nesmí existovat veřejný obecný SQL endpoint.
- Jediná cesta nových dat do databáze je stávající WeeWX. Rekonstrukce probíhají v odděleném projektu s vlastní auditní stopou; frontend je jen konzument.
- Dva různé zdroje produkce/reconstruction držet v datových kontraktech s `origin` a `quality`.
- Read-only ověření schématu před nasazením: přesná jména polí, zdrojové jednotky a mapování senzorů.

## 4. Přímé databázové dotazy a cache – závazná změna (2026-10-30)
**Primární zdroj veřejného webu je přímo původní MariaDB, do které zapisuje WeeWX.** Dynamické požadavky klientů se obsluhují přes malý HTTP backend. API vrací JSON sestavený při požadavku; nepoužívat předgenerovaný JSON jako náhradu přístupu k databázi.

### Provoz služby
- Astro se staticky sestaví v CI; Nginx servíruje hotové HTML/CSS/JS.
- Nginx předá `/api/v1/*` na interní Python ASGI aplikaci (např. FastAPI na `127.0.0.1`); backend není vystaven na samostatném veřejném portu.
- Backend používá **omezený connection pool** (výchozí návrh 2–5 připojení, změřit), limit současných dotazů, timeouts/limity výsledků, konzistentní odpovědi 503 při nedostupnosti DB.
- Účet backendu má `SELECT` pouze na konkrétní tabulky `pocasi-loucka.eu`. WeeWX zůstává jediným běžným writerem původního archivu. Žádné změny schématu DB z webu.
- Výstupy lze cachovat v RAM s TTL; např. aktuální archiv 15–30 s, 24h graf 30–60 s, historické měsíce hodiny až do změny archivní verze. **Cache není zdrojem pravdy**. Ani restart backendu nesmí vyžadovat přepočet celé historie.
- Dlouhé klimatologické výpočty nad původním archivem běží nad existujícími `archive_day_*`, pokud jsou metodicky správné; při opravách či náročnějších výpočtech zvlášť batch/ondemand výpočet s limitem (stále ze stávající DB).
- `EXPLAIN` a zátěžové testy před přidáváním indexů; změna indexů není automaticky povolena. Využívat indexovaná časová okna `dateTime`, ne `YEAR(FROM_UNIXTIME(dateTime))` ve filtru pro všechny řádky.
- Explicitně stanovit maximální časové okno a maximum bodů; backend pro měsíce/roky poskytuje agregace místo milionů surových bodů.

### Obnovování / integrace
| Oblast | Návrh | Zdroj |
|---|---|---|
| Aktuální 5min záznam | dotaz na poslední archivní řádek, cache ~15–30 s | `archive` |
| Skutečná živá měření 10–20 s | po ověření LOOP nebo GW3000 HTTP feed, zvlášť od DB | adaptér; **není** garantováno pětiminutovým SQL |
| Krátké grafy | HTTP dotaz v omezeném časovém okně, cache ~30–60 s | `archive` |
| Roční/klimatologické grafy | agregace přímo nad denními souhrny, cache a QC | `archive_day_*` |
| Diagnostika | aktuální senzorové metriky a historie z DB | `archive` |
| Kamera | 30–60s snímek, 5min archiv podle zdroje | image worker/úložiště |
| CAP, předpověď, radar | provider fetch/TTL/cache | oficiální externí zdroje |

## 5. API kontrakt
Veřejný dynamický prefix **`/api/v1/`** (REST/JSON, pouze bezpečné GET pro veřejné historické údaje):

- `GET /api/v1/current` – poslední archivní údaje, čas posledního měření a stale stav.
- `GET /api/v1/history?metric=outTemp&from=...&to=...&resolution=auto` – vybraná veličina a omezené období, agregace podle délky okna; žádné libovolné SQL nebo nezaručené rozsahy.
- `GET /api/v1/climate/yearly?metric=outTemp&fromYear=2009&toYear=2026` – denní souhrny/agregace, přesné definice.
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
- Read-only aplikace nikdy neprovádí SQL migrace. Zálohy a restore zkoušky zvlášť.
- Monitoring HTTP response, dostupnosti a latence /api/v1/*, stavu DB poolu, délky SQL dotazů, stáří posledního měření, CAP fetch, kamera, CPU/RSS/disk; nemíchat „žádné výstrahy“ s „data nejsou dostupná“.

## 8. Build/release
- CI na GitHub hosted runneru, anebo izolovaném build runneru mimo produkční Proxmox. Pokud self-hosted runner sdílí hostitele, ověřit CPU/RAM/IO izolaci.
- `npm ci`/Astro typecheck/lint/unit/E2E/build v CI.
- Python check/lint/test + golden fixtures; na produkci pouze API artefakt / připravené Python prostředí, běh systemd služby bez kompilace frontendu.
- Release s manifestem a checksum, artifact deploy do `/srv/loucka-weather/releases/<id>`, přepnutí `current` symlinku, smoke test, rollback.
- Pouze externí cache, kamerové snímky a dočasné pracovní soubory pod `/var/lib/loucka-weather/`, mimo read-only release. Historické měření se čte přímo přes SQL, nepublikuje se jako sada statických exportů.
- Staging `beta.pocasi-loucka.eu`; produkční Belchertown nechat do schválení.
- Build budget měřit na konkrétních verzích Astro; nepředpokládat magickou úsporu RAM, produkční LXC se však buildu neúčastní.

## 9. Srovnání alternativ
Astro vyhovuje především veřejné meteorologické prezentaci s klientskou interaktivitou a bez runtime Node. SvelteKit/Next.js jsou legitimní alternativa při bohaté aplikaci se sdíleným stavem či vlastním serverovým SSR. PHP lze použít pro backend, ale zavádět ho navíc k Pythonu nedává smysl. Rust zvažovat pouze po benchmarku na identickém datasetu, včetně ceny buildu a údržby. Frontend oddělený od zdroje prostřednictvím `/api/v1/`, aby bylo možné engine vyměnit.

## 10. Fáze a exit kritéria
P0 ověřit zdrojovou konfiguraci, DB schéma, mapování sond, live zdroj, kameru, CHMI licence.
P1 OpenAPI/JSON contract + read-only databázový HTTP backend + testy DST/jednotek/QC, SQL explain, timeouty a pool.
P2 Astro homepage/grafy/senzory na stagingu.
P3 klimatologie a řešení provenience rekonstrukcí.
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
