# Changelog

Průběžný záznam změn projektu Počasí Loučka. Data jsou uvedena v místním kalendáři; commit v `main` automaticky neznamená, že je už nasazen na testovacím webu.

## 2026-11-01

### Stabilita klimatologických grafů při nginx 5 r/s
- Prohlížečový screenshot potvrdil, že část ročních/měsíčních statistik chybí i při funkčním API a úspěšném smoke testu.
- Nginx pro staging omezuje API na 5 požadavků/s s burst 12; klimatologie dříve posílala až 58 statistik v rychlých dávkách.
- Klient respektuje HTTP 429 pomocí omezeného opakování a Retry-After. Klimatologie rezervuje nejvýše 1 požadavek za 300 ms.
- Neúplné grafy zobrazují počet dostupných měsíců místo falešně zeleného statusu. Smoke kontroluje všech 12 měsíců dokončeného roku 2025.
- Bez změn produkčních dat nebo nginx konfigurace.

### Dokončování devítipanelového vizuálu a interakcí (1. 11. večer)
- Mobilní spodní navigace po vzoru schváleného návrhu, včetně aktivní sekce a bezpečné spodní rezervy.
- Kamera: manuální a volitelné minutové obnovení reálného JPEG, načasování načtení oddělené od neověřeného času pořízení, zobrazení na celou obrazovku.
- Radar RainViewer: ovládací časová osa skutečných přijatých snímků, přepínač viditelnosti vrstvy a boční panel mapy podle návrhu.
- Senzory: 24hodinové minigrafy pouze z validních skutečných archivních intervalů; neexistující historie se nedoplňuje.
- Klimatologie: tři roční minigrafy z reálných statistik WeeWX (teplota, srážky, vítr) za šest posledních uzavřených let.
- Browser smoke: mobilní dock, mapová vrstva, ovládání kamery, minigrafy klimatologie a senzorové kontejnery.
- Nepřipojené části zůstávají explicitně označené: fyzický inventář GW3000/RSSI, archiv fotografií, časosběr kamery, další mapové vrstvy a oficiální lokální CAP ČHMÚ.

### Frontend integrace rozšířeného API
- Klimatologie: roční a měsíční statistiky WeeWX, grafy ECharts, roční filtr a původní denní extrémy s upozorněním na neuzavřenou QC.
- Historie: libovolný interval do dvou let, porovnání dvou veličin, časový zoom a CSV skutečně vrácených bodů.
- Úvodní a aktuální stránka: statistické denní extrémy a srážky, archivní SSE auto-refresh.
- Senzory: propojení s auditovaným fyzickým inventářem /sensors, archivní kanály bez domyšleného fyzického mapování.
- Kamera: ověřování stavu proti /camera/status, při disabled žádné falešné datum nebo LIVE.
- Testovací web: Playwright kontroluje aktuální veřejný release a validuje i roční statistický endpoint.
- Trvají nezávislé zdrojové blokery: archiv a timestamp kamery, RSSI/baterie, sníh/sluneční svit a oficiální ČHMÚ výstrahy.


- Set station, sensor-catalog, and camera-status update timestamps when the API process starts, keeping metadata ETags stable between requests.
- Marked computed period statistics as derived and included the WeeWX daily aggregation in provenance.
- Made API CI run when the authoritative metric catalog changes.
- Split irregular interval time weights across the UTC hours they overlap, clipped to the requested history range.
- Clip the first reported hourly bucket boundary to the requested start instant.
- Enabled yearly vector wind direction and direction-at-maximum-gust statistics to match the aggregation policy and response schema.
- Included returned-row fingerprints in current/history data revisions to invalidate ETags before SSE polling catches up.
- Rejected current-data responses when the observed archive revision changes during the database read.
- Configured Nginx preview throttling to return the API contract's JSON 429 response with Retry-After.
- Corrected the product-contract endpoint table to describe archive SSE fallback and unavailable LOOP/MQTT separately.
- Clarified that only snapshot/reset/archive-updated events are implemented in staging; LOOP observation/status remain future work.
- Aligned yearly statistic boundary metadata with WeeWX local-day keys using inclusive start and exclusive end.
- Aligned the daily-statistics fixture with derived provenance and nonzero valid-count semantics.
- Updated the API product contract to distinguish the implemented archive SSE fallback from the unavailable LOOP/MQTT feed.
- Added graceful Fastify, observer, and MariaDB shutdown on SIGINT/SIGTERM and startup-failure cleanup.
- Aligned daily wind summary SQL with the verified WeeWX schema: wind vectors come from `archive_day_wind`, direction sample counts from the dedicated direction tables, and gust direction joins the raw archive at the daily gust maximum timestamp.
- Confirmed the daily wind query and table columns with bounded SELECT-only metadata/data reads against the WeeWX database. Recent gust maxima did not match an archive row, so their direction correctly remains unavailable.

### Dokumentace

- Založen tento changelog a aktualizovány hlavní rozcestníky, stav frontendu a pravidlo průběžného vedení dokumentace.
- Opraveny zastaralé výroky o neexistujícím stagingu; rozlišena implementace v GitHubu, výsledek CI a ověření nasazení.

### Frontend a staging

### Vizuální redesign, reálné externí moduly a prohlížečový audit

- Úvodní dashboard: skutečná západní fotografie, kompaktní tmavý layout, předpověď Open-Meteo na 6 dní a radarová historie RainViewer s ovladači a uvedením zdrojů.
- Detail aktuálních údajů: graf nárazů větru, větrná růžice, doplňkové archivní kanály a informace o neověřeném fyzickém mapování.
- Historie: graf intervalových srážek, rozšířené veličiny ECharts; jednotky podle metrického katalogu a explicitní prázdná měření.
- Kamera: bohatší stránka s informacemi a výslovně chybějícím archivem; klimatologie stále čeká na skutečné validované agregace.
- Zavedeno automatické vizuální ověřování skutečného HTTPS dev webu v Chromium Playwright na desktopu 1440×900 a mobilu 390×844 včetně 16 screenshotů z osmi stránek.
- 1. 11. 2026 ověřena dostupná modelová předpověď a radar na desktopu i mobilu. Opravena nevhodná šířka předpovědi a formát hashovaných názvů radarových snímků RainViewer.
- Současný [stav a omezení](frontend/README.md).

### API v1 staging

- API v1 staging odmítá neexistující RFC3339 kalendářní data, ořezává archivní intervaly přes dolní hranici raw dotazu a odmítá překrývající se intervaly.
- API v1 implementuje denní, měsíční a roční statistiky z WeeWX souhrnů, včetně kontroly povolených dvojic veličina/agregace, místních hranic Europe/Prague, vážených průměrů, aditivních úhrnů, extrémů a vektorového směru větru.
- API v1 doplňuje agregovanou hodinovou a denní historii i `resolution=auto`, v mezích allowlistu metrik, časových hranic a limitů bez tichého zkrácení. Read-only archivní SSE observer používá dvouhodinový překryv, stránkované dohánění a opakování událostí; `summaryStatus` zůstává `unknown`, dokud není ověřena aktuálnost souhrnů. MQTT pozorování, katalog senzorů a kamera zůstávají vypnuté/neověřené.
- Následná revize sjednotila capability názvy se schématem, upravila `auto` tak, aby zkoušelo denní rozlišení po překročení hodinového limitu, a svázala směr maxima poryvu pouze s archivním řádkem, který odpovídá času i hodnotě denního maxima.
- Archivní observer už neoznačuje přirozené opuštění dvouhodinového okna jako smazání; neúplné denní souhrny selžou uzavřeně a databázové kontroly oprávnění/jednotek se po přechodné chybě znovu pokusí.
- Denní statistiky ověřují dvojice extrémní hodnota/čas a nevymýšlejí čas extrému z počátku dne; délka archivního intervalu je v historii omezena stejným limitem jako v aktuálním záznamu.
- Stránka kamery: přidán panel s informacemi, ruční obnova snímku a stav načtení či chyby; čas pořízení zůstává neznámý.

- `62e8917`: integrace informace o nasazené verzi do patičky a stránky projektu a publikování metadat deploy skriptem; nasazení a metadata je třeba ověřit na webu.
- `65691ea`: připraven parser metadat nasazeného releasu a komponenta s unit testy.
- `a6a1aef`: přepracována stránka O projektu, doplněny informační karty a responzivní rozložení.
- `b68c178`: do přehledu a stránky kamery přidána adresa západního snímku poskytnutá uživatelem; čas snímku, archiv a zpracování výpadku vyžadují ověření.
- `6148ce2`: zhuštěno rozložení úvodního dashboardu.
- `952f124`: klimatologie přepracována do panelů; data a volba období čekají na API.
- `74ee53f`: zesvětlen ilustrační krajinný banner.

### Otevřené

Vizuální a funkční shoda všech stránek s předlohou, mobilní kontrola, víceřadové a dlouhodobé grafy, denní statistiky v API, ověření DB oprávnění, dostupnost a aktualizace kamery, radar, výstrahy, předpověď, registr senzorů a ověření informace o nasazené verzi. Viz [stav frontendu](frontend/README.md).
