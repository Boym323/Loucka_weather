# Loučka Weather – kontext pro nový chat a AI agenty

**28. 11. 2026 – statistické a staniční HTTP moduly:** #197 sloučen `b0addaa`, 227/227 izolovaná MariaDB. #196 exact DEV `439d896` 46144700124 PASS, rain 284/283, live/failover PASS, slow4G 3/3 medián 2588 ms. `statistics-routes.ts`, `station-routes.ts` zachovávají kontrakty, cache, čas a pořadí registrace, přímé testy shody a izolace. CI/DEV nové revize ověřit samostatně; žádné změny dat/produkce.

**28. 11. 2026 – klimatologické HTTP moduly:** #196 sloučen `439d896`, 226/226 izolovaná MariaDB. #195 exact DEV `31f1377` 46143872572 PASS, rain 284/283, live/failover PASS, slow4G 3/3 medián 2584 ms. `climate-routes.ts` vyčleňuje čtyři klimatologické endpointy se stávajícími instančními cache, limity, kontrakty a SQL; test shody, ETag, coalescing a izolace instancí. CI/DEV nové revize ověřit samostatně; žádná změna dat nebo produkce.

**28. 11. 2026 – HTTP modularizace:** #195 sloučen `31f1377`, 224/224 izolovaná MariaDB. #194 exact DEV `92909da` 46142138481 PASS, rain 284 intervalů, live/failover PASS, slow4G 3/3 medián 2224 ms. `history-route.ts` odděluje HTTP historii a `http-contract.ts` společné schema/ETag/errors/policy; test složené a samostatné registrace, 304 a odmítnutí bez SQL. Bez změny kontraktu nebo dat. CI/DEV nové revize ověřit samostatně.

**28. 11. 2026 – denní statistiky:** #194 sloučen `92909da`, 219/219 izolované MariaDB. #192 exact DEV `1ae2199` 46136921592 PASS, rain 284 intervalů, live/failover PASS, slow4G 3/3 medián 2332 ms. Nový `daily-statistics.ts` izoluje původní agregace a daily points s explicitním typem a přímými testy; bez změny algoritmu, SQL, HTTP nebo dat. CI a DEV nové revize ověřit samostatně.

**28. 11. 2026 – refaktoring etapa 2:** #192 sloučen `1ae2199` po 215/215 izolované MariaDB testů. Předchozí exact DEV #191 `cfb6711` 46136211605 PASS: kalendář CLS 0,0004, stav 0, grafy 0,1435, senzory 0,1061; slow4G 3/3 medián 2572 ms. `calendar-time.ts` vyčleňuje stávající časové funkce a cache bez změny pravidel, testy CET/CEST a hraničních dat. CI/DEV nové revize ověřit samostatně; žádné SQL, DB ani produkční změny.

**28. 11. 2026 – refaktoring API:** `archive-history.ts` odděluje pure raw/hourly zpracování, validaci a překryvy od HTTP orchestrace v `app.ts`; explicitní typ bodu, přímé unit testy s nezávislou referencí. Záměrně bez změny SQL, agregací, HTTP formátu, zdrojového archivu či produkce. CI a DEV aktuální revize ověřit samostatně.

**28. 11. 2026 – kandidát CLS #152:** exact DEV 8760c23 46133455708 PASS, mobilní lab CLS kalendář 0,1748, stav 0,1604, grafy 0,1435, senzory 0,1061. Lokální CSS rezervuje stavové a textové řádky kalendáře a monitoru; delayed-response browser fixture porovnává geometrii, veřejný smoke přidává omezené kategorie posunutých prvků bez dodatečných požadavků. Skutečný efekt a CI nové revize zatím neověřeny. Žádné zásahy do API, dat a produkce.

**28. 11. 2026 – potvrzené DEV a sloučená integrace:** #188 (`9b05527`) public smoke 46132945676 PASS na přesném deployment SHA: raw teplota/nárazy/srážky a hourly teplota HTTP 200, 284 platných srážkových intervalů desktop/mobil, 11 tras a live/failover PASS. #183 uzavřeno, příčina zdrojových překryvů zůstává v #80. #189 (`8760c23`) sloučen po API/MariaDB 46133026036, Chromium 46133026052, security 46133026015 PASS; #182/#174/#172/#186 sloučené. Následný public smoke 46133455708 PASS na přesném deployment SHA `8760c23`: 284 platných srážkových intervalů desktop/mobil, 11 tras a live/failover PASS. Post-merge API, frontend a security PASS; slow4G 3/3, FCP/LCP kandidát medián 2588 ms. Slow4G 3/3 na `9b05527`, FCP/LCP kandidát medián 2612 ms, #152 další optimalizace. #143 skutečný H.264 playback neověřen, #69 produkční readiness a #80/#107/#111 historická QC otevřené. Žádný zásah do DB, WeeWX a produkce.

**28. 11. 2026 – integrační kandidát:** Společná větev nad #188 integruje přesné source/test/lockfile bloby čtyř samostatných PR #182/#174/#172/#186 a zachovává jejich historii. Podmínka merge je společné zelené CI a veřejný smoke opravy #188. Bez změny původního archivu nebo produkce.

**28. 11. 2026 – kandidát opravy #180:** Panel výstrah při shodné odpovědi nemění interaktivní prvky; u změněných jednoznačných záznamů zachovává rozbalení a fokus. Rozšířen offline Chromium test na `/` a `/predpoved/` (390/1440 px, light/dark), včetně změny doporučení, extrémní výstrahy, odstranění a neověřeného stavu. Zdrojová data, API, DB a produkce beze změny. CI a skutečné DEV nasazení samostatně.
Doplněn scénář vypršení přímo v odpovědi, zotavení a ztráty ověřitelnosti při fokusu v podrobnostech; nová revize vyžaduje vlastní CI.

**28. 11. 2026 – QC kandidát #174:** `measurementValue` zachovává původní číslo po převodu jednotek, `displayValue` při SENSOR_ERROR zůstává null. Není schválený rekord ani oprava databáze; dosavadní Fastify a izolovaná MariaDB CI PASS, aktuální revize vyžaduje vlastní CI a veřejný DEV test.

**28. 11. 2026 – dependency kandidát #172:** Astro 7.4.13, předchozí CI i security audit PASS; `picomatch` 4.0.7/2.3.2 beze změny; [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) staženo 18. 11. 2026, audit 46132677882 PASS, #124 uzavřeno na základě stažení konkrétního advisory. Aktuální revizi a nasazení ověřovat samostatně; žádný zásah do produkce.

**28. 11. 2026 – kandidát #185:** Srážkový detail rozlišuje neznámý součet bez platných intervalů a skutečný nulový úhrn; offline Chromium test s chybějící a podezřelou hodnotou a následnou měřenou nulou. Nezávislé na #183; CI a DEV ověřit samostatně.

**28. 11. 2026 – kandidát opravy #183:** Public smoke 46132046210 na SHA e799fda definitivně potvrzuje `overlapping_intervals`. Raw maskuje celé propojené konfliktní skupiny vrácených intervalů s explicitním původem; hourly maskuje všechny dotčené hodiny i extrema/count. Kontrola jednotek, času, pořadí a konverze zůstává fail-closed. Bez dalších SQL čtení nebo zápisu, bez změn daily statistik. Není rekonstrukcí dat; CI a veřejný DEV ověřit samostatně.

**28. 11. 2026 – diagnostika #183:** Public smoke 46130015774 na SHA `3b22d66` potvrzuje API HTTP 503 `Unsupported archived observation` u raw teploty, nárazů a srážek; daily 200. Dřívější shodný výpadek 46048110455 vylučuje vznik závady až po #181. Kandidát klasifikuje důvody validace pevnými neosobními kategoriemi bez uvolnění QC a bez SQL změny; historicky doložené překryvy jsou hypotéza, nikoli potvrzená příčina aktuálního výpadku. CI/DEV ověřit samostatně.

**28. 11. 2026 – kandidát opravy #179:** Větrný panel má per-field ochranu čerstvých GW3000 hodnot, serializaci archivních odpovědí a odmítání starších live packetů. Po live-expired se připojuje k nové generaci společného archivního GET. Rozšířen offline Chromium test skutečné `/` (390/1440 px, light/dark) včetně opožděného úspěchu/chyby, částečného live, nuly a skrytého kompasu. CI a skutečné DEV nasazení této revize ověřit samostatně. Bez zásahu do DB a produkce.

**27. 11. 2026 – vizuální úprava portálové homepage:** Zkompaktněný pás výstrah, sjednocené rozestupy a čitelnější navigace na širokých obrazovkách. Pokud není ověřen směr větru, kompas se skryje a rychlost/nárazy zůstanou v úsporném přehledu se zdroji. Připravena větev `codex/portal-visual-polish-20261127`; Sjednoceno očekávání `formatMetricValue` a českého zápisu nulové osy srážek (`0,0`) v přístupnostních a Chromium kontrolách; finální CI ověřit po posledním commitu. DEV náhled ověřit samostatně.


**25. 11. 2026 – sjednocení:** Kandidát portálové homepage zahrnuje aktuální interaktivní mapy z main. Kontrast a dotyková plocha opraveny podle axe auditu. CI a DEV nasazení ověřit před označením za dokončené.

**25. 11. 2026 – kandidát přepnutí:** Nový portál na `/` a sdíleném aliasu `/prehled-novy/`, klasická verze na `/prehled-klasicky/`. Změna vyžaduje úspěšné CI před sloučením; po nasazení ověřit veřejný smoke a případný návrat na předchozí commit. Produkce a DB nedotčeny.

**25. 11. 2026 – interaktivní mapy:** Mapový výřez řídí zoom, posun a modelové vzorky. Open-Meteo teplota je bilineárně interpolovaná (nikoli nativní rastr), vítr šipkami, Loučka oddělené archivní měření. Radar RainViewer max zoom 7, nad ním pouze zvětšení. Nový model po změně výřezu načíst ručně, aby se omezily API požadavky. Okolní ČHMÚ stanice vyžadují ověřený collector; zatím odkaz na otevřená data. Ověřit CI a DEV.

**25. 11. 2026 – portálová etapa 2:** Trend teploty/tlaku z archivu, meteogram a denní indikace výstrah, klimatologické porovnání shodných dní s kontrolou pokrytí, `/historie-den/` a upravená navigace. Původní homepage je stále výchozí. Srážkové odchylky odloženy kvůli známým problémům originálu; bez zásahu do DB. Ověřit nové CI a deploy.

**25. 11. 2026 – portálová alternativa:** `/prehled-novy/` a `/predpoved/` jsou nové srovnávací trasy; původní `/` zůstává výchozí. Používají stávající API a model Open-Meteo, žádná změna DB. Další fáze: trendové indikátory, klimatologická srovnání na základě schválené metodiky, výstrahy u dnů, navigace po vizuálním schválení. CI a DEV nasazení ověřit.

**25. 11. 2026 – kompaktní záhlaví:** Homepage má nižší titulní pás s fotografií, ostatní trasy menší nadpisy a mezery, atlas zachovává vlastní identitu. Vizuální test kontroluje výšku a velikost nadpisů i kontrast ze skutečných CSS tokenů. Předchozí CI selhala na chybné metodě odečtu kontrastu; nový výsledek a DEV nasazení je nutné ověřit.

**25. 11. 2026 – mobilní a klimatologická revize:** Kompaktní homepage je výchozí na telefonu, `/?mobile=full` obnoví plné rozložení. Graf i vítr dostupné rozbalením, desktop zachován. Atlas: sjednocení grafů, tabulek, doplněné osy a rozlišení omezených dat; test kontrastu základních tokenů. CI a DEV nasazení nové revize ověřit.

**25. 11. 2026 – navazující screenshot revize:** Veřejné screenshoty commitu 9ab8378 ukázaly potřebu časnější mobilní výstrahy, jednotek u rekordů, sjednocení tlačítka kamery a skutečně odlišných barev sezón. Oprava nezasahuje do dat ani produkce; nové CI a nasazení ověřit.

**25. 11. 2026 – vizuální revize:** Předpověď a radar před kontextovými kartami, jednotky u hodnot, česká data rekordů, sjednocení mobilní navigace atlasu, grafů a map. Kompaktní homepage zůstává dostupnou volbou. Browser QA rozšířena na 15 tras × 7 šířek × 2 motivy; CI a DEV nasazení ověřovat odděleně.

**25. 11. 2026 – výstrahy ČHMÚ:** Filtrování výslovných záznamů bez výstrahy a ukončených jevů v API, české časy, závažnost a stav platnosti na homepage. Originální text je dostupný v podrobnostech. Změna nevyžaduje reinstalaci collectoru; standardní preview sync sestaví API i frontend. Skutečné nasazení je nutné ověřit odděleně.

**24. 11. 2026 – historický tlak:** Ověřený izolovaný soukromý náhled nad třemi vrstvami z Meteo_audit PR #99 běží na DEV LXC pouze na loopbacku portu 3102; viz [PRESSURE_HISTORY_PREVIEW.md](PRESSURE_HISTORY_PREVIEW.md). Diagnostické vrstvy nejsou schválené pro veřejná měření, statistiky nebo SQL přepis.

**20. 11. 2026 – homepage: jednotky a vodorovný posuvník:** Jednotky denních souhrnů i úzkých mobilních měření zůstávají vedle čísla; celoplošný obrázkový pás nepřidává vodorovné rolování. Změna se týká jen zobrazení.

**20. 11. 2026 – srozumitelnost návštěvnického webu:** Zkráceny opakované technické texty na stránkách aktuálního počasí, klimatologie, výstrah, radaru a senzorů. Interní názvy systémů a stavů byly nahrazeny běžnými popisky; metodika, původ a omezení historických dat zůstávají dostupné v rozbalovacích vysvětleních. Zachována upozornění na neúplná a předběžná měření. Bez změny výpočtů, API, DB, dat a nasazení.

**17. 11. 2026 – kamera / časosběr:** Oprava chybějící HTTP Range 206 pro `/api/v1/camera/timelapse/:file`, 416 pro neplatné rozsahy a kontrola 32 B přes public dev smoke, když v indexu existuje skutečné MP4. Frontend nabízí stažení a chybovou zprávu při selhání videa. Collector nyní publikuje index JPEG i po neúspěšném FFmpeg běhu. Reálnou příčinu na LXC (existence MP4/FFmpeg/codec/oprávnění) musí potvrdit provozní diagnostika; data ani databáze se nemění.


**17. 11. 2026 – home performance:** Finální public smoke pro commit `77908e2` PASS, issue #133 uzavřeno. Homepage měla v tomto vzorku DCL 2792/2946 ms a FCP 1580/1720 ms desktop/mobil. PR na odložený ECharts HistoryChart po DOMContentLoaded, s prohlížečovým důkazem skutečně vykresleného SVG. Zatím bez potvrzeného nového browser benchmarku; porovnat teprve po nasazení. SQL archiv netknut.


**17. 11. 2026 – výkonový test:** DEV endpoint /api/v1/climate/records má 8/8 HTTP 503, ostatní měřené endpointy 8/8 PASS, RSS ~69 MiB v krátkém okně. Připravena staging-only SELECT diagnostika climate-records-diagnostic.mjs, která zatím nebyla na LXC spuštěna. Data, DB granty i TLS beze změn.


**17. 11. 2026 – návštěvnický jazyk:** Hlavní texty klimatologických kapitol (extrémy, trendy, sezóny, ročenka) a stránky o půdě/ovzduší jsou česky bez odborného žargonu, zatímco odborná metodika, zdroj WeeWX, limity a neověřené historické záznamy jsou v rozbalovacích vysvětleních. Odborné výpočty a původ archivních dat se nemění.


**17. 11. 2026 – stabilita live→archiv:** Oprava panelu aktuálních dat zavádí `archiveRequestSerial`, aby opožděné HTTP odpovědi z dřívějšího stavu nemohly přepsat aktuální archivní měření nebo stavový chip. Izolovaný Playwright test simuluje obě odpovědi jen v prohlížeči a ověřuje tři šířky. Bez databázových a produkčních změn.


**17. 11. 2026 – profilování klimatologie:** Samostatná dev větev zrychluje zpracování tří souhrnných metrik single-pass indexem ročních/měsíčních dat a přidává opt-in anonymní výkonový log `climate_dashboard_refresh` přes `WEATHER_API_PERF_LOG=YES`. Předchozí reálný dev veřejný smoke měl na `/klimatologie/` 10 API fetchů místo 69; podle toho nelze odhadnout SQL P95. Provozní DB práva a TLS jsou provozovatelem odložena a kód je nemění. Více `docs/CLIMATE_DASHBOARD_PROFILING_2026-11-17.md`.


**17. 11. 2026 – potvrzený DB audit a rozhodnutí LAN:** Staging DB audit v 18:59:09 UTC skutečně skončil `ready=false`: `expectedOriginalSchema=true`, `requiredSelect=true`, `targetReadOnly=true`, `transportEncrypted=false`, `certificateVerified=false`, `noOtherSchemaWriteGrants=false`. Provozovatel výslovně nevyžaduje TLS mezi API a MariaDB uvnitř důvěryhodné LAN. Nová explicitní volba `--trusted-lan` v jednorázové bezpečnostní sondě mění jen auditní politiku, žádná přístupová práva ani runtime. Nadbytečná zápisová práva účtu v jiném schématu zůstávají produkční blocker, segmentaci LAN je nutné potvrdit zvlášť.


**Veřejná dev CI kontrola backendu (návrh PR 17. 11. 2026):** Public GitHub Actions smoke workflow nově sleduje `api/**` i `frontend/**`; změny Fastify na main tak po automatickém dev sync projdou skutečným browser/archiv testem, nikoli jen izolovanými API unit testy. Výchozí kontrola bezpečnostní sondy ve Fastify CI je bez reálného LXC běhu; TLS a granty nejsou ověřeny.


**Bezpečnost API – návrh staging attestation 17. 11. 2026:** V samostatné větvi je read-only skript pro jednorázové ověření aktuální DB relace a grantů API účtu na DEV LXC; vždy selže při neověřeném TLS, právech k zápisu do původního schématu či nadbytečných zápisových grantech do jiných schémat. Skript nikdy nemění DB ani nevypisuje přístupy. Reálné spuštění není doložené a produkce zůstává NO-GO; návod `docs/STAGING_DB_SECURITY_ATTESTATION_2026-11-17.md`.


**17. 11. 2026 – výkon klimatologie potvrzený na DEV:** Po PR #119 a nasazení `e13bf6e` veřejný run `44148375636` PASS: 15 veřejných tras, desktop/mobilní klimatologické grafy, GW3000 SSE a bezpečný návrat k archivu. Úplná návštěva klimatologie vyvolala 10 fetchů API (předchozí baseline 69), tj. o 85,5 % méně; nikoliv ale prokázané zrychlení načítání stránky. Nový samostatný PR přidává limit 20 fetchů a právě jedno souhrnné načtení jako regresní ochranu. Produkční bezpečnostní brány stále NO-GO.


**Klimatologická agregace (PR etapa 17. 11. 2026):** Nový bounded read-only endpoint `/api/v1/climate/dashboard` má nahradit 58+ samostatných ročních/měsíčních dotazů pouze třemi čteními originálních denních souhrnů, se zachováním shodných serverových agregací a označení QC. Plná návštěva klimatologie před změnou: 69 API fetchů (public smoke run `44144985564`). Ověření výkonu **po změně** vyžaduje samostatnou revizi, zelené CI a skutečný dev smoke; dosud nejde o doložené zlepšení. Viz `docs/CLIMATE_DASHBOARD_BATCH_2026-11-17.md`. Produkční MariaDB a WeeWX se nemění.


**Návštěvnická revize 17. 11. 2026 (PR #118):** Dev smoke ověřil 15 veřejných tras a nasazení commitu `9c7ac20`, ale celkový workflow selhal na starých textech v live/failover testu. Opravena semantika testu, odložen detail klimatologických dotazů do viewportu, odstraněn zbytkový listener pro aktualizaci archivu při navigaci, přidán 320px Axe audit. Předchozí dev výkonový log byl jediný CI běh; detaily a nezavřené blocker v `docs/VISITOR_MOBILE_AUDIT_2026-11-17.md`. NIC netvrdí o produkční readiness či schválení QC.
 

**17. 11. 2026 – návrh pasivního reportu návštěvnického výkonu:** Nový PR rozšiřuje existující veřejný dev vizuální smoke o anonymní laboratorní časy načtení bez nového HTTP požadavku. Po případném merge vzniká `visitor-performance.json` ve screenshot artefaktu. Stavy LXC, TLS, grantů, záloh ani produkční připravenosti tím nejsou ověřeny. Runbook: `docs/VISITOR_PERFORMANCE_AND_RELEASE_GATES_2026-11-17.md`.


**Návrh 17. 11. 2026 – návštěvnický úvod klimatologie:** Na samostatné frontend větvi jsou připravené čtyři historické zajímavosti ze stávajícího veřejného original-only records endpointu s označením předběžnosti a známých srážkových omezení. Přibyla přímá navigace na meziroční grafy a srovnání sezón. Neznamená to změnu DB, schválení QC ani potvrzení o nasazení; CI/preview ověřovat podle konkrétního commitu.

**Srážky 2009–2026 – porovnání a atlas (12. 11. 2026):** Skutečný read-only SQL originál vs pracovní rekonstrukce ve stejném rozsahu do 2026-10-29 15:10 UTC: změny ročních úhrnů jen 2009–2011 (−367,62 mm), 2021 (−658,448 mm, červenec 701,015→42,567 mm) a 2025 (−30,5 mm). Pracovní max roční 2024 1057,7 mm, max denní 30. 6. 2011 63,96 mm, obojí necertifikované. 221 čekajících položek: 4 rain nuly již v pracovní kopii, 9 nečíselných rain, 1 chybějící 2022-09-15 řádek ze staré DB, 204 nečíselných rainRate (48 s kladným rain), 3 číselné GW1000 rate k cílené revizi. Originální rainRate 2009–2025 nemá kladné hodnoty. Frontendová sekce srážkového atlasu a ochrana ročního sklonu/rekordů používá jen původní data, nové testy a dokumentace docs/RAIN_ARCHIVE_IMPACT_2026-11-12.md. Žádné zápisy, automatické approval ani veřejný reconstructed dataset; CI/živé nasazení ověřovat zvlášť.

**RH duben 2022 – rozhodovací experiment Magnus (12. 11. 2026):** Přímo read-only SQL potvrzeno: na 4 752 původních kontrolních trojicích mimo známé frozen sloty má dual vapor pressure MAE 2,17 p. b.; přísný pracovní filtr (surová RH shoda ≤10 p. b., přenesená ≤5 p. b., T každé reference vůči místní ≤3 °C, bez clipping) 2 043 vzorků, MAE 1,82 vs WU 2,16. Historických 285 missing + 1 140 frozen projde filtrem; 281 missing nemá dostatečné stejnodenní kontroly, 4 na 25. 4. nesplňují denní chybovou hranici. Žádný missing není prioritní, 264 frozen pouze prioritní k ruční revizi. Žádné schválení, DB změny, publikace či celoroční extrapolace (červencová MAE Magnus 7,69 vs WU 6,11). Nový offline rozhodovací modul a SQL v deploy/lxc, viz docs/QC_RH_APRIL_2022_MAGNUS_DECISION_2026-11-12.md. Atlas frontend PR #108 sloučen commit 5776f12, dev nasazení ověřit samostatně.

**Atlas – pokrytí historické RH (12. 11. 2026):** Navazuje na potvrzený celoroční technický audit 2022 a odborné readiness důkazy. Nová frontendová sekce `/klimatologie/trendy/#vlhkost-archiv` používá pouze původní denní souhrny a stávající roční matici, odděluje dny s hodnotou, bez hodnoty a podezřelé, zobrazuje samostatné časové pokrytí a upozorňuje na výpadky RH 2022 i dubnové známé zamrzlé úseky. Není to certifikace kvality; nepřimíchává žádné experimentální rekonstrukce nebo reference. Kód, CI a skutečný dev deployment posuzovat odděleně. Podrobnosti docs/ATLAS_HUMIDITY_COVERAGE_2026-11-12.md. Další experiment Magnus pouze odděleně, bez schvalování a zápisů.

**Celoroční RH 2022 QC audit – 11. 11. 2026 (kód):** Po uživatelem potvrzeném soukromém pětidením auditu 26.–30. 4. 2022 (1 438 původních řádků, 2 celé chybějící 5min sloty, 166 existujících NULL bez odhadu, 1 272 experimentálních odhadů, žádné extrémní skoky >=20 p. b. v bezprostředně sousedních 5min úsecích) je připraven jednorázový roční audit všech 73 navazujících 5denních oken read-only přes localhost sidecar 3101. Má řízenou prodlevu mezi dotazy, trvá na všech 5 153 historických zásazích, reportuje 12 měsíců, problémové dny a jasně označuje první konec intervalu Jan 1 00:00 UTC jako nedostupný přes API. Návod docs/RH_2022_FULL_YEAR_QC_RUNBOOK.md; reálný běh na LXC teprve ověřit, žádné odborné schválení ani produkční publikování.

**Autonomní QC audit RH náhledu – 11. 11. 2026 (kód):** Po operátorem potvrzeném úspěšném startu izolovaného sidecaru na 3101 (health/ready/UI HTTP 200, bez tokenu 401, původní API 3100 HTTP 200) a autorizovaném čtení jednoho historického řádku je připraven samostatný read-only Python audit přes soukromé API. Umožní porovnat očekávanou 5min mřížku s reálnými řádky, chybějící celé sloty vs. stále NULL RH, typy neschválených změn a orientační skoky. Pouze soukromý JSON report, bez API/DB změn. Návod: docs/RH_2022_READONLY_QC_RUNBOOK.md. Skutečné výsledky nového auditu teprve ověřit na LXC; meteorologická správnost odhadů není schválena.

**Nová příprava 11. 11. 2026 – RH 2022 operátorský náhled:** schválené jsou pouze změny zdrojového kódu a čtecí postup, nikoli meteorologická správnost experimentálních oprav. Z LXC se podařilo pod SELECT-only účtem vytvořit a zkontrolovat soukromý verzovaný balíček 5 153 historických RH změn z `loucka_reconstruction` (2 874 NULL→odhad, 2 194 podezřelá RH→odhad, 85 historických zneplatnění). JSON i řádkové SHA-256, počet a soukromé oprávnění byly uživatelem přímo ověřeny. Dev Fastify běží na 127.0.0.1:3100, HTTP health 200, původní `WEATHER_DB_SCHEMA=pocasi-loucka.eu`; preview HTTP 404 z důvodu výchozího vypnutí. V dalším samostatném PR připraven **lokální sidecar 3101 s operátorským porovnávacím grafem**, ale dokud se jednotka na LXC explicitně nenainstaluje a neověří, **netvrdit že UI běží**. Návod: `docs/RH_2022_PRIVATE_COMPARE_SIDECAR.md`. Původní archiv nikdy nepřepisovat; nenasazovat experimentální odhady na veřejný web.


**Aktualizace vstupního přehledu: 7. 11. 2026.** Zdroj pravdy je aktuální `main`, historická dokumentace ve `main/docs/` a samostatné provozní důkazy. Referenční benchmarky byly sloučeny v [PR #2](https://github.com/Boym323/Loucka_weather/pull/2) 1. 11. 2026. Astro frontend a Fastify API běží na testovacím náhledu; poslední potvrzený veřejný smoke 6. 11. ověřil commit `c8a5ab11` na 11 trasách pro desktop a mobil. Ověření z tohoto dne není automaticky dnešní aktuální nasazení. Původní veřejný web zůstává samostatný.

**Provozní výkonnostní audit:** Issue [#36](https://github.com/Boym323/Loucka_weather/issues/36) byl uzavřen 5. 11. po sloučení změn observer shutdown/profilovací sondy a jejich staging ověření; metodika a omezení jsou v [auditu 5. 11. 2026](API_PERFORMANCE_AUDIT_2026-11-05.md). Následný [Issue #55](https://github.com/Boym323/Loucka_weather/issues/55) stále řeší dlouhodobý trend RSS/heap, cold refresh a živě ověřený SSE shutdown. Krátké profilování **neprokazuje** paměťový leak ani dlouhodobou stabilitu.

## Další etapa Klimatologického atlasu (7. 11. 2026)

Rozpracovaný PR pro druhou etapu doplňuje žebříčky dokončených sezón z
existujícího `temperature-years` endpointu, detail rekordního dne
z omezeného read-only `history?resolution=raw` a dva měsíční SVG
grafy v tisknutelné ročence. Pořadí sezón vyžaduje 90 % denního
i časového pokrytí a nevydává neúplné záznamy za klimatický normál.
Neměnit metadata na „nasazeno“, dokud CI a staging smoke skutečně
nepotvrdí příslušný squash merge commit.

## Klimatologický atlas – vývojová etapa (7. 11. 2026)

Na samostatné frontend větvi se připravuje nový přehled
`/klimatologie/`, kapitoly `/klimatologie/extremy/`,
`/klimatologie/trendy/`, `/klimatologie/sezony/` a
`/klimatologie/rocenka/`. Základem jsou existující read-only
`/api/v1/climate/records`, `/api/v1/climate/annual-matrix` a
`/api/v1/history`. Původní klimatologické grafy, srovnání roků a
heatmapy zůstávají na `/klimatologie/` se stejnými kotvami. Ročenka
nabízí pouze tisk / uložení do PDF přes dialog prohlížeče.
Vše je **předběžné**: období 2009–2026 není 30letý normál,
forenzní rekonstrukce není dokončena a srážkové anomálie mohou
ovlivnit souhrny. Neoznačovat práci za sloučenou nebo nasazenou,
dokud neproběhne PR, jeho zelené CI a veřejný smoke.

## Cíl
Navrhnout moderní portál **Počasí Loučka** pro veřejný web `https://pocasi-loucka.eu/`, s mobilním rozhraním, živými údaji, historickými grafy, statistikami a přehledem kvality dat. Původní **WeeWX + Belchertown** nadále provozovat, neměnit beze schválení produkční sběr dat. Meteorologická stanice Ecowitt GW3000, WeeWX a historický MariaDB archiv. Součástí většího projektu je historický audit a rekonstrukce chybějících/anomálních měření.

## Důležité skutečnosti
- Archiv obsahuje přibližně **1,68–1,7 milionu** měření od 2009 do 2026. Za ověřené poslední 24hodinové okno při posledním dotazu na Weather MCP bylo **288 záznamů, všechny s intervalem 5 minut**. Historicky nemusí intervaly být vždy 5 minut a jsou výpadky.
- Původní databáze `pocasi-loucka.eu`, tabulka `archive` (WeeWX), se **nesmí měnit**. Opravy patří pouze do `loucka_reconstruction` podle schválených rekonstrukčních postupů; nelze předpokládat, že každá položka rekonstrukční DB byla opravena, ani že má konkrétní původ.
- Existují okolní referenční stanice a několik zdrojových databází; jejich časové hranice, jednotky, věrohodnost a provenienci ověřovat. Chybějící měření nikdy automaticky nedoplňovat nulou; rekonstruovaná data nezaměňovat za naměřená.
- WeeWX archivní `dateTime` označuje **konec intervalu (start, end]**. Pro přiřazení dne použít `Europe/Prague`, zohlednit CET/CEST; přiřazení koncového času přesně na půlnoc je důležité.
- V současném webu jsou živá MQTT/WebSocket spojení a staticky poskytované JSON soubory. V Nginx proxy logu je `/mqtt` **251 požadavků (250× HTTP 101, 1× HTTP 502)**; nevypovídá to o současném počtu spojení.
- Matomo za **říjen 2026**: 216 návštěv, 73 unikátních návštěvníků, 314 akcí. Nginx za 27. 9. – 31. 10. 2026: **54 966** HTTP záznamů; významnou část tvoří automatizované skenování, monitorovací roboti a crawlery. Podrobnosti níže.
- **Stack v1 – předběžná pracovní preference, ne definitivně schválený architektonický závěr:** Astro + TypeScript + ECharts pro web; Node.js + Fastify jako datová vrstva; MariaDB pouze pro čtení v aplikačním backendu; cache a předpočítané agregace; živé aktualizace přes MQTT/WebSocket. Go zůstává kandidátem na API; Rust případně na batch worker, **zatím nepřidávat bez výkonové potřeby**.
- Referenční HTTP benchmark šesti backendů vykázal pro 30denní historii při c10: Go 31,34 RPS, Node.js 17,37 RPS (mediány 3 běhů); velký plný benchmark **běžel proti živé produkční databázi**, ač `isolated_copy=true` v JSON chybně tvrdilo opak. NIKDY neopakovat full test proti produkci.
- Offline výpočet celohistorických statistik na **syntetických** 1,68M řádcích: Rust 4,10 s / 107,23 MiB RSS; Go 5,26 s / 422,54 MiB; Node.js 15,36 s / 272,25 MiB. Všech 72 pokusů napříč profilem smoke/light/full mělo numerickou shodu. Nejde o výkonnost celé aplikace ani nezávislé ověření vědecké správnosti statistik.

## Povinné čtení pro další AI
1. [Rozhodnutí o architektuře – v1](ARCHITECTURE_DECISION_2026-10-31.md) – stav, výběr Node.js/Go/Rust, provedená a zbývající ověření.
   - [Audit návrhového API kontraktu v1](API_CONTRACT_AUDIT_2026-10-31.md) – OpenAPI 3.1, katalog 80 SQL sloupců, návrhová schémata a hranice offline/živé parity.
   - [Vyměnitelné API a migrace](API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md) – samostatné API mimo WeeWX, verzovaný kontrakt, parity testy a přepnutí Fastify → Go/Rust bez přepisu frontendu.
2. [Audit skutečného HTTP provozu](TRAFFIC_AUDIT_2026-10-31.md) – kompletní zpracování 5 souborů NPM, bezpečnost, špičky, cache, MQTT.
3. [Audit Matomo](MATOMO_AUDIT_2026-10-31.md) – návštěvnost, mobilní zařízení, nejpoužívanější stránky.
4. [Syntéza všech benchmarků](BENCHMARK_SYNTHESIS_2026-10-31.md) – přímé porovnání a rizika interpretace.
5. [Zdroje, ověřitelnost a ochrana soukromí](SOURCES_AND_REPRODUCIBILITY.md) – provenance čísel, dostupnost zdrojových dat a testovací hranice.
6. [Nginx data po dnech bez IP adres](data/traffic_daily_2026-09-27_2026-10-31.csv).
7. [Branch benchmarků](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python/benchmark/) a [offline compute](https://github.com/Boym323/Loucka_weather/tree/bench/go-rust-python/benchmark/compute/).

## Co není hotové
- Testovací frontend a Fastify API běží na `dev.pocasi-loucka.eu`. Veřejný Playwright smoke 6. 11. ověřil 11 tras na desktopu a mobilu. Zbývající audit: dokázat skutečné vykreslení lazy-loaded klimatologie, mobilní ergonomii, proxy/rate limit a pořadí publikace při aktivaci API. Tuto kontrolu nelze zaměňovat za úplný audit produkčního prostředí.
- V repozitáři nejsou původní surové HTTP logy ani osobní IP adresy a nejsou zde originální soubory Matomo; reporty uvádějí agregáty ověřené read-only konektorem.
- Zbývá ověřit zátěž **všech** požadovaných API endpointů na testovací kopii DB, efekt aktivních MQTT spojení, správnost statistik nad reálnou rekonstruovanou historií a reálný dopad na DB a WeeWX writer.
- Neexistuje ještě finální přijetí stacku v produkci. Před samotnou implementací schválit přesné moduly, provozní hranice a bezpečnostní pravidla.

## Instrukce pro nový chat
„Pokračujeme v projektu Boym323/Loucka_weather. Nejprve načti `main/docs/PROJECT_CONTEXT.md` a všechny zde odkazované audity. Původní benchmarky hledej v `main/benchmark/` a historickém PR #2. Nezaměňuj syntetické/produkční měření, respektuj read-only produkční archiv a nic nemaž. Nejprve vyhodnoť aktuální stav projektu a navrhni nejbližší bezpečné kroky.“


## Jednotky v návrhu API v1
Doplněn `?units=us|metric|metricwx` (default metricwx); zdrojová normalizace podle `usUnits` každého řádku 1/16/17. Odpovědi musí uvádět skutečné jednotky; golden vektory v `tests/fixtures/unit-conversions.json` a referenční převodník `contracts/unit_conversion.py`. Detaily v [API auditu](API_CONTRACT_AUDIT_2026-10-31.md). Úplný kontrakt je návrh; část API v1 je implementovaná na testovacím webu.

## API v1 – aktuální zadání
Kontrakt v [API_V1_PRODUCT_CONTRACT.md](API_V1_PRODUCT_CONTRACT.md) a OpenAPI 3.1 definuje metadata, historii, statistiky, SSE a status kamery. Aktuální `main` obsahuje Fastify API s historií, statistikami, read-only archivním observerem a live GW3000 HTTP přenosem; jeho skutečné staging chování ověřuj z aktuálních testů a `deployment.json`. Produkční nasazení původního webu, plná historická QC a parita případné alternativy Go/Rust zůstávají samostatnými úkoly.

## Archivní refresh – staging implementace
Read-only archivní observer a SSE `archive-updated` jsou již implementované na stagingu. Podmínky `summaryStatus` nadále závisí na ověřené čerstvosti souhrnů a nesmí vytvářet domnělou čerstvost. Stav GW3000 live HTTP přenosu je oddělený od MQTT. Kontrakt a omezení jsou v [ARCHIVE_REFRESH_CONTRACT.md](ARCHIVE_REFRESH_CONTRACT.md), provozní kontrola v auditu 5. 11. a otevřeném Issue #55.

## Průběžná dokumentace

Aktuální změny zapisovat do [CHANGELOG.md](../CHANGELOG.md), stav rozhraní a otevřené problémy udržovat ve [frontend/README.md](../frontend/README.md). Nové nasazení ověřovat samostatně, GitHub `main` ani úspěšné CI nejsou důkazem nasazeného commitu.
