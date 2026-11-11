# Changelog

## 2026-11-11 – evidence gating před případnou rekonstrukcí RH 2022
- Offline soukromá měsíční rozhodovací matice na základě úplných RH triage, společných tripletů a blokovaného holdoutu (365 dnů); detekce nedostatečné místní validace, rozporu referencí a zhoršení po experimentální korekci.
- Kontroly konzistence počtů, nezápisových oprávnění, metodiky a verzí před vydáním privátního 0600 JSON/CSV. Žádný import ani přepočet chybějících RH, žádný SQL dotaz, nasazení nebo HTTP endpoint.
- Podklad pro další krok: ověření nezávislých historických záloh RH a provenience, nikoli automatické nahrazení původního měření.


## 2026-11-11 – nezávislé vyhodnocení referenčních RH korekcí bez zásahu do archivu
- Read-only 365denní experiment s přesnými trojicemi Loučka–LuhaMet–WU; validace SHA256 původních RH a tripletových denních souborů, při změně zdrojů fail-closed.
- Retrospektivní test na vynechaných dnech; tréninkové dny vždy ve stejném měsíci mimo ±3denní ochranné okno, alespoň 7 trénovacích dnů / 500 trojic, alespoň 24 trojic v testovacím dni.
- Soukromá 0600 měsíční tabulka výsledků MAE bez korekce a po experimentální mediánové korekci, bez generování či schvalování rekonstruované RH. Testy syntetických situací a izolovaného SELECT-only MariaDB běhu.


## 2026-11-11 – porovnání RH referencí ve stejných časových slotech
- SELECT-only dávkové (3 krátké dotazy/UTC den) zjištění skutečného tripletového překryvu Loučka–LuhaMet–WU ILOUKA4; MAE, bias, RMSE a počty bližších referenčních hodnot na identických vzorcích.
- Kontrola historické neměnnosti: každý původní denní RH JSON je ověřen a nové SQL zdroje se přes `buildRhDay` přepočítají; při nesouladu fail-closed.
- Samostatné privátní 0600 denní důkazy, 12 měsíčních agregátů a CSV, bezpečný bounded SQL grant-check, resume/lock, syntetické a izolované MariaDB testy.
- Bez doplňování RH, bez publikace, bez schválení rekonstrukce.


## 2026-11-11 – soukromé třídění RH QC 2022
- Samostatná offline kontrola všech 365 RH denních důkazů, roční a měsíční rozpad, přesné počty shodných/neshodných referenčních slotů a vážené průměrné absolutní odchylky po měsících.
- Denní pracovní kategorie rozlišují dobrou shodu referencí, jejich vzájemný rozpor, nedostupnost a krátké výpadky bez tvrzení, že jde o schválená rekonstruovaná data. Bez napojení na MariaDB a bez změn původních RH důkazů.
- Nové soukromé 0600 JSON/CSV pro ruční posouzení, syntetické a CLI testy v CI.


## 2026-11-11 – read-only QC relativní vlhkosti 2022

- Zavedena nezávislá denní analýza RH 2022 (365 × 288 pětiminutových slotů), přesně rozlišuje chybějící řádek, RH NULL, neplatnou RH a duplicitní čas. LuhaMet a WU ILOUKA4 se párují při UTC driftu ±30 sekund, pouze `quality_status=reference_only`, RH 1–100 %, dvojitá shoda nejvýše 10 p. b. je pouze podklad pro manuální kontrolu.
- Bounded SELECT-only MariaDB CLI s přísnou kontrolou grantů, dávkováním, resume po přerušení, ochranným lockem a 0600 denními soubory; žádné původní QC JSON ani databázové záznamy se nemění.
- Soukromý offline `qc-rh-2022-overview.html` a 2022 JSON souhrn s pravdivým indikátorem neúplných dnů, výběrem měsíce/dne, porovnáním bias/MAE a CSV exportem.
- Jednotkové testy a test skutečného SELECT-only běhu na izolované MariaDB.


## 2026-11-11 – úplné doplnění zkrácených QC návrhů
- Čtecí `--full-candidates` možnost QC a opt-in `qc:recover` pro 58 zkrácených týdnů: 2 519 dosud skrytých návrhů znovu vyhodnoceno beze změny starých reportů, kontrola původních prvních 100 položek, souhrnů, porovnání a SHA256.
- Nový privátní sidecar `qc-candidate-overflow.json` v 0700 adresáři, atomické vytvoření bez přepsání, žádné SQL write, původní QC formát a standardní limit 100 beze změn.
- Soukromý HTML přehled po ověření doplňku počítá přesné počty návrhů v UTC měsíci dle začátku události, exportuje kompletní `qc-candidates-complete.csv` (0600) a jasně ponechává odmítnuté řádky/reference jako přiřazené podle začátku QC týdne. Opravena vysvětlivka heatmapy odmítnutí.


## 2026-11-11 – soukromý přehled kvality meteorologického archivu
- Interaktivní HTML heatmapa roků/měsíců 2009–2026, filtrování metriky a roku, CSV, původní slotové pokrytí, teplota a vlhkost odděleně, QC příznaky a reference.
- Generátor vyžaduje dokončené soukromé QC reporty (932 oken), používá pouze vymezené SELECT na původní MariaDB a privátní výstup HTML 0600. Nevzniká nový veřejný web endpoint, nejsou měněna původní data ani rekonstrukce.
- Výslovně popsané limity: QC týdny připsané začátku týdne, 58 zkrácených týdnů se skrytými detaily kandidátů, `NULL` vlhkost není automaticky odmítnutý teplotní QC řádek.


## 2026-11-10 – zrychlené jednorázové dokončení historie QC
- Explicitní režim `qc-batch.mjs --catch-up` projde až 1000 zbývajících sedmidenních oken v jednom procesu s pauzou minimálně 1000 ms (standardně 2000 ms) mezi čtecími dávkami, sdíleným zámkem a opakovatelnými soukromými JSON reporty.
- Režim pravidelného systemd timeru bez `--catch-up` zůstává omezený na 1 (volitelně 4) okna na spuštění; zrychlení není automaticky aktivované ani nasazené.
- Integrace s izolovanou MariaDB kontroluje několik oken, přerušení limitu, pokračování, přeskočení hotových dat, práva 0600 a offline `--summary`. V databázi se stále pouze čte.


## 2026-11-10 – volitelný systemd timer pro historický QC screening
- Po úspěšných staging datech (2017-05-13–20: 0 původních řádků, 2 016 platných LuhaMet; 2026-10-10: Loučka 288, LuhaMet 287, ILOUKA4 288, všechny páry strong) připraveny jednotky pro postupné prověřování období 2009-01-01 až 2026-11-10 UTC.
- Timer se **neinstaluje ani neaktivuje sám**. Opt-in každých 15 minut zpracovává jen jeden sedmidenní úsek, používá pouze SELECT-only účet, privátní JSON reporty, omezené CPU/RAM a systemd sandbox.
- Nejsou žádné zápisy do původních meteodat, žádné automatické schválení, korekce ani přenos referenční stanice za Loučku. CI guardrail testy ověřují konfiguraci jednotek.


## 2026-11-10 – QC: podpora stávajícího čtecího databázového účtu
- QC nyní akceptuje SELECT na celé původní WeeWX schéma spolu se SELECT přesně na referenční tabulku.
- Nadále odmítá neznámé granty, práva zápisu, globální SELECT a SELECT na celé referenční schéma. Syntetický MariaDB CI test reprodukuje obě podporované varianty i odmítnutá rozšíření.
- Neprovádí žádné SQL zápisy ani nasazení na LXC; provoz vyžaduje lokální `qc.env` načtené pouze systémovou službou.


## 2026-11-10 – návrh: postupné QC prověřování celé historie bez SQL zápisů
- `qc-batch.mjs` rozděluje historii 2009–současnost na sedmidenní UTC okna a spouští existující výhradně čtecí QC; standardně jen jeden úsek, volitelně nejvýše čtyři v jednom běhu.
- Výstupní JSON reporty 0600 se ukládají v privátním adresáři 0700 mimo web a Git; validované hotové úseky lze bezpečně přeskočit, `--summary` vypočítá přehled bez DB přístupu.
- Přísnější kontrola DB účtu: SELECT jen na obě přesné tabulky, nikoli `SELECT ON *.*` nebo celé schéma. Testy izolovaného CI běhu a obnovy.
- Zatím žádný timer ani automaticky plánované zpracování a žádný zápis do meteodat, referencí, schvalovacího stavu či denních souhrnů.


## 2026-11-10 – návrh: pouze čtecí QC screening vlastních a referenčních měření (issue #80)
- Nový izolovaný nástroj `api/scripts/qc-engine.mjs` + jednorázový CLI `qc-report.mjs`, nikoliv veřejný endpoint ani automatický DB writer.
- Kontrola senzorových sentinelů (0 °C + 0 % RH), fyzikálního rozmezí, jednotek, dlouhých konstant, překrývajících se intervalů a časových offsetů; párování Loučka / LuhaMet / ILOUKA4 po pětiminutových slotech s deduplikací.
- Orientační spolehlivost vyjadřuje počet párů, bias, MAE, RMSE, p95, vyřazené vzorky a pokrytí; kandidáti pouze `needs_manual_review`, žádné navrhované automatické hodnoty Loučky.
- Omezit každý běh na max. 7 UTC dní, 2800 řádků na zdroj, povinný samostatný SELECT-only účet kontrolovaný přes `SHOW GRANTS`; CI využívá izolovanou syntetickou MariaDB.
- Neprovádí zápisy do produkční MariaDB, `loucka_reconstruction`, WeeWX ani GW3000. Před případným plánovaným provozem samostatně ověřit oprávnění a výstup na stagingu.


## 2026-11-10 – oprava: staging timer po pozdní aktivaci skutečně plánuje další běh
- `OnBootSec=45s` nahrazeno `OnActiveSec=45s`, aby se první kontrola naplánovala i po ručním opětovném zapnutí timeru dlouho po startu LXC; další běhy zůstávají relativní k dokončení synchronizace přes `OnUnitInactiveSec=2min`.
- `AccuracySec=10s` upřesňuje plánování; odstraněno zavádějící `Persistent=true`, které u monotónních timerů nemá požadovaný účinek.
- Doplněn regresní test a kontrolní postup reinstalace root-owned timer unit bez restartu LXC.


## 2026-11-10 – příprava bezpečného staging release gate (#58 a #69)
- Sestavení Astro ukládá pouze kandidáta `.pending-commit`; root-owned aktivační helper po ověření API readiness publikuje frontend atomicky jako neprivilegovaný uživatel. Při selhání API zůstává poslední zveřejněný frontend, nikoliv však garantovaný automatický rollback backendu.
- Nginx může přijmout X-Forwarded-For pouze od explicitně trusted NPM IP z lokálního configu; do instalace přesné trusted IP zůstává původní společný limit 5r/s. Neotvírat port 8080 přímo do internetu.
- Instalace je dvoukroková: nejprve aktualizovat root-owned helper, teprve potom schválit nasazení. CI kontroluje základní kontrakt pořadí publikace a Bash/Nginx syntaxi.
- Změna pouze na stagingu, žádné SQL zápisy nebo zásah do GW3000 či produkčního WeeWX. Ověření reálného nasazení zbývá.
- Před sloučením povinná kontrola skutečného root-owned helperu na LXC; instalovat **před** automatickou synchronizací nové revize, timer musí být zastaven.
- Při skutečné atomické publikaci se opravuje čas `deployment.json.deployedAt` (nikoli čas sestavení kandidáta).
- Samostatné izolované testy selhání readiness a úspěšného přepnutí release; všechna testovací data zůstávají mimo skutečný systém.
- PR zůstává draft až do root/NPM přejímky na stagingu, GitHub CI není důkaz LXC konfigurace.


## 2026-11-10 – dokončení: elegantní větrná růžice 2.0
- Nahrazení centrálního kříže a dlouhé jehly jemným SVG kompasem; ukazatel na obvodu se orientuje na směr, **odkud** vítr vane, a stupně + 16směrná zkratka zůstávají uprostřed.
- Rychlost a nárazy jako přehledné metriky se samostatným označením zdroje, kompatibilní s archivním i živým GW3000 vykreslováním a návratem po expiraci; neplatný směr neukazuje falešnou šipku.
- Čistě frontendové změny, izolovaný světle/tmavý CSS override a respektování reduced-motion. Testy normalizace, směrových sektorů, nejkratší rotace přes sever a Playwright pro obě stránky a oba motivy.
- Žádné změny veřejného API, databáze, WeeWX, GW3000 ani odloženého serverového issue #69 / PR #58.

## 2026-11-07 – Klimatologický atlas, etapa II (žebříčky, archivní dny, grafická ročenka)
- Srovnání čtyř ročních období rozšířené o žebříček dokončených sezón ze společného endpointu teplot všech let, časově vážené hodnoty, minima 90 % denního i skutečného časového pokrytí a samostatně uvedené neúplné roky.
- U každého ze čtyř předběžných extrémů je možné vybrat záznam a zobrazit skutečný intervalový denní průběh bez umělého vyplňování mezer, s respektováním Europe/Prague a původu měření.
- Tisknutelná ročenka má dva SVG grafy měsíčních teplot a srážek ze stejného původního archivu; neúplný měsíc se nezaměňuje za nulu a PDF vzniká přes tiskový dialog.
- Přidány čisté jednotkové testy i prohlížečové testy světla/tmy a mobilu/desktopu, přístupnost a screenshoty každé nové kapitoly.
- Čistě frontendové rozšíření, bez zápisů do WeeWX, MariaDB, GW3000 a bez zásahu do odloženého #69 / PR #58 či samostatného PR #73.


## 2026-11-07 – návrh: Klimatologický atlas Loučky, první funkční etapa
- Editorial hlavní rozcestník 4 tematických kapitol s ponecháním původních grafů, heatmap a anchor URL.
- Nové stránky Extrémy, Trendy, Srovnání sezón a Meteorologická ročenka s živými read-only endpointy bez vymyšlených dat.
- Výpočty pokrytí, časově i kalendářně správná zima, chybějící/neplatné záznamy ≠ nula, popisný Theil–Sen jen z dostatečně pokrytých dokončených let.
- Tisknutelná A4 ročenka přes prohlížeč, originální roční a denní podklady, automatické věty pouze při dostatečném pokrytí.
- CI: browser fixture test nových obrazovek, 15 tras pro staging smoke a oba motivy v axe-core na 60 kombinacích.
- Bez zásahů do original WeeWX, GW3000, MariaDB a odloženého issue #69 / draft PR #58.


## 2026-11-07 – návrh: automatické barvy podle slunce
- Tři režimy vzhledu: Automaticky (výchozí podle astronomického východu/západu v Loučce), trvale světlý, trvale tmavý. Původní volby z localStorage zachovány.
- Jedna sdílená funkce pro pražské civilní datum v astronomickém modulu; přepínání i na otevřené kartě, při návratu do popředí a po obnově stránky.
- Regresní testy letního/zimního dne, hranice slunce, CET/CEST, ručního přepínání i výchozího režimu. Vizuální smoke je pro srovnatelnost nastaven na světlý.
- Žádné HTTP/SQL požadavky pro motiv, žádný zásah do produkčního WeeWX, GW3000 nebo LXC.


## 2026-11-07 – návrh: WCAG audit ve tmavém motivu
- Rozšíření testu 11 tras ze 22 na 44 kombinací (desktop/mobil × světlý/tmavý motiv), včetně stavu otevřeného menu klimatologie.
- Explicitně se ověřuje přepnutí motivu před spuštěním axe-core; těmto testům nestačí vložit tmavou třídu až po renderu.
- Test je lokální, read-only a nijak nemění živé meteorologické měření či nasazení.


## 2026-11-07 – návrh: odstranění potvrzených bariér přístupnosti
- První axe-core CI běh ověřil 22 kombinací stránky a viewportu a nalezl 39 závažných výskytů porušení pravidel, převážně kontrast a nesoulad mezi viditelným a přístupným názvem sdílené navigace.
- Opraveny přístupné názvy značky, mobilních rozbalovacích menu a odkazu na kameru. Horizontálně posuvné oblasti klimatologické tabulky a mapových záložek jsou dosažitelné klávesnicí.
- Samostatná poslední vrstva `accessibility.css` cíleně opravuje slabý kontrast popisků z meteorologických panelů, radaru, ovládání historie a map. Konkrétní výsledky potvrdí následné axe-core CI, nikoli jen statická kontrola barev.
- Žádná změna meteo dat, API, GW3000 ani nasazovacích helperů.


## 2026-11-07 – návrh: automatizovaný WCAG audit všech stránek
- CI přidává axe-core 4.14.0 k Playwright a kontroluje 11 veřejných tras na 390/1440 px, včetně otevřené mobilní navigace klimatologie.
- Výstup do `wcag-browser-audit` rozlišuje závažná blokující porušení a ostatní zjištění; automatizovaný audit není úplné ověření WCAG ani Safari/VoiceOver.
- Kontrola je na izolovaném lokálním Astro preview, nemění meteorologická měření, SQL data, API ani GW3000.


## 2026-11-07 – návrh: přesná dokumentace a kontrola závislostí
- `AGENTS.md`, `README.md` a vstupní `docs/PROJECT_CONTEXT.md` rozlišují staging a produkční veřejný web; historické PR #2 a #4 jsou již sloučené, issue #36 uzavřené a issue #55 stále otevřené.
- Přidaný týdenní GitHub Actions audit produkčních npm závislostí (API a frontend), spouštěný rovněž při změně lockfile; hlásí `high` a `critical` nálezy, automaticky neopravuje balíčky.
- Přidán Dependabot pro obě npm části a GitHub Actions, pouze vytváří návrhy PR; neprovádí automatické sloučení ani deploy.
- Žádné změny meteorologických měření, databází, API runtime nebo GW3000.

## 2026-11-07 – návrh: lepší mobilní orientace v klimatologii
- Na mobilu místo dlouhé vodorovně posouvané lišty přidán kompaktní rozbalovací seznam všech deseti sekcí. Výběr kotvy menu automaticky zavře, hlavní meteorologická data i původní URL zůstávají stejné.
- Na desktopu zůstává původní horizontální navigace. Pro mobil doplněny větší klikací plochy a odsazení cílových sekcí od lepivé hlavičky.
- Mobilní dock sjednocuje název sekce na „Klima“; izolovaný Chromium regresní test kontroluje otevření, deset odkazů a zavření menu.
- Žádná změna dat, API, WeeWX, historické QC ani GW3000. Čeká se na CI ověření.

## 2026-11-07 – návrh: důsledná vizuální kontrola klimatologie
- Veřejný Playwright smoke nově odscrolluje ke grafu teplot všech roků i ke dvěma heatmapám a vyžaduje dokončené načtení originálních API dat, vykreslený SVG graf a skutečně naplněné dny; samotné HTML kontejnery již nestačí.
- Celostránkové screenshoty vznikají až po těchto kontrolách. Selhání se hlásí s diagnostikou stavů, nikoliv jako falešně úspěšný vizuální test.
- Změna nemění API, WeeWX, původní MariaDB, GW3000 ani záznamy měření. Úspěšný živý CI běh je nutné teprve potvrdit.

Průběžný záznam změn projektu Počasí Loučka. Data jsou uvedena v místním kalendáři; commit v `main` automaticky neznamená, že je už nasazen na testovacím webu.

## 2026-11-05

### Dokončené nasazení a smoke audit #36; dlouhodobý follow-up #55
- PR #54 sloučen do `main` jako `49ec8eea`; na staging LXC potvrzen `active-commit`, API health i readiness před restartem i po něm.
- Všechny tři `archive_day_*` SELECT plány používají primární index `dateTime` (`type=range`, bez filesortu); není potřeba další index.
- Systemd restart se bez chyby vrátil za 80 ms, journal `Deactivated successfully`, bez SIGKILL v pozorovaném výpisu; skutečně otevřený SSE stream v okamžiku stopu nebyl nezávisle potvrzen.
- Read-only lokální sonda po restartu 5. 11. 2026, 15:31 UTC: 32/32 GET bez chyby, obě 304; klimatické rekordy první 2010,60 ms a další medián 3,20 ms; RSS krátce po startu 65,11 → 87,44 MiB. Bez potvrzení cold stavu ani důkazu memory leaku.
- Zbývající dlouhodobé profilování a úplný SSE/DB stop scénář samostatně v [Issue #55](https://github.com/Boym323/Loucka_weather/issues/55); podrobnosti `docs/API_PERFORMANCE_AUDIT_2026-11-05.md`.


### Issue #36 – bezpečné profilování a shutdown API (historický stav při otevření PR)
- Archivní observer při ukončování explicitně dokončuje již rozběhnutý read-only SELECT dříve, než se zavře MariaDB pool. Není to důkaz vyřešení historických SIGKILL při systemd stopu.
- Regresní testy pro souběžné volání klimatických rekordů, ETag/304, 60minutový stale limit, drain SQL a SSE při selhání závěrečného hooku.
- Lokální read-only profilovací skript nově zaznamenává první a další GET zvlášť, 304 u rekordů a procesní RSS / RssAnon / RssFile; první GET **není automaticky cold**.
- Metodika a nezměřené části auditu jsou zdokumentovány v docs/API_PERFORMANCE_AUDIT_2026-11-05.md. Aktuální cold/warm latence, SQL EXPLAIN, trend paměti a reálný shutdown se teprve musejí ověřit na staging LXC. Žádné změny DB ani GW3000.

### První provozní měření po PR #35, dosud před nasazením PR #54
- Read-only testovací LXC 5. 11. 2026, 14:02:22 UTC: evidované API SHA `dd816c5`, 32/32 HTTP GET úspěšných, rekordy p50 1,48 ms / p95=max 4,21 ms (8 vzorků se zahřátou cache).
- Proces RSS 104,12 → 104,13 MiB v jedné krátké sondě, RssAnon 67,87 → 67,88 MiB; obě ETag validace vracejí HTTP 304, systemd NRestarts=0.
- Jde o nový provozní baseline, nikoli prokazatelné zrychlení cold startu ani dlouhodobé memory-leak měření. SQL EXPLAIN, dlouhodobý trend a graceful shutdown stále čekají na ověření. Detaily v `docs/API_PERFORMANCE_AUDIT_2026-11-05.md`.

## 2026-11-03

### Teplota 2009–dnes v jednom čárovém grafu
- Na Klimatologii přidán samostatný celoroční graf všech roků, s výchozím zobrazením všech linek, zvýrazněním aktuálního roku a jednotlivým výběrem let.
- Přepínání denních/měsíčních průměrů, orientační průměr dokončených roků a volitelné stínované min/max rozmezí. Chybějící dny se nepropojují.
- Nový read-only endpoint /api/v1/climate/temperature-years: jediný bounded SQL scan původních denních souhrnů WeeWX, okamžitě konvertovaný na °C, metadata časového pokrytí, DST, in-memory cache a ETag.
- Testy kalendáře, 29. února, 23/25hodinových dní CET/CEST, chybějících měření, měsíčního váženého průměru, API a skutečného Chromia.
- Veřejný staging smoke ověřuje nejen přítomnost grafu, ale i dostupnost nového backend endpointu. Zdroj stále original_unverified; žádná změna databází.


### Roční konsolidace 2009–2026
- API annual-matrix vrací všechny roky z původních WeeWX denních souhrnů s časově váženými průměry, správnými součty, explicitními mezerami a statusem original_unverified.
- Rozšířeno porovnání heatmap na 35 měřených veličin, přidaná roční tabulka a dostupnost měření.
- Read-only inventura šesti historických databází, referenčních stanic a pracovních oprav v docs/data/yearly_coverage_evidence_2026-11-03.json.


### Historické heatmapy a přímé srovnání dvou let
- Na stránku Klimatologie doplněny dvě kalendářní heatmapy se shodnou pevnou stupnicí, výběrem let 2009–aktuální a veličin (denní průměr teploty a vlhkosti, denní srážky, průměrný vítr, nárazy).
- Společný denní graf porovnává stejné kalendářní datum v obou letech; 29. únor je samostatný, chybějící a podezřelé hodnoty se nikdy nemění na nuly ani nepropojují.
- Souhrn používá pouze společně dostupné dny; u srážek jde o jejich součet, u ostatních veličin o nevážený průměr denních agregátů, nikoli celoroční časově vážený průměr.
- Načítání je odložené do příchodu sekce do obrazovky; dva roky = nejvýše dva denní API požadavky, bez nového databázového zatížení při běžném otevření stránky.
- Přidány vstupy pro výběr dvou let, mobilní vodorovný posuv heatmapy, klávesové ovládání, detail vybraného dne, tmavý motiv a odkazy z Grafů a Klimatologie.
- Rozšířený CI Chromium smoke používá izolované mockované denní API pro 390/1440 px, 29. únor, skutečnou nulu srážek, výběr dne, změnu veličiny a tmavý motiv. Veřejný dev smoke ověřuje přítomnost sekce na stránce Klimatologie.\n- Zdroj original WeeWX zůstává označen jako předběžný (bez finální historické QC), nenahrazuje rekonstrukci ani neschvaluje rekordy.


### Evergreen Observatory — dokončení čitelnosti a responzivity
- Nahrazeny problematické 9–11px popisky v úvodním panelu a čtyřech kartách čitelnými 12px zdrojovými údaji; sjednocena typografická hierarchie, včetně tmavého motivu.
- Opraveno přetékání globální mobilní hlavičky na šířce 320 px (zkrácená značka, kompaktní mezery a menu); kontrola přetečení nyní vypisuje problematické prvky.\n- Na úzkých telefonech (do 600 px) má hlavní naměřená teplota vlastní řádek a vedlejší měření jsou v přehledné trojici; kompaktní layout 320 px nepřekrývá hodnoty ani jednotky.
- V původním CSS odstraněna duplicitní pozdní vrstva přepisů fontů, zachovány potřebné výjimky kvůli starším Atlas stylům. Doplněna podpora snížené průhlednosti, vynucených systémových barev a volby omezení pohybu.
- Doplněn kontrastní tmavý vzhled stavového štítku grafu a štítků astronomie/historie; prohlížečový audit hlídá poměr kontrastu textu alespoň 4,5:1.\n- PR nyní spouští skutečný Chromium test na 320, 390, 600, 768, 1024 a 1440 px: přetečení, zdrojové popisky, zátěžová syntetická délka čísel a dark mode. Screenshoty jsou artefaktem CI; veřejná vizuální kontrola nasazení zůstává samostatná.
- Žádné změny API, DB, meteorologických hodnot, QC nebo původu GW3000/WeeWX.


### Oprava veřejného testu po zkrácení zdrojových popisků
- Prohlížečová kontrola živých měření stále vyžadovala doslovné staré věty. Test nyní ověřuje stabilní význam: živý zdroj GW3000 + archiv WeeWX, a po expiraci žádný živý původ.
- Zkontrolováno z veřejného logu: skutečné live údaje se vykreslují, syntetická data zůstávají pouze v izolovaném prohlížeči a archivní fallback vrací naměřené hodnoty.
- Žádná změna API, produkčních hodnot ani časové logiky.

### Jemné dokončení Evergreen Observatory
- Dotažena čitelnost drobných zdrojových a časových popisků v hlavním panelu, anemometru, 24h grafu a denním souhrnu; hodnoty mají stabilní tabulkové číslice.
- Sjednoceny rozměry a nadpisy čtyř úvodních karet, jemné stíny a vizuální rytmus. Kamera má decentní zvětšení při hoveru/fokusu; animace respektuje `prefers-reduced-motion`.
- Zvýrazněny a sjednoceny přístupné klávesnicové focus styly pro odkazy, tlačítka a rozbalovací prvky; tmavý motiv má vlastní zvýraznění.
- Zkrácen nadbytečný text u živých/archivních měření, kompasu a grafu, ale zachován přesný zdroj GW3000/WeeWX, datum, čas, význam neověřených dat a prázdných intervalů.
- Vizuální změny jsou omezeny na `observatory-evergreen.css` a malé úpravy textů existujících komponent. API, databáze, QC, archivní statistiky a ostatní URL beze změny.

## 2026-11-03

### Evergreen Observatory — implementace schváleného nadčasového vzhledu
- Úvodní fotografická krajina pochází z aktuální URL **skutečné západní webkamery**. Jde o obrazový kontext, nikoliv podklad potvrzující počasí; čas pořízení není ověřen a zůstává označen.
- Původní tmavý přístrojový hero panel nahrazen světlým poloprůhledným meteorologickým celkem s měřenou teplotou, vlhkostí, tlakem, rosným bodem, denním souhrnem, větrnou růžicí a skutečným grafem z archivu. Tmavý motiv má samostatně čitelný kontrast.
- Anemometr v horním panelu nově spojuje **směr, rychlost a nárazy**, přičemž každý údaj používá pouze platné hodnoty z archivu WeeWX nebo autentického živého eventu GW3000; jejich původ se zobrazuje samostatně.
- Přímo v hero panelu se vykresluje 24h graf skutečných měření (WeeWX), bez interpolace nedostupných údajů. Ovládání odborných grafů zůstává na stránce Grafy.
- Čtyři významově odlišné karty pod hlavním panelem: kamera, astronomický výpočet Slunce/Měsíc, stejný den před rokem s informací o úplnosti, a ověřená základní fakta o stanici.
- Doplňkové modelové předpovědi, radar, sekundární veličiny a navigace zůstávají dále na úvodu, ale bez duplicity anemometru či 24h grafu.
- Neověřenou nadmořskou výšku a fiktivní vybavení z grafického návrhu do webu **nepřenášíme**.
- Nová prezentace je izolována v `frontend/src/styles/observatory-evergreen.css`; specializované stránky, API, MariaDB, rekonstrukce a přístup k datům zůstávají beze změny.
- Upraveny regresní testy a veřejná QA pro jednotný přístrojový panel, reálný původ panoramatu, rozložení čtyř karet a mobilní variantu.

## 2026-11-03

### Historické srovnání s neúplnými daty
- Při veřejném ověření původní archiv z předchozího roku nesplnil 80% pokrytí. Ověřené naměřené min/max již nepřijdou bez vysvětlení vniveč: pokud oba agregáty obsahují platná archivní měření, zobrazí se jako **nejnižší a nejvyšší zachycená hodnota**.
- Při neúplném nebo neověřitelném pokrytí se vždy viditelně zobrazí upozornění, že se nejedná o potvrzené celodenní extrémy. Při nulovém počtu platných měření zůstanou hodnoty skryté.
- Význam původních rekordů ani QC pravidel se nemění; žádný zásah do MariaDB či Fastify.

### QA opravy observatoře
- U mobilního panelu byly na skutečném screenshotu jednotky tlaku a rychlosti větru příliš natěsnané; při šířkách do 760 px se proto zobrazují pod hodnotou.
- Původní smoke test odmítal jakýkoliv CSS gradient za měřením. Nový test správně rozlišuje barevné plochy (povolené) od nepravdivého meteorologického podkladu či falešné fotografie (zakázané).
- Screenshotový test nyní před zachycením hlavní stránky vyčká na pokus o načtení historického srovnání, takže fotografie rozhraní zachycuje i datový stav po aktualizaci.

### Meteorologická observatoř — identita původního Počasí Loučka
- Úvod dostal výraznější petrolejový přístrojový panel s živou teplotou a dalšími skutečně měřenými veličinami; zachován zdroj GW3000/WeeWX, stavy kvality, denní minima/maxima a srážky.
- Nová tříčástá část observatoře: **větrná růžice** s mapováním 16 směrů a přepínáním platných živých/archivních údajů; **Slunce a Měsíc** s jasně označeným astronomickým výpočtem pro přibližnou polohu obce; **stejný den před rokem** z původního archivu, zobrazovaný jen při pokrytí alespoň 80 %.
- Sluneční časy se počítají lokálně v prohlížeči podle publikovaných přibližných rovnic NOAA, nikoliv podle meteorologického API. Astronomická fáze Měsíce je orientační. Nikdy se nevydávají za senzorová měření.
- Na stránce O stanici zveřejněna časová osa původního projektu od roku 2009, doložené změny techniky, odkaz na původní web a skutečný obraz západní webkamery místo generické ilustrace.
- Zůstaly zachovány všechny ostatní podstránky, grafy, kalendářní čas Europe/Prague, odborné funkce a kvalita dat; produkční databáze i Fastify API beze změny.
- Testy výpočtu Slunce a Měsíce, provenience historie, vizuální přítomnosti přístrojů a responzivního rozložení desktop/mobil v `frontend/tests/observatory-heritage.test.mjs` a public smoke.


### Oprava regresí po prvním veřejném vizuálním testu
- Public smoke odhalil, že mobilní analytické panely přebraly pozdní širokoúhlé CSS pravidlo a vytvořily tři nepoužitelné úzké sloupce; přidána explicitní adaptivní mřížka 1 sloupec na mobilu, 2 na tabletu, 3 na desktopu.
- Opravena zastaralá testovací aserce, která očekávala původní třísloupcový seznam Senzorů; nový katalog má úmyslně 2 sloupce na desktopu a 1 na mobilu.
- Playwright před celostránkovým screenshotem vrací scroll k začátku, aby zachytil sticky hlavičku věrně a nezobrazoval ji uprostřed screenshotu.

### Atlas Minimal — cílené dokončení UX podle screenshotů produkčního náhledu
- Úvodní živé měření: nové dvouřádkové uspořádání veličin kolem dominantní teploty, odstranění nevyužité bílé plochy a mírnější vertikální rytmus; na mobilu zkráceno duplicitní vysvětlení zdroje, ale zachován čas a stav měření.
- Grafy: přebarvení a odlehčení os, legend, mřížky a časových popisků v `AdvancedHistory`, `HistoryChart`, `RainDetail` a `ClimateDashboard`; mobil zobrazuje méně čitelných časových značek, namísto jejich překrývání.
- Senzory: `SensorChannels` má vyhledávání, filtrování platných/nedostupných hodnot, osm přístupných rozbalovacích kanálů a 24h sparkline načítá pouze při otevření kanálu. Nulové hodnoty se nepletou s neznámými.
- Odborná evidence kanálů, fyzický inventář a diagnostika byly zachovány, ale skryty za přístupnými rozbalovacími sekcemi, aby se běžný návštěvník nemusel procházet tisíci pixelů technických karet.
- Opraveny vizuální smoke aserce na nové uspořádání Senzorů a doplněno ověření vyhledávání, rozevírání a počtu kanálů.
- Beze změny API, SQL, produkční databáze, pravidel QC, původu dat a stávajících URL. Výsledky potvrzuje až CI a veřejný screenshotový test; samostatný audit přístupnosti zůstává požadavkem.

## 2026-11-02

### Unslop revize Atlas Minimal — přehlednost a specifická identita meteostanice
- Proveden návrhový audit podle projektu `heydamir/unslop` (Damir Sokolovsky, CC BY 4.0); evidence a doporučení: `docs/design/UNSLOP_ATLAS.md`.
- Zredukovány barevné plochy, stíny, pilulkové aktivní odkazy, nejednotné mezery a zbytečně tučné nadpisy. Zůstal jeden věcný akcent a světlý výchozí režim.
- Z úvodní části odstraněna dekorativní krajina a její gradient: prostor patří naměřeným hodnotám a času. Nepoužívaná ilustrace smazána.
- Komponenta `SiteIcon.astro` nahrazuje dekorativní textové symboly v navigaci, informacích, radaru a výstrahách.
- Modelová předpověď používá sedm sjednocených vektorových meteorologických piktogramů namísto emoji, přístupný popis podmínek a původní bezpečné chybové stavy.
- Zachována skutečná kamera, radar, časová řada WeeWX, živé GW3000, zdroj Open-Meteo, kvalita měření i všechny odborné podstránky.
- Přidány jednotkové regresní testy a vizuální Playwright aserce pro nové UI; bez změny API, MariaDB a rekonstrukce dat.


### Schválený redesign Atlas Minimal — první implementace na skutečných datech
- Světlý režim je novým výchozím motivem; tmavý režim zůstává volitelný a ukládá se jen do místního prohlížeče.
- Přehled není kopií starého devítipanelového dashboardu: velká aktuální teplota, zvlášť denní archivní extrémy, úzká výstražná lišta, graf skutečných archivních hodnot, oddělená modelová předpověď, kamera, radar a šest cílů pro další průzkum.
- Přidána samostatně označená *ilustrační* krajina; nikdy se nevydává za živou kameru. Živá kamera má vlastní náhled s výslovně neověřeným časem pořízení.
- Nové sdílené rozložení, design tokeny, responzivita a přehlednější horní navigace v `atlas-minimal.css`; stávající specializované stránky využívají stejnou světlou paletu.
- ECharts automaticky přizpůsobuje osy a řady světlému/tmavému režimu, bez vyplňování děr v měřeních.
- Veřejné screenshotové testy upravené na nový schválený layout.
- Bez zásahu do MariaDB, rekonstrukce, QC, WeeWX, GW3000, API nebo backendového cachování.

## 2026-11-02

### Galerie kamery: oprava vizuálního regresního testu po nasazení
- Veřejný screenshotový smoke odhalil, že lazy-loaded miniatura skrytá během čekání se nemusela vůbec načíst; obrázky ve frontě nyní používají `loading=eager` s původní rychlostní limitací.
- Test rozlišuje tři stavy: dekódovaný snímek, bezpečný klikací fallback při nedostupnosti JPEG a chybný neukončený spinner/rozbitý obrázek.
- Nedostupnost JPEG zdroje se neoznačuje za úspěšné načtení: výsledek CI vypíše upozornění a zachová veřejný odkaz na původní fotografii.


### Celoplošné vizuální doladění 11 stránek – desktop, tablet a mobil
- Nový `frontend/src/styles/refinement.css` načítaný až po globálních stylech: jednotné nadpisy, karty, čitelné stavy, formuláře, tabulky a světlý motiv bez kopírování celé původní palety.
- Na úvodní stránce se spodní karty přizpůsobují: historie má větší graf, kamera využívá dostupnou výšku a radar místo prázdného spodku zobrazuje větší mapu.
- Grafy/klimatologie/rekordy: jednotná typografie, ovládací prvky, čitelnější legendy a mobilní grafy; nesprávné doslovné Markdown `**orientační**` opraveno na sémantické zvýraznění.
- Klimatologie: navigace používá správně název *Sluneční energie* (nikoliv neexistující měření délky slunečního svitu).
- Senzory/půda/ovzduší: vyvážené karty a čitelnější diagnostické řádky; žádný archivní kanál není vydáván za ověřenou fyzickou identitu.
- Kamera: při neúspěšných JPEG náhledech (např. 429) se namísto rozbitého obrázku ukáže dostupná, klikací náhradní karta; jediné omezené zopakování požadavku zachováno.
- Mapy, stav, o projektu: sjednocené informační panely; stránka stavu nabízí přístup k měření, senzorům a kameře.
- Screenshotový Playwright smoke nově ověřuje reálné rozměry hlavních panelů a responzivitu vedlejších sekcí; nedochází k zápisu do DB či změně původu dat.


### Vizuál: přehled a mobilní layout podle tmavého devítipanelového návrhu
- Kontrastnější jednotná sada design tokenů (pozadí, panely, text, linky a akcent) podle FRONTEND_SPEC; zachován samostatný světlý motiv.
- Vyváženější úvodní fotografie z původní kamery, jasnější primární teplotní karta, grafické karty historie, kamery a radaru se sjednoceným zaoblením a mezerami.
- Mobilní předpověď ze šesti úzkých karet přepracována na tři čitelné sloupce a dva řádky; na šířkách pod 360 px na dva sloupce.
- Na mobilu třísloupcový denní souhrn (od 360 px), kompaktnější rychlé odkazy a větší dotykové cíle.
- Spodní navigace používá pět jednotných vektorových ikon místo proměnlivých textových glyfů.
- Ve veřejném Playwright screenshot auditu přidány kontroly reálného layoutu 390px / 1440px, bez závislosti na živých hodnotách.
- Záměrně bez změny API, databází, historie senzorů a stavů dostupnosti dat; dostupnost snímku nadále neznamená ověřený čas pořízení.


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
