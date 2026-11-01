# Loučka Weather API v1 – produktový kontrakt, provoz a rozhodnutí

**31. 10. 2026. Stav: návrh kontraktu + částečná Fastify staging implementace (NOT DEPLOYED).** Kontrakt je nezávislý na Fastify/Go/Rust; lokální implementace je kandidátem k ověření, ne důkazem provozu ani meteorologické správnosti. Pravidla uvedená jako **návrh** nejsou uživatelem potvrzeným rozhodnutím ani dokladem existujícího MQTT/kamery/rekonstrukcí.

## 1. Účel a hranice

- WeeWX a původní Belchertown zůstávají funkční a nezávislé. Nové API je samostatný proces vedle Astro v novém staging LXC; Nginx Proxy Manager směruje `/api/v1/*` k API. Žádný zápis do `pocasi-loucka.eu.archive`, denních souhrnů nebo konfigurace WeeWX.
- Zdroj P0: read-only `archive` pro archivní proud, `archive_day_*` pro potvrzené denní souhrny, jeden sdílený LOOP/MQTT adaptér pro live (pokud potvrzen). Zbytek pouze jako volitelný další zdroj se samostatným kontraktem.
- Veřejné API v1 je pouze pro **jednu stanici** (`stationId=loucka`); případné multi-station porovnání je pozdější rozšíření (nelze automaticky připojit jiné DB tabulky).
- Odloženo mimo API v1: předpověď, radar/Windy, ČHMÚ CAP, export CSV, veřejné rekordy, historická webcam/timelapse. Podmínky externích služeb a kvalita rekordů se musí nejdříve ověřit.

## 2. Endpointy a odpovědi

| Cesta | Hlavní význam | Zdroj | Stav závislosti |
|---|---|---|---|
| `GET /api/v1/station` | stabilní metadata, skutečně zapnuté schopnosti a dostupné datasety | konfigurace + stav zdrojů | `location` může být null |
| `GET /api/v1/sensors` | aktivní/retired/unknown senzory, instalace a hloubky | ověřený katalog epoch | v1 vrací unknown, neodhaduje |
| `GET /api/v1/current` | poslední dostupný archivní interval, staleness | archive/cache | není pravé LOOP live |
| `GET /api/v1/live` | SSE snapshot, archivní změny a případná LOOP data | archivní observer; LOOP/MQTT adaptér až po ověření | staging publikuje archive fallback; LOOP/MQTT není připojeno |
| `GET /api/v1/history` | raw/hodinová/denní historie v `(from,to]` | archive, denní souhrny | s QC a mezerami |
| `GET /api/v1/statistics/daily` | denní agregace pro místní datum | archive_day_* nebo archive | LOOP extrémy rozlišit |
| `GET /api/v1/statistics/monthly` | měsíční agregace z denních souhrnů | archive_day_* | žádné nevážené průměry průměrů |
| `GET /api/v1/statistics/yearly` | roční agregace | archive_day_* | stejné vědecké normy |
| `GET /api/v1/camera/status` | ověřená metadata bezpečného snímku | capture worker (ne API DB) | do ověření kamera unavailable |
| `GET /api/v1/healthz` | liveness bez SQL | proces | nesmí propadnout při výpadku kamery |
| `GET /api/v1/readyz` | veřejně sanitizovaná readiness komponent | kontrola závislostí | bez interních IP/tokenů |

Payload pro první verzi je jednoznačně definován v `openapi.yaml`, `schemas/weather.schema.json`, `schemas/features.schema.json`. `schemas/metrics.json` je katalog jednotek; `schemas/aggregation-policy.json` určuje povolené agregace. Sady fixture jsou syntetické a nejsou dokladem kvality produkčních měření.

## 3. Datová autorita, provenience a kvalita

- `dataset=original` je výchozí a nemění původní hodnoty. `dataset=approved` lze zpřístupnit **až po formálním schválení** rekonstrukce, jejího rozsahu a verzované provenience. Je-li nedostupný, odpověď `503 DATASET_UNAVAILABLE`; nikdy tichý fallback na original.
- Odpověď obsahuje `dataset` a `dataRevision`; historický výpis i cache jsou jednoznačně verzované. `source` označuje archive/daily/live/reconstruction/derived; kvalita measured/reconstructed/derived/missing/suspect musí být podložená QC. Samotné `value != null` není důkaz validního měření.
- `NULL` není nula a ani `sensor=offline`. U event-only bleskových senzorů null může znamenat nepublikovanou událost, nikoliv nutně poruchu.
- Rekonstrukce se nesmí smíchat s originálem bez přiznaného původu, verze a rozsahu. Neprovádět opravy ani interpolace uvnitř běžného veřejného requestu. Vystavení validovaných oprav vyžaduje samostatně schválenou publikační politiku.
- Při změně schválených oprav změnit `dataRevision`, zneplatnit příslušnou cache a provést regresní testy agregací. Při změně původního archivu obdobně označit dotčené intervaly.

## 4. Meteorologická agregace – zakázat nesmyslné kombinace

Neexistuje jedna univerzální funkce pro všech 45 veličin. Vymahatelný seznam je v `schemas/aggregation-policy.json` (8 veličin má statistiky dočasně vypnuté). Parametr `aggregation` je pro den/měsíc/rok povinný a neplatná dvojice metrika × agregace končí `422 INVALID_AGGREGATION`. Existující schéma `YearlyResponse` a `PeriodStatsResponse` to validují také na výstupu.

- Teploty/vlhkost/tlak: průměr **vážený délkou archivního intervalu**, u denních souhrnů preferovat `wsum/sumtime`; min/max uvést spolu se zdrojem a případným časem. Sum teplot je zakázán.
- Srážky `rain`: sčítat **intervalové úhrny**; datum podle místního dne a `(start,end]`. `rainRate` je intenzita, ne úhrn; jeho SUM je zakázán. **Nekonvertovat pouhým sečtením nenulových intenzit na déšť.**
- Větrná rychlost: časově vážený skalární průměr; poryv `windGust`: maximum. `windDir`: **vektorový** směr s odpovídající rychlostí (klidná/neurčitá výslednice = null); obyčejný mean úhlů zakázán. `windGustDir`: směr při maximálním poryvu, nikoli jeho aritmetický průměr. Vektorové souhrny jsou v `archive_day_wind`.
- Lightning counters: dokud není doloženo, zda jde o intervalové inkrementy či kumulativní hodnoty po resetech, **nepovolit veřejnou agregaci výskytu blesků**. Podobně neagregovat `windrun`, `wbgt`, `humidex`, `outEquiTemp` bez ověřené semantiky.
- `ET24`/`dayET`: nesčítat denně kumulované/rolling veličiny jako jednotlivé intervalové úhrny; mapování vyžaduje ověření. Směr/průměr/suma neplatné dle katalogu.
- Denní maxima v `archive_day_*` mohou obsahovat LOOP extrémy odlišné od pětiminutových `archive`; odpovědi obsahují `extremaSource=loop|archive|unknown|not_applicable` a `extremaObservedAt` (null, pokud nedoložen).
- `count` znamená počet platných měření / odpovídajících agregátů, nikoliv automaticky počet blesků. Pro `count` je výstupní jednotkou `count` bez ohledu na `units`.

## 5. Časy, úplnost, grafy

- Absolutní instants předávat UTC ISO 8601 se `Z`. Archivní `dateTime` je **konec intervalu**, jeho začátek `dateTime - interval×60`. Zohlednit historicky odlišné délky (nejde vždy o 5 min).
- Výběr historie vychází z `(from,to]`. Hodinové bucket hranice jsou UTC; denní souhrny používají místní `Europe/Prague` den. Podzimní den může mít 25 hodin, jarní 23. Denní souhrny nelze zarovnat na mechanických 86400 sekund.
- `archive_day_*` klíčuje datum začátkem lokálního dne; denní, měsíční a roční statistiky proto čtou kalendářní rozsah `[start,end)`. Raw archivní intervaly nadále používají `(from,to]` podle času konce WeeWX záznamu.
- Pro raw vracet jednotlivé intervaly a zachovat `NULL`. Pro hourly/daily vytvořit agregáty **po metrice podle katalogu**, jasně uvést výsledné resolution/aggregation, čas začátku/konce bucketu, úplnost, min/max a čas extrémů, pokud existují. Nevyplňovat mezery lineární interpolací ve výchozím režimu.
- `resolution=auto` vybere granularitu nejvýše do `limit` a přitom zohlední extrémy. Žádné tiché useknutí. Pokud požadované explicitní rozlišení limit nesplní, `422 LIMIT_EXCEEDED` s bezpečnou zprávou. Navržená výchozí hodnota `limit=2000`, hard cap 10000.
- **Návrhový horní rozsah:** raw do 31 dnů; hodinová historie do 2 let; denní historie do rozsahu archivu. Tyto limity je nutné ověřit benchmarkem a skutečnou dostupností 78 denních tabulek, nikoliv spustit těžké dotazy bez měření.
- `Completeness.expected` může být `null` kvůli známým mezerám, změnám intervalu a instalace senzorů; neodvozovat očekávaných 288 denních položek. Při `expected=0` je `fraction=null`.

## 6. Live feed a degradované režimy – cílový kontrakt a stav staging kódu

- Pokud je prokázán existující LOOP/MQTT feed, backend může mít jeden interní subscribe a prohlížečům vystavit **SSE**; SSE je jednosměrné a nepotřebuje uživatelské přihlášení. Je to pracovní preference, nikoliv potvrzená vhodnost bez auditu brokera.
- Cílové události `snapshot`, `observation`, `status`, `reset` obsahují verzovaný JSON `LiveEvent`; nezveřejňovat MQTT topic/credentials ani privátní IP. SSE MIME `text/event-stream`, heartbeat komentář každých 15 s, `retry: 5000`, stav `stale` po 120 s bez platného měření. Čas `observedAt` je skutečné měření a může být starší než `emittedAt`.
- Aktuální Fastify staging kód nepřipojuje LOOP/MQTT. Archivní fallback poskytuje `snapshot`/`reset` a samostatné `archive-updated`; nepublikuje falešné LOOP `observation` ani `status`. Observer kontroluje archiv zhruba po 15 s, používá dvouhodinový překryv a stránkované dohánění. Kód nebyl ověřen proti cílovému WeeWX schématu.
- Na reconnect zasílá EventSource `Last-Event-ID`. Replay je omezený na posledních 256 událostí, po ztrátě historie posílá `reset` a nový snapshot. Pomalé klienty kód odpojí. V proxy vypnout SSE buffering. Polling archive každou sekundu pro každého uživatele je zakázán.
- Při výpadku live lze zobrazit `archive_fallback` s pravdivým označením archivu; nikdy jej nevydávat za skutečné live. Stav kamery ani nelegální/nevěřený radar nesmí blokovat ostatní meteo endpointy.

### Archivní změny a cílená obnova klientských grafů

Obnova není přesně načasovaný `setInterval(300s)`. Částečný read-only observer v `api/src/live.ts` a `api/src/db.ts` detekuje zapsané řádky `archive`, používá překryvné okno a stránkovaný catch-up a vysílá `archive-updated` přes `/api/v1/live` SSE. Událost obsahuje dotčený časový rozsah, revizi a `summaryStatus=unknown`; připravenost souhrnů se neodhaduje. Implementace není nasazená ani ověřená proti cílovému WeeWX schématu. Podrobný kontrakt a limity: [ARCHIVE_REFRESH_CONTRACT.md](ARCHIVE_REFRESH_CONTRACT.md).

## 7. Kamera, senzory a schopnosti stanice

- Webkamera: status API veřejně vrací pouze sanitizovaná metadata a odkaz na serverově publikovaný maskovaný snímek, ne URL privátní kamery. Neověřený zdroj => `disabled`/`unavailable`, nikoliv falešný aktuální obrázek. Capture worker a maskování/retence jsou oddělené; kamera má vlastní readiness.
- Sen­zory: identifikovat instalaci a historické epochy/hloubky z ověřené evidence. Hodnota `soilMoist1` v DB nestačí k automatickému určení kalibrace; některé další sondy jsou dnes bez aktuálních měření. Metadata mohou ukazovat `unknown`, `not_installed`, `retired` nebo `unavailable`; aktivitu nestanovovat jen z non-null.
- Metadata `StationResponse.capabilities` a `availableDatasets` musí odpovídat reálně zapnutým službám. Schéma pouze popisuje možnosti, nevydává se za dostupnou kameru ani schválenou rekonstrukci.

## 8. HTTP, bezpečnost a výkon

- Veřejné čtecí API **bez uživatelské autentizace** a bez credentialed CORS; default povolen stejný origin webu Astro. Kdyby vznikla admin nebo write cesta, patří do samostatné autentizované služby a nové revize threat modelu.
- Nginx Proxy Manager filtruje známé automatické skenery před API; neznámé URL vracejí levné 404. API validuje všechny parametry, allowlist metrik, časový rozsah a numeriku, používá parametrizované SELECT a samostatný read-only MariaDB účet.
- Chyby JSON: `400 BAD_REQUEST` / `UNKNOWN_METRIC`, `422 INVALID_AGGREGATION` / `INVALID_RANGE` / `LIMIT_EXCEEDED`, `429 TOO_MANY_REQUESTS` s Retry-After, `503 UPSTREAM_UNAVAILABLE` / `DATASET_UNAVAILABLE`, `500 INTERNAL_ERROR` bez SQL/IP/credential. Prázdná historie je `200 []`, nikoliv 404 či samovolná nula.
- ETag/If-None-Match/304 pro stabilní JSON snapshoty; klíč cache obsahuje metric, time window, resolution, units, dataset, dataRevision, QC policy. `current` typicky krátké TTL (návrh 15s), historické dotazy delší (návrh 1h) a invalidace po změně/rebuild summary. **SSE a readiness nesmí být cachovány jako statické JSON.**
- Navržené startovní parametry pro staging (NE schválené limity): DB pool max 3 spojení, SQL timeout ~2s na krátké dotazy, API limit 60 req/min/IP s burstem, max 2 SSE spojení/IP, maximální JSON odpověď ~2 MiB. Udržet důvěryhodné real-IP jen ze známých proxy. Limity potvrdit až měřením p95/p99, RSS, CPU, DB duration/pool wait, cache hit a reconnectů.
- `healthz` = liveness samotného serveru; `readyz` = sanitizovaná readiness. Degradovaná kamera neznamená nefunkčnost meteorologického archivu. Nemapovat diagnostiku s interním hostname ani hesly na public API.

## 9. Podmínky pro akceptaci

1. CI PASS pro OpenAPI 3.1, JSON Schema Draft 2020-12, jednotky, validní/nevalidní agregace, syntetické složité intervaly, DST, QC a senzory.
2. Případy z reálně **ověřeného, izolovaného snapshotu**: `usUnits` 1/16/17, konec intervalu, denní souhrny, LOOP extrémy, blesky, vlhkost půdy, srážky 2021, výpadky. Testovací fixture nesmí vydávat neověřené údaje za pravdu.
3. Fastify + případné Go/Rust implementace na izolovaném stagingu mají identické odpovědi pro stejný dataset, včetně chyb; kontraktový `run_live.py` je jen příprava, dosud nebyl vykonán na třech implementacích.
4. Ověřit WebSocket/MQTT zdroj, dostupnost kamery a privátní URL, práva k externím produktům. Před produkcí otestovat rozsahy, cache, readiness, bezpečnost a rollback.

## 10. Otevřené otázky vyžadující ověření nebo výslovné potvrzení

| Rozhodnutí | Doporučený výchozí návrh | Co ještě chybí |
|---|---|---|
| Preferovaný runtime | Fastify/Node ve stagingu, Go jako alternativa | reálný srovnávací benchmark nových endpointů |
| Zpřístupnit schválené rekonstrukce | pouze `original` do QC sign-off | vydané a verzované rekonstrukce, pravidla provenience |
| Live transport a prahy | SSE, 15s heartbeat, 120s stale | audit skutečného MQTT/LOOP feedu a propustnosti |
| Kamera | status a latest bezpečný snapshot | původ a práva, maskování, retence, dostupnost |
| Senzory a půdní sondy | neověřené zůstanou unknown | přesné epochy instalace, hloubky, kalibrace |
| Agregace custom veličin | nepovolit dokud nejsou ověřeny | semantika resetů blesků, ET24, windrun, odvozenin |
| Provozní limity | konzervativní staging hodnoty z části 8 | benchmarky, profil provozu, bezpečnostní testy |
| Dlouhá historie a extrémy | weather API bez veřejného `/records` v MVP | výsledky QC a rozhodnutí prezentace rekordů |

**Následující krok:** Doplněné kontrakty lze nyní implementovat proti mock odpovědím. Finální podpis designu a produkční nasazení však musí počkat na výše uvedené ověření; žádné GitHub CI nenahrazuje kontrolu reálné meteorologické správnosti.

### Referenční zdroje
- WeeWX 5.2 devnotes: https://weewx.com/docs/5.2/devnotes/
- WeeWX wind vector semantics: https://www.weewx.com/docs/customizing.htm
- OpenAPI 3.1.1: https://spec.openapis.org/oas/v3.1.1.html
- WHATWG/MDN SSE: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
