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

## Stav dokončení

| Oblast | Stav k 5. 11. 2026 |
|---|---|
| Čtení kódu a historického auditu | Ověřeno na GitHub `main` `dd816c5` |
| Drain právě běžícího observer SELECT | Implementováno v pracovní větvi, čeká na CI a staging |
| Cache / 304 / shutdown regresní testy | Doplněny do PR, čeká na CI |
| Šetrná profilovací sonda a metodika | Připraveno k provedení na LXC |
| Aktuální cold / warm / RSS trend | **Neměřeno na LXC** |
| SQL EXPLAIN a indexy | **Neověřeno proti DB** |
| Skutečný systemd stop při výpadku DB | **Neověřeno na LXC** |

Závěr je nutné doplnit až po konkrétních měřeních a nesměšovat výsledky CI se skutečným provozem. Žádné změny v produkční MariaDB, rekonstrukci, WeeWX, GW3000 ani PBS.
