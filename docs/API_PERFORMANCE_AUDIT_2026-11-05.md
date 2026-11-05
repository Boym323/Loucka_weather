# Issue #36 – opakovatelný read-only audit Fastify API (5. 11. 2026)

## Rozsah a důkazy

Výchozí stav pochází z **LXC měření 2. 11. 2026 před PR #35**, nikoli z dnešního testu:
- `/api/v1/climate/records`: první zkoušený GET 4 829 ms, následných 11 GET 1–4 ms.
- Ve starém 8vzorkovém běhu bylo p95 rekordů 4 555 ms (u 8 vzorků jde fakticky o maximum).
- Node RSS přibližně 570 MiB, RssAnon ~534 MiB, RssFile ~36 MiB; V8 heap a native paměť tehdy nebyly odděleně sledovány.
- Historicky 2× ukončení systemd SIGKILL při `TimeoutStopSec=15s`; není důkaz, že příčinou byly SSE nebo DB pool.
- **Memory leak ani skutečné zrychlení po PR #35 nebyly prokázány.** Nebylo provedeno dnešní zatěžovací měření LXC.

Změny v tomto PR: archivní observer explicitně vyčká na již běžící read-only SELECT před uzavřením poolu; unit/inject testy kryjí souběžné zpracování, ETag/304, stale limit, odpojení SSE a drain SELECT. Profilovací skript rozlišuje první pozorování a další GET, umí ověřit ETag/304 klimatických rekordů a jednorázově odečte RSS/anon/file/threads ze systemd procesu. Netvrdí, že první pozorovaný GET je **cold**.

## 1. Nasazení – ověřit skutečnou revizi

Na staging LXC (bez restartu, pouze čtení):

```bash
curl --fail --silent --show-error --max-time 5 https://dev.pocasi-loucka.eu/deployment.json
cat /var/lib/loucka-weather-api/active-commit
runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse HEAD
systemctl show -P MainPID loucka-weather-api.service
systemctl show -P NRestarts loucka-weather-api.service
```

`deployment.json` patří nasazenému **frontendu**; `active-commit` označuje poslední aktivovaný commit API, ne automaticky běžící binární artefakt. Pro úplné potvrzení zkontrolovat `/srv/loucka-preview/current/.source-commit`, skutečný proces a nasazovací log. GitHub `main` sám o sobě nasazení nedokazuje.

## 2. Šetrná lokální HTTP sonda

```bash
python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py
```

Výhradně 127.0.0.1:3100: osm **postupných** GET na každý ze čtyř endpointů, 0,3 s pauza mezi GET, plus dva podmíněné ETag GET (celkem nejvýše 34). Žádné paralelní requesty, žádný restart ani SQL příkazy, žádný HTTP přístup ke GW3000.

Zaznamenat JSON s UTC časem, přesnou revizí, p50/p95 (při osmi vzorcích p95 = nejhorší odezva), `first_observed_ms`, `later_p50_ms`, ETag/304 a procesní RSS/RssAnon/RssFile. Nezaměňovat první pozorovaný GET za skutečně studený. Sonda pracuje s existujícím stavem cache a sama ho nemaže.

Opakovat po více než 20 minutách od předchozího naplnění cache, následně znovu za dalších více než 20 minut; nelze tím vynutit nezávislý cold start a první expirovaná odpověď smí být stale-while-revalidate ve stejné kalendářní době. Pro skutečné cold měření je nutné předem domluvené řízené spuštění služby ve stagingu; nevynucovat jej benchmarkem na živé DB. Nikdy nezatěžovat produkční databázi masivní HTTP konkurencí.

## 3. Rozpad SQL / CPU / paměti

Na stagingu je dostupné **opt-in** `WEATHER_API_PERF_LOG=YES`. Zapnutí vyžaduje oprávněný zásah do `/etc/loucka-weather/api.env` a restart **pouze v plánovaném servisním okně**. Po zkoušce vypnout. Událost `climate_records_refresh` obsahuje `queryMs` pro `outTemp`, `rain` a `windGust`, `queryWallMs`, `processingMs`, `rssMiB`, `heapUsedMiB`, `heapTotalMiB`, `externalMiB`, `arrayBuffersMiB`.

`queryMs` měří dobu čtecí funkce **včetně čekání na pool a mapování**; není to samotná doba SQL vykonávání na serveru. `queryWallMs` zachycuje souběžné čtení tří tabulek, tedy obecně není součtem `queryMs`. `processingMs` je výpočet a validace. Všechny tyto hodnoty se aktuálně logují pouze u úspěšného refresh a zařazení mezi cold/fresh/stale nelze z logu samotného jednoznačně určit. Žádné DB heslo ani soukromé adresy se nesmějí dostat do reportu.

U časové řady sledovat **RSS i heapUsed a external**, trend GC lze v odděleném profileru reprodukovat, ale jednotlivá hodnota RSS ani RssAnon leak nedokazuje. Nepřidávat RAM a neměnit limity poolu bez opakovaných důkazů.

## 4. Indexy a plány SQL – výhradně read-only

Pouze pod účtem s oprávněním SELECT a v kontrolovaném staging sezení lze nejprve použít `SHOW INDEX` a potom `EXPLAIN SELECT` pro `archive_day_outTemp`, `archive_day_rain` a `archive_day_windGust`, se stejnými `dateTime >= ? AND dateTime < ? ORDER BY dateTime ASC LIMIT ?` hranicemi jako endpoint. Zkontrolovat `key`, `type`, `rows`, `Extra` a případné `filesort`. Typicky očekávat použití indexu `dateTime` / primárního klíče, ale bez živého plánu to **není potvrzeno**.

Neprovádět `ANALYZE TABLE`, `OPTIMIZE TABLE`, `ALTER TABLE`, `CREATE INDEX`, SQL zápisy ani `EXPLAIN ANALYZE`. Nástroje a případný výstup nesmějí odhalit DB credentials.

## 5. Shutdown a korektnost

- Automatické regresní testy: souběžní klienti sdílí stejná tři čtení; ETag/304 nevytváří další SQL; 60minutový limit stale a půlnoc zůstanou bezpečné; aktivní čtení se dokončí před zavřením poolu; SSE se uvolní i při následné chybě zavírání.
- Reálný shutdown se SSE klientem, skutečnými dotazy a selháním DB poolu vyžaduje **oddělené, plánované staging okno** s kontrolou `journalctl`, `NRestarts` a stop duration. Samotný fake-reader test nelze vydávat za ověření `TimeoutStopSec=15s` na LXC.
- Nezvyšovat `TimeoutStopSec` bez zjištění příčiny. Po výpadku nepřepisovat historické hodnoty, potvrzení QC ani data GW3000.

## 6. Závěrečný staging postup pro potvrzení PR #54

Po sloučení do `main` se testovací LXC synchronizuje přes `loucka-preview-sync.timer` a při změně `api/` **může automaticky restartovat Fastify**. Před sloučením ověřit, že je na stagingu krátký restart přípustný; na produkčním WeeWX nic neprovádět. Následující příkazy jsou určeny **výhradně pro root shell testovacího LXC**, nikoliv pro jiné stroje.

### A. Ověřit skutečně aktivované API

```bash
systemctl is-active --quiet loucka-weather-api.service || exit 1
systemctl show -p MainPID -p NRestarts -p TimeoutStopUSec loucka-weather-api.service
cat /var/lib/loucka-weather-api/active-commit
runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse HEAD
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/healthz
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/readyz
```

`active-commit` musí odpovídat vydané revizi (ne pouze GitHub `main`). Při nejistém stavu deploye nic nerebootovat a nejprve číst `journalctl -u loucka-preview-sync.service -n 60 --no-pager`.

### B. Pouze SELECT-only SQL indexy a plány

Po nasazení nového commitu lze spustit kontrolní skript z `api/scripts/read-only-query-plan.mjs`, který nejdříve **ověří SHOW GRANTS**, poté udělá jen `SHOW INDEX` a `EXPLAIN SELECT` pro `archive_day_outTemp`, `archive_day_rain` a `archive_day_windGust`. Nikdy nenačítá skutečné řádky a nikde nevypisuje přihlašovací údaje. Pomocí přechodné systemd jednotky se bezpečně předá již používaný root-owned env soubor, ale **Node běží pouze jako `loucka`**:

```bash
systemd-run --quiet --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node /home/loucka/Loucka_weather/api/scripts/read-only-query-plan.mjs
```

Skript provede pouze read-only administrativní a plánovací dotazy: `SHOW GRANTS`, 3× `SHOW INDEX`, 3× `EXPLAIN SELECT` (celkem **7** dotazů), bez `EXPLAIN ANALYZE`. Zjištěný `type=ALL` u malé plně čtené denní tabulky není sám o sobě důvodem ke změně indexu: před změnami nejprve vyhodnotit skutečný čas dotazů.

### C. Záměrný restart pouze testovacího API s otevřeným SSE

Následující krok **krátce přeruší staging API**. Proveď pouze ve chvíli, kdy je to přijatelné. Nejde o automatický test produkční WeeWX ani změnu MariaDB.

```bash
curl --noproxy '*' -fsSN --max-time 30 \
  http://127.0.0.1:3100/api/v1/live >/dev/null 2>&1 &
sse_pid=$!
sleep 2
start_epoch=$(date +%s)
start_ms=$(date +%s%3N)
systemctl restart loucka-weather-api.service
restart_rc=$?
end_ms=$(date +%s%3N)
wait "$sse_pid" || true
echo "restart_rc=$restart_rc elapsed_ms=$((end_ms-start_ms))"
systemctl show -p ActiveState -p MainPID -p NRestarts loucka-weather-api.service
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/healthz
curl -fsS --max-time 5 http://127.0.0.1:3100/api/v1/readyz
journalctl -u loucka-weather-api.service --since "@$start_epoch" \
  --no-pager -o short-iso
```

Úspěch vyžaduje `restart_rc=0`, obě zdravé odpovědi, ukončené původní SSE připojení a **žádný nový systemd timeout/SIGKILL**. Ruční restart neprokazuje všechna možná časování SQL dotazů; dříve přidaný CI test drainu in-flight SELECT tuto část pokrývá synteticky. Při timeoutu nezvyšovat slepě `TimeoutStopSec`; zachovat logy a opravit skutečnou příčinu.

### D. Pasivní opakovaná kontrola

V několika oddělených časových oknech (alespoň po TTL 20 minut) zopakovat `python3 deploy/lxc/preview-performance-check.py`. Pokud jsou potřeba `queryMs/heapUsed/external`, zapnout dočasně `WEATHER_API_PERF_LOG=YES` během servisního okna a vyvolat úspěšný refresh po TTL. Bez pozorovaného refresh s diagnostikou nevyhlašovat cold query benchmark ani vyloučení dlouhodobého úniku.

## Stav dokončení

| Oblast | Stav k 5. 11. 2026 |
|---|---|
| Čtení kódu a historického auditu | Ověřeno na GitHub `main` `dd816c5` |
| Drain právě běžícího observer SELECT | Implementováno; CI zelené, staging neověřen |
| Cache / 304 / shutdown regresní testy | Prošly CI Node 24 a izolovanou MariaDB, reálný LXC dosud netestován |
| Šetrná profilovací sonda a metodika | Připraveno k provedení na LXC |
| Aktuální cold / warm / RSS trend | **Neměřeno na LXC** |
| SQL EXPLAIN a indexy | **Neověřeno proti DB** |
| Skutečný systemd stop při výpadku DB | **Neověřeno na LXC** |

CI na commitu `b0c5114c` dne 5. 11. 2026: `typecheck-and-inject`, `isolated-mariadb` a `LXC preview deployment config` zelené. Tyto výsledky se nesměšují se skutečným provozem. Závěr je nutné doplnit až po konkrétních LXC měřeních. Žádné změny v produkční MariaDB, rekonstrukci, WeeWX, GW3000 ani PBS.

## První skutečná LXC sonda předaná 5. 11. 2026 – dosud nesrovnatelné s cold baseline

Uživatel předal JSON z příkazu `python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py` na testovacím LXC. Přesný UTC timestamp a Git SHA procesu/API **nebyly v JSON ani vedle měření uvedeny**. Formát výstupu odpovídá **staršímu profilu skriptu** bez `first_observed_ms`, `later_p50_ms`, `records_cache_etag` a `process_memory_before/after`; nepřiřazovat proto tuto sondu k novému diagnostickému skriptu v PR #54.

| Endpoint | GET (200 OK) | p50 (ms) | p95=max (ms) |
|---|---:|---:|---:|
| `/api/v1/readyz` | 8/8 | 30,19 | 83,55 |
| `/api/v1/live/current` | 8/8 | 1,50 | 2,70 |
| `/api/v1/sensors/channels` | 8/8 | 1,90 | 32,27 |
| `/api/v1/climate/records` | 8/8 | 2,23 | 555,96 |

Celkem **32/32 GET bez chyby**, následný podmíněný GET `/sensors/channels` vrátil `304` s `Cache-Control: private, max-age=30`. Starý baseline pro rekordy (2. 11.): 4 829 ms první zaznamenaný GET, další 1–4 ms. Poměr těchto **dvou pozorovaných maxim** je asi 8,7, ale bez prokázání studené cache a verze API **nejde o potvrzené zrychlení**. Aktuální paměť, trend RSS vs heap, actual queryMs ani 304 klimatických rekordů tímto během ověřeny nebyly.

**Bezpečný další krok:** dočasně spustit aktualizovaný `preview-performance-check.py` z head větve PR #54 pouze jako neprivilegovaný proces na staging LXC, bez checkoutu nebo restartu serveru. Ověřit současně `/deployment.json`, `active-commit` a skutečný běžící proces, opakovat měření po TTL a případně provést oddělený plánovaný shutdown test. Issue #36 neuzavírat.

## Druhá skutečná LXC sonda – 5. 11. 2026, 14:02:22 UTC (15:02 CET)

Uživatel spustil novou revizi skriptu přímo z `FETCH_HEAD:deploy/lxc/preview-performance-check.py` přes `git show | python3 -`, **bez nasazení PR #54 a bez restartu backendu**. Následná kontrola hlásila:

- Frontend `/deployment.json`: `main`, `dd816c5196a89c0c611c22a4a42ce7dc3a2d55c3`, nasazeno `2026-11-03T14:41:35Z`.
- Evidovaný `/var/lib/loucka-weather-api/active-commit`: stejné SHA `dd816c5…`. API proces PID `122263`, systemd `NRestarts=0`.
- Tato evidence potvrzuje správnou aktivovanou revizi podle deploy markeru, ale sama o sobě nekontroluje obsah momentálně běžících `dist/` souborů.
- 32/32 sekvenčních HTTP GET bez chyby, navíc 2 podmíněné GET s `304`: senzory `private, max-age=30`, rekordy `no-cache`.

| Endpoint | GET 200 | p50 (ms) | p95=max (ms) |
|---|---:|---:|---:|
| `/api/v1/readyz` | 8/8 | 31,45 | 50,72 |
| `/api/v1/live/current` | 8/8 | 1,40 | 3,11 |
| `/api/v1/sensors/channels` | 8/8 | 1,49 | 30,66 |
| `/api/v1/climate/records` | 8/8 | 1,48 | 4,21 |

Rekordy: `first_observed_ms=1,43`, `later_p50_ms=2,26`. Z toho vyplývá pravděpodobně **zahřátá cache**; studený refresh z tohoto běhu nelze vyčíst. Dřívější maximum 555,96 ms v první sondě a historické 4 829 ms nejsou přímo srovnatelné se současnými cache hity.

| Procesní paměť | Před | Po |
|---|---:|---:|
| RSS | 104,12 MiB | 104,13 MiB |
| Anon | 67,87 MiB | 67,88 MiB |
| File | 36,25 MiB | 36,25 MiB |
| Swap | 0 | 0 |
| Threads | 11 | 11 |

Historický baseline ~570 MiB RSS z 2. 11. je asi 5,5× vyšší než současných ~104 MiB; relativní rozdíl cca 82 %. **Nedokazuje to příčinnou zásluhu PR #35**, dlouhodobou stabilitu heapu ani absenci memory leaku. Také nemáme `heapUsed`, `external` a `queryMs`, protože se logují pouze při zapnutém opt-in diagnostickém profilu během refresh.

**Zbývá:** skutečný expired/cold refresh v různých 20minutových oknech (včetně rozlišení stale-while-revalidate), opakovaná paměťová řada, read-only `SHOW INDEX/EXPLAIN SELECT` nad denními tabulkami a reálný systemd/SSE/DB shutdown pro PR #54. Neprovádět zátěž nebo zápisy do produkční DB. Do dokončení ověření zůstává PR draft, Issue otevřené.
