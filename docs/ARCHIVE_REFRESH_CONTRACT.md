# Archivní aktualizace a SSE událost `archive-updated` – návrh API v1

**Stav: DRAFT, pouze kontrakt a offline referenční testy.** Nejde o skutečně nasazeného pozorovatele MariaDB ani o změnu WeeWX. Tento dokument konkretizuje oddělený archivní tok při typicky pětiminutovém intervalu.

## Cíl a dvě nezávislé datové cesty

- **Live LOOP/MQTT → interní adaptér → SSE `observation`**: aktuální hodnoty v reálném čase, nevytvářejí nové archivní SQL záznamy.
- **WeeWX → MariaDB `archive` + `archive_day_*` → jeden společný read-only observer → SSE `archive-updated`**: frontend získá informaci o změně uložené historie a cíleně obnoví grafy a statistiky. Observer **nevypočítává interval podle hodin, ale skutečně zapsaných řádků**.

Ve WeeWX `archive.dateTime` označuje **konec** intervalu `(start,end]`, `archive.interval` je délka v minutách. Historická data obsahují vedle 5min intervalů i další délky. Nový záznam například končící v 07:05 může být v DB viditelný až po 07:05; `archive_delay` bývá obvykle 15 s, ale aktuální konfigurace stanice ještě nebyla ověřena. Nepředpokládat pevný čas zveřejnění. Viz [WeeWX StdArchive](https://www.weewx.com/docs/5.2/reference/weewx-options/stdarchive/) a [databázová struktura](https://www.weewx.com/docs/5.1/custom/introduction/).

## Navržené chování observeru

1. **Při startu**: načíst výchozí záznamy a poslední `dateTime`, zapsat vlastní procesní watermark a nabídnout `snapshot` novým SSE klientům. Výchozí snímek nevydávat za novou událost; po restartu oznámit `reset` a klient si ověří aktuální ETag.
2. **Jeden sdílený poller na celé API**: výchozí kandidátní interval **15 sekund**, s jitterem/backoff při chybě. Nikdy neotevírat SQL spojení pro každého SSE klienta a nikdy neprovádět DB kontrolu synchronně v HTTP handleru.
3. **Nové řádky**: číst inkrementálně `dateTime > :cursor`, indexovaně a v malých stránkách, dokud není dohnáno zpoždění. Například parametrizovaný read-only dotaz:
   ```sql
   SELECT dateTime, usUnits, `interval`, outTemp, outHumidity, rain, windSpeed
   FROM `pocasi-loucka.eu`.`archive`
   WHERE dateTime > ?
   ORDER BY dateTime ASC
   LIMIT 250;
   ```
   Úplný hash pro detekci revizí musí zahrnovat všechny **skutečně zveřejněné** relevantní metriky včetně `NULL`, `usUnits`, `interval`; výše je pouze zkrácený ilustrativní SQL dotaz. Parametry bezpečně vázat, nikoli interpolovat.
4. **Opožděné zápisy a přepisy**: nezávisle kontrolovat **omezené překryvné okno**, návrhově poslední **2 hodiny archivních časů**, a porovnávat `dateTime` + normalizované otisky původních hodnot; nikdy nekontrolovat jen `MAX(dateTime)`. Jen tak se v okně zjistí dodatečný záznam, přepis nebo smazání při stejném maximu. Okno musí být kompletní, ne stránka s chybějícími řádky. Při delším výpadku používat stránkovaný catch-up od uloženého watermarku, **nepotvrzovat dokončení před dočtením**.
5. **Deduplikace**: stejný záznam a stejný otisk znovu nic nevyvolá; několik nových řádků po výpadku lze seskupit do jedné události s intervalem změn. Pozdní vložení je `backfilled`, změna hodnoty `revised`, odstranění `deleted`, nový konec intervalu `appended`. Události doručovat nejméně jednou; frontend musí být idempotentní podle revize a `eventId`.
6. **Omezení detekce**: změny starší než překryvné okno (nebo opravy denních souhrnů bez změny `archive`) se **tímto mechanismem spolehlivě nezjistí**. Vyžadují samostatnou explicitní revizi `dataRevision`, administrativní invalidaci nebo kontrolovaný periodický audit. Není správné tvrdit, že každou historickou opravu odhalí `MAX(dateTime)`.
7. **Jediný logický observer**: v MVP jediný API proces s workerem. Při horizontálním škálování musí být jeden leader nebo společný pub/sub a konzistentní stav cache. Nespouštět několik nekoordinovaných pollerů po každém API procesu.
8. **Read-only**: přístup SELECT k produkčním `archive` a `archive_day_*` bez změny WeeWX, original SQL, triggerů, indexů nebo MQTT brokera.

## Kdy je změna připravená pro grafy a kdy pro statistiky?

- **První fáze – potvrzený archiv**: teprve když je nový řádek viditelný jako commitnutý z read-only spojení, observer odešle `archive-updated` s `summaryStatus=pending` (nebo rovnou `ready`, pokud jsou souhrny ověřené).
- **Druhá fáze – denní souhrny**: `summaryStatus=ready` je dovoleno až po **ověření** příslušných `archive_day_*` tabulek pro dotčené místní dny a relevantní metriky, v konzistentním čtecím snímku; prostá změna `archive.MAX(dateTime)`, čekání pevného počtu sekund ani nezměněný denní součet nestačí.
- Pokud konkrétní denní souhrn nemá dostupný prokazatelný indikátor dokončení, API jej označí `unknown` a **nepředstírá připravenost**. Výpočet přímo z `archive` může být alternativou jen u veličin, kde je vědecky ekvivalentní a výslovně povolený `aggregation-policy.json`; nesmí falešně reprodukovat LOOP extrémy.
- Na stejné změně mohou vzniknout dvě SSE zprávy: `pending` při novém archivu a `ready` po potvrzení souhrnů. Druhá událost musí mít **nové** `eventId` / `dataRevision`, aby zneplatnila i cache statistik. Pokud souhrny nejsou potvrzené, opakované stejné dotazy nesmějí vracet „nové“ statistiky z neověřené cache.
- Pro místní dny správně respektovat interval `(start,end]`, přechody CET/CEST a při přesné půlnoci příslušnost hraničního archivu dle WeeWX. Prohlížeč nesmí odvozovat místní den jen z prostého UTC data.

## SSE wire kontrakt

SSE zůstává `GET /api/v1/live`, `Content-Type: text/event-stream`, bez bufferování v proxy. Nová událost má `event: archive-updated`, `id: <eventId>` a jedno JSON `data:` dle `schemas/features.schema.json#/$defs/ArchiveUpdatedEvent`. Stávající `snapshot/observation/status/reset` jsou zachované. Oba typy payloadů jsou pod `$defs/LiveMessage`.

Příklad je v `tests/fixtures/archive-updated.json`. Povinná pole:
- `affectedEndTimeFrom`, `affectedEndTimeTo`: nejmenší a největší **včetně** dotčené koncové časové značky v UTC; nejsou lokální časy ani přesné začátky sledovaných intervalů.
- `latestArchiveAt`: poslední známý koncový čas archivu po změně.
- `changeType`: `appended | backfilled | revised | deleted`.
- `summaryStatus`: `pending | ready | unknown`.
- `changedRecords`: počet dotčených uložených záznamů, nikoli počet změněných metrik.
- `dataRevision`: neprůhledný neprázdný token aktuálního obsahu/obnovení. Reference používá unikátní ID procesu a pořadí události; produkční implementace musí zajistit shodu s revizí v HTTP odpovědích a ETag. Při restartu se token procesu nesmí opakovat.

**Frontend:** při `archive-updated` zneplatnit pouze odpovídající cache klíče `dataset=original`, `units`, `metric` a dotčené UTC/Europe/Prague rozsahy. Pro aktuální archiv zavolat `/current`, pro otevřené grafy cíleně `/history` s `If-None-Match`, zpracovat 304. Statistiky `daily/monthly/yearly` znovu načíst při `summaryStatus=ready` (ne při `pending`). Zároveň může pokračovat příjem LOOP událostí. Nepřenačítat celé stránky ani celý historický graf za 2009–2026. Při `reset`, ztrátě SSE událostí nebo delším odpojení načíst aktuální snapshot a revalidovat viditelné výstupy.

## Nezávislost archivního streamu na MQTT

Události `archive-updated` jsou produkovány z read-only pozorování MariaDB, **ne z LOOP/MQTT**. SSE multiplex na `/api/v1/live` musí zůstat dostupný při výpadku MQTT, pokud je archivní observer funkční; úvodní `status` může oznámit `state=unavailable` pro LOOP, ale nesmí tím zakázat oznámení z archivu. Odpověď SSE `503` je vhodná až při nedostupnosti samotné streamovací vrstvy, ne při pouhém výpadku LOOP.

Jestliže SSE spojení selže, frontend použije řízený **fallback na podmíněné GET s `If-None-Match`** (návrh: revalidace viditelných `current/history` přibližně každých 60 s, při skrytém tabu pozastavit nebo omezit; statistiky samostatně a méně často). Vše přes sdílenou backendovou cache, **ne SQL dotaz na každou otevřenou stránku**. Po opětovném připojení SSE přednostně provést `reset`/snapshot revalidaci a vypnout záložní polling, aby se data nestahovala dvakrát.

Pokud úplně zmizí všechny archivní řádky z právě sledovaného okna, reference observeru tuto situaci bezpečně odmítne; produkční implementace má ohlásit `status/reset` a znovu synchronizovat snapshot, nikoliv sestavit neplatnou událost s neexistujícím `latestArchiveAt`.

## Provozní testy před nasazením

- Pozdní zápis po hranici 5 minut i odlišné archivní intervaly; kontrola, že observer nespoléhá na wall-clock 5 minut.
- Bez duplicit při opakovaných skenech; jednorázový update grafu a následně update statistik po schváleném summary.
- Catch-up po výpadku, stránkovaný od cursoru; restart workeru; `Last-Event-ID` mimo buffer → `reset`.
- Backfill/přepis/smazání v překryvném okně a oprava starší než okno přes explicitní invalidaci, nikoli tiché nevšimnutí.
- CET/CEST, UTC hraniční dny, noční restart WeeWX, dlouhý výpadek, žádná SQL mutace.
- Výpadek DB, chybějící daily summary, pomalý MQTT, SSE backpressure; správně degradovaný stav bez falešně čerstvých dat.
- Výkon i DB náklad měřit pouze nad **izolovanou kopií**, ne zatěžovat produkční MariaDB.

Referenční, **offline** model: `contracts/archive_refresh.py`; testy `tests/test_archive_refresh.py`. Není to runtime služba, scheduler ani připojení na databázi.
