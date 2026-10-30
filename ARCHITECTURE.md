# ARCHITECTURE – návrh provozní a datové architektury

Status: **NÁVRH K REVIZI**, 2026-10-30. Nepředstavuje potvrzení skutečné konfigurace LXC ani hotovou implementaci.

## 1. Rozhodnutí
- Zachovat Ecowitt GW3000, WeeWX a původní MariaDB.
- Přidat oddělený frontend/data LXC, produkční Belchertown ponechat do převzetí.
- Web: Astro + TypeScript se statickým exportem, Apache ECharts, Nginx. Žádné nutné běžící Node.js v produkci.
- Data: read-only engine, první referenční realizace Python; Rust je možnost po naměřeném benchmarku, nikoli počáteční povinnost.
- Zdroj SQL se nesmí vybírat implicitně podle defaultního DB MCP.
- GitHub Actions build mimo produkční LXC, testy a podpis/checksum artefaktu, přepnutí release atomicky.
- Žádné periodické rebuildy kvůli meteorologickým hodnotám; web načítá pravidelně obnovované datové soubory.
- Externí služby se čtou do lokální cache se zdrojem/TTL.

## 2. Fyzické rozdělení
| Složka | LXC | Úloha |
|---|---|---|
| GW3000 | fyzická brána | příjem senzorů; lokální API dle firmwaru |
| WeeWX | stávající LXC 1 | sběr, ovladače, zápis archivního záznamu |
| MariaDB | stávající LXC 2 | originální archiv, denní souhrny a případně oddělené schéma rekonstrukcí |
| Loučka Weather | nové LXC 3 | Python export, časovače, cache, kamera, Nginx + statický Astro |

**LXC 3** počáteční odhad 2 vCPU/2 GiB RAM, disk 10–20 GiB mimo archiv kamer; tyto hodnoty nejsou benchmark. Pro časosběry oddělené úložiště/quota a retence. LXC 1/2 neresizovat bez měření. Nejprve ověřit skutečné LXC rozmístění, firewall a možnosti záloh.

### Tok
`GW3000 -> WeeWX -> MariaDB (zapisuje jen WeeWX)`
`MariaDB -> read-only Weather Engine -> validované JSON soubory -> Nginx -> Astro client`
`WeeWX LOOP nebo GW3000 local -> adaptér -> current.json -> client refresh`
`Kamera / ČHMÚ / Open-Meteo / další -> jednotlivé fetchery -> cache + metadata -> Nginx`

LXC 3 nikdy nemění produkční DB; ostatní opravy řeší samostatný kontrolovaný postup. Web nemá přímý přístup k SQL.

## 3. Ochrana zdroje dat a read-only model
- Dedicated DB účet s minimálními SELECT právy pouze na potřebná schémata/tabulky; žádné GRANT/DDL/DML z webu.
- `DATABASE()`, host a verze schema kontrolovat při startu. Povinná konfigurace origin/reconstruction/externí; nikdy automatický default.
- Pevný allowlist SQL dotazů, parametrizace, limity rozsahu, stránkování. Nesmí existovat veřejný obecný SQL endpoint.
- Jediná cesta nových dat do databáze je stávající WeeWX. Rekonstrukce probíhají v odděleném projektu s vlastní auditní stopou; frontend je jen konzument.
- Dva různé zdroje produkce/reconstruction držet v datových kontraktech s `origin` a `quality`.
- Read-only ověření schématu před nasazením: přesná jména polí, zdrojové jednotky a mapování senzorů.

## 4. Refresh a storage – předběžný návrh
| Produkt | Doporučená frekvence | Mechanismus |
|---|---|---|
| current.json | 10–20 s podle doloženého LOOP/local zdroje | samostatný lehký adapter |
| krátké grafy | 5 min podle archivace | incremental export |
| dlouhé grafy / klimatologie | denně nebo při validované korekci | batch, cache a verzování |
| sensors/status | 1–5 min podle sensor telemetry | freshness a stav, ne pouhé RSSI |
| aktuální camera.jpg | 30–60 s dle reálného zdroje | copy/fetch, timestamp |
| camera archive | každých 5 min, pouze při úspěchu | oddělené úložiště a retence |
| CAP alerts | např. 5 min s ohledem na provider | ETag/Last-Modified/backoff |
| radar produkty | jen při změně/aktualizaci zdroje | cache + expirace |
| modelová předpověď | 30–60 min podle dostupnosti | cache model_id + issue_time |

Procesy exportu a jejich locky: žádné překrývající se plánované přepočty; timeouts, watchdog, backpressure, atomický rename, omezená paralelizace. Selhání cache se nesmí šířit na sběr WeeWX.

## 5. Datové rozhraní
Statický veřejný prefix `/data/v1/`. Příklad souborů:
- `current.json` – měření a jejich stáří.
- `status.json`, `sensors.json` – diagnostika.
- `series/<metric>/<granularity>/<year-or-window>.json` – krátké/dlouhé časové řady.
- `climate/<version>/yearly.json`, `monthly.json`, `records.json`.
- `alerts.json` – CAP s jednoznačným `source_status`.
- `forecast.json` – model_id a model_issued_at.
- `camera/index.json` – cesta k veřejně dostupným snímkům a času.

V každém JSON `schema_version`, `generated_at`, `source_updated_at`, `source`, `units`, `quality`, `origin`, `coverage` dle typu. JSON Schema + TypeScript typy generovat z jednoho zdroje; změny kontraktu verziovat. Atomicky publikovat a validovat před vystavením.

Náhodný cache-busting pouze pro live data; immutable cache jen pro obsahově verzované statické assety. CDN/reverse proxy nesmí cachovat stale alert jako platný bez TTL metadata.

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
- Monitoring HTTP response, stáří current.json, stáří DB, export job, CAP fetch, kamera, CPU/RSS/disk; nemíchat „žádné výstrahy“ s „data nejsou dostupná“.

## 8. Build/release
- CI na GitHub hosted runneru, anebo izolovaném build runneru mimo produkční Proxmox. Pokud self-hosted runner sdílí hostitele, ověřit CPU/RAM/IO izolaci.
- `npm ci`/Astro typecheck/lint/unit/E2E/build v CI.
- Python check/lint/test + golden fixtures; na produkci pouze wheel/venv z připraveného release, bez kompilace frontendu.
- Release s manifestem a checksum, artifact deploy do `/srv/loucka-weather/releases/<id>`, přepnutí `current` symlinku, smoke test, rollback.
- Dynamická data pod `/var/lib/loucka-weather/public-data`, ne uvnitř read-only release. Aplikovat file permissions.
- Staging `beta.pocasi-loucka.eu`; produkční Belchertown nechat do schválení.
- Build budget měřit na konkrétních verzích Astro; nepředpokládat magickou úsporu RAM, produkční LXC se však buildu neúčastní.

## 9. Srovnání alternativ
Astro vyhovuje především veřejné meteorologické prezentaci s klientskou interaktivitou a bez runtime Node. SvelteKit/Next.js jsou legitimní alternativa při bohaté aplikaci se sdíleným stavem či vlastním serverovým SSR. PHP lze použít pro backend, ale zavádět ho navíc k Pythonu nedává smysl. Rust zvažovat pouze po benchmarku na identickém datasetu, včetně ceny buildu a údržby. Frontend oddělený od zdroje prostřednictvím `/data/v1/`, aby bylo možné engine vyměnit.

## 10. Fáze a exit kritéria
P0 ověřit zdrojovou konfiguraci, DB schéma, mapování sond, live zdroj, kameru, CHMI licence.
P1 JSON contract + read-only export + testy DST/jednotek/QC.
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
