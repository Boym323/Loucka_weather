# Changelog

Průběžný záznam změn projektu Počasí Loučka. Data jsou uvedena v místním kalendáři; commit v `main` automaticky neznamená, že je už nasazen na testovacím webu.

## 2026-11-02

### Fastify API: audit RSS, historických rekordů, cache a SSE shutdownu
- Opraveny opakované alokace `Intl.DateTimeFormat` a zavedena omezená cache lokálních půlnocí Europe/Prague.
- Rekordy používají 20min cache, deduplikaci souběžných přepočtů, maximálně 60min stale odpověď v rámci stejného lokálního dne a po půlnoci nový výpočet.
- Volitelné bezpečné logování SQL/CPU časů a struktury Node.js paměti; bez publikování interní diagnostiky přes API.
- Při zavírání Fastify se již otevřená SSE spojení ukončují v `preClose` ještě před `server.close()`.
- Regresní testy cache, chybového stavu, půlnoci, letního času a uzavření SSE; historické rekordy zůstávají předběžné.
- Provozní srovnávací benchmark po nasazení je stále nutný; 570 MiB RSS samo o sobě neprokazuje memory leak.


### Evidence senzorů, úspornější historie a lehký test výkonu
- Nové `/api/v1/sensors/channels`: 11 explicitních archivních kanálů, výhradně počet neprázdných měření za 24 h a poslední timestamp; fyzická identita a propojení s GW3000 nejsou tvrzeny jako ověřené.
- Jeden indexovaný agregovaný SELECT pro všechny kanály, 60s paměťová cache a 30s privátní HTTP cache, podporované ETag/304 a regresní i MariaDB CI testy.
- Stránka senzorů nyní čitelně označuje neaktivní/neověřené archivní kanály; půda/ovzduší primárně načítá 7 dokončených lokálních dnů z denních WeeWX souhrnů místo opakovaně chybujících hodinových skenů.
- Read-only lokální skript pro lehkou sekvenční kontrolu odezev p50/p95 a ETag cache. Neprovádí zátěžový test ani restart, bez monitoringu v ChatGPT.
### Oprava sedmidenních grafů půdy a PM2,5
- Skutečné veřejné 7d hourly API vrací 503 (neplatný nebo nedostupný hodinový archiv); ověřený 24h raw endpoint PM2,5 vrací 200 a skutečných 288 měření.
- Graf nyní zkouší sedmidenní hodinový archiv, poté 7 dokončených dnů v původních WeeWX daily summaries a nakonec 24h syrové intervaly, vždy se zobrazením reálně použitého rozsahu.
- Pro půdní teplotu se používá generický veřejný history endpoint (nikoli úzký seznam hlavních metrik), tedy žádný vymyšlený senzor ani zápis do databáze.

### Diagnostika půdních a PM2,5 grafů
- Přísnější veřejný test odhalil, že tři sedmidenní hourly křivky půdy/ovzduší selhaly na desktopu i mobilu.
- Frontend nyní respektuje původní ochranu historického hourly API a při neúspěchu zkusí ověřený 24hodinový syrový archiv; explicitně uvádí, jaký rozsah a zdroj skutečně zobrazuje.
- Playwright nově loguje stav a stručný formát skutečné HTTP odpovědi pro 7d hodinovou a 24h raw variantu; nikdy neprovádí zápis.
- Nejsou doplňována chybějící měření ani měněna databáze.

### Provozní audit bez zásahů do meteorologické infrastruktury
- Read-only deploy/lxc/site-readiness-audit.sh ověřuje reálné běžící služby, veřejné i lokální API, stav MP4/FFmpeg, prostor a paměť, síťovou expozici a aktuální commit.
- Kontrola výslovně odděluje provozní health od Proxmox/PBS záloh, restore testů, NPM pravidel a skutečné zátěže, které nelze ověřit uvnitř LXC bez přístupu k hostiteli.
- Bez zápisu do MariaDB, změn Ecowitt GW3000, WeeWX či restartů služeb.

### Rekordy, kvalita historických dat a měření půdy/ovzduší
- Nová read-only API /api/v1/climate/records využívá maximálně tři původní denní souhrnné tabulky (teplota, srážky, nárazy); omezený časový rozsah, fyzikální meze, 20min cache, žádný zápis do DB. Výstup je vždy označený „předběžný z původního archivu“.
- Stránka /rekordy/ zobrazuje orientační minima/maxima, charakteristické teplotní dny, počty podložených kalendářních dnů a rekordy k dnešnímu datu. Chybějící dny ani skutečnou QC nenahrazuje odhadem.
- Roční klimatologie zobrazuje časový podíl platných teplotních měření z WeeWX day_outTemp.sumtime, když je tento podklad dostatečný a konzistentní; nejde o potvrzení správnosti srážek.
- Stránka /puda-ovzdusi/ zobrazuje živé čtení GW3000 půdní vlhkosti, PM2,5, UV a záření a oddělené sedmidenní archivní průběhy pro dostupné kanály WeeWX.
- Veřejný smoke test zahrnuje celkem 11 stránek a prověřuje status rekordů a živých čidel; syntetické testy API ověřují původ i meze historických rekordů.

### Opravy webu podle vizuálního a runtime auditu (2. 11.)
- Graf 24h srážek se načítá s odstupem od těžkého historického grafu, přechodné 429/503/504 API odpovědi podléhají omezenému opakování a uživatel má tlačítko Obnovit; prázdné nebo chybující grafy se neskrývají.
- Archiv kamery stahuje miniatury postupně místo 30 souběžných požadavků (limity NPM), zobrazuje načítání a nedostupnost; denní galerii načítá až na vyžádání a počet nejnovějších náhledů je 8.
- Popisky GW3000 nyní odlišují lokální read-only GET od HTTP uploadů, stav API již nepředstírá poslední meteorologické měření.
- Mobilní banner má samostatný řádek pro původ fotografie, větší čitelné popisky; galerie a diagnostika jsou přehlednější.
- Veřejný Playwright kontroluje dostupnost dekódovaného JPEG a reálné vykreslení srážkového grafu včetně jeho opakovaného načtení.

### Mobilní failover při dočasném omezení API (2. 11.)
- Veřejný test potvrdil skutečné GW3000 pakety do prohlížeče bez reloadu a desktopovou obnovu archivu. Mobilní failover při prvním průchodu neobnovil archiv do 16 sekund.
- Klient nyní při neúspěšném archivním GET automaticky provede maximálně tři další pokusy po 4/8/12 sekundách, bez znovunačtení stránky a s korektním označením nedostupného zdroje.
- Browser test akceptuje jak čerstvé archivní měření, tak pravdivě označený zastaralý archiv, a při neúspěchu vypíše diagnostiku skutečného DOM stavu.
- Testovací výpadky nadále běží výhradně v izolovaném Playwright prohlížeči.

### Živé přepínání prohlížeče a nezávislý provozní dohled (2. 11.)
- Prohlížeč zobrazuje explicitní zdroj živých hodnot GW3000 versus původní archiv WeeWX, bez zavádějícího archivního popisku pod živými kartami.
- Playwright ověřuje skutečný GW3000 stream v otevřené stránce bez reloadu a odděleně simuluje front-end výpadek a návrat na archiv pouze v testovacím browseru (desktop i mobil).
- Informační `readyz` hlásí skutečný stav kamery a vypnutý versus chybující live zdroj, ale nezávisí na nich připravenost DB.
- Pětiminutový LXC watchdog běží od 2. 11. 2026; původně založená hodinová úloha v ChatGPT byla na výslovné přání uživatele deaktivována. Monitoring zůstává lokálně na LXC.

## 2026-11-01

### GW3000 LAN API – skutečný paket a úplnější živá telemetrie (1. 11.)
- Regresní test přímo podle dodané odpovědi `GET /get_livedata_info?`: 6,5 °C, vlhkost 80 %, vítr 4,2 m/s, náraz 5,1 m/s, směr 62°, bez srážek.
- `wh25`: 10,3 °C, 57 % vlhkost, absolutní tlak 976,3 hPa a relativní 1027,6 hPa, pouze pokud chybí korektní odpovídající common_list měření.
- `ch_pm25` kanál 1: 3,0 µg/m³, `ch_soil` kanál 1: 48 %; obě veličiny jsou nyní dostupné v živém API a PM2,5 i na přehledu.
- Nevydáváme starý údaj o blesku, nejednoznačná další čidla ani surové bateriové kódy za platná živá měření; bez fyzického mapování zůstávají oddělené.
- GW3000 ani WeeWX se nijak nenastavují či nerestartují. Aktivace přímého čtení vyžaduje pouze připojení LXC k již funkční LAN IP.

### GW3000 bez změny konfigurace – read-only LAN HTTP
- Nový samostatný `loucka-gw3000-http-pull.py` používá výhradně oficiální `GET /get_livedata_info?` na přesně určené RFC1918 IPv4 GW3000, bez cloud API, bez zásahu do Customized a bez přepisování WeeWX.
- Dvacetisekundový opt-in systemd timer, omezená délka odpovědi a 4s timeout, bez přesměrování a bez systémové proxy; zapisuje pouze jeden atomický soubor `/var/lib/loucka-live/latest.json`.
- Rozpoznává a převádí teplotu, vlhkost, tlak, vítr, UV, W/m² a srážkovou intenzitu, ale neodhaduje chybějící jednotky ani neplete denní srážku s intervalovým úhrnem.
- Fastify přijímá také zdroj `ecowitt_gw3000_lan_http`, exportuje `timestampMeaning: gateway_polled_at`; frontend správně uvádí čas načtení, nikoli tvrzený čas fyzického měření.
- Časovač se nesmí spouštět současně s dřívějším Customized POST přijímačem. Přímé ověření vyžaduje skutečnou IP GW3000 a síťový přístup pouze na TCP/80, nikoli změnu nastavení brány.

### Skutečný LAN přenos Ecowitt GW3000 + monitoring
- Nový explicitně aktivovaný, neprivilegovaný Python přijímač Ecowitt HTTP POST, s požadovaným LAN IP whitelistem a tajným tokenem v cestě.
- Převod ověřených veličin z °F/mph/inHg/in/h na METRICWX, validace zdroje, času a fyzikálního rozsahu. Jediný atomický lokální JSON, bez zápisu do MariaDB.
- Fastify poller nových paketů, SSE události observation, read-only /api/v1/live/current. Po 120 s bez nových měření bezpečný archivní fallback.
- Nezávislé /api/v1/monitor/status sleduje čerstvost archivu, GW3000, kamery a CAP. Nová stránka /stav/ a volitelná pětiminutová systemd kontrola.
- Nutné skutečné zapojení GW3000 na LXC před označením zdroje jako live; neměnit již používaný Customized upload WeeWX.
- Regression CI s falešnými pakety pouze v testech, žádné syntetické hodnoty ve veřejné aplikaci.

### Oprava archivace kamery – 1. 11. 2026
- První JPEG se z veřejné kamery uložil, ale `save_index()` selhal: `datetime.strptime(f.name, ...)` dostal příponu `.jpg` a vyvolal `ValueError: unconverted data remains: .jpg`.
- Při čtení času používáme `f.stem`. Ověřené nové regresní testy zahrnují vytvoření indexu, deduplikaci JPEG a vytvoření denního MP4 pomocí mocku FFmpeg.
- Root-owned kopie `/usr/local/libexec/loucka-data-collector.py` se neaktualizuje při automatickém `git pull`: po merge je nutná jednorázová přeinstalace a nové spuštění sběrače na testovacím LXC.
- Ověřené CAP výstrahy pro ORP 7209 jsou na tomto incidentu nezávislé, není nutný restart služby ČHMÚ.

### Archiv kamery – denní prohlížeč
- Rozšířený bezpečný endpoint `/api/v1/camera/archive/day/YYYY-MM-DD` pro snímky vybraného UTC dne a omezenou 35denní retenci.
- Galerie kamery obsahuje datumový filtr a stránkování po 20 skutečných snímcích; nepřítomné datum se zobrazuje jako chybějící archiv, nikoli vygenerovaný obsah.

### Ověřené zdroje a lokální archiv, vývoj 1. 11.
- Read-only API: reálné surové RSSI/signal/battery kanály z produkčních sloupců, energie globálního záření z archivních intervalů, archiv JPEG+MP4 a lokální CAP.
- Samostatný, opt-in Python sběrač skutečných veřejných fotografií a oficiálních výstrah ČHMÚ pro ORP 7209, se systemd timerem, omezenou retencí a nezávislým lokálním úložištěm.
- Frontend: zobrazení dostupných diagnostických kanálů bez falešné interpretace jednotek, archivní galerie + časosběr, lokální výstrahy s fail-closed stavem, energie slunečního záření a mrazové dny.
- Mapy: vrstvy modelových bodů Open-Meteo teploty a větru jako dodatek k radarovým měřením RainViewer.
- Žádné zápisy do MariaDB a žádné syntetické historické fotografie nebo sněhová pokrývka.

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
