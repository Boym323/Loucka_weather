# Loučka Weather – audit nového frontendu, webkamery a dalších funkcí

**31. 10. 2026 · Stav: návrh a identifikace mezer, nikoli kontrola hotové aplikace.**  
**Bez změn MariaDB, WeeWX, live webu, kamery a produkční infrastruktury.** Nová aplikace ještě nemá produkční zdrojový kód, staging ani UI testy; nelze ji „otestovat v prohlížeči“ jako existující frontend.

## 1. Skutečný podklad a rozsah

Prostudováno:
- aktuální `main/docs/PROJECT_CONTEXT.md`, `ARCHITECTURE_DECISION_2026-10-31.md`, `MATOMO_AUDIT_2026-10-31.md`, `TRAFFIC_AUDIT_2026-10-31.md` a benchmarková syntéza;
- návrhová větev `docs/frontend-audit-v1`: `FRONTEND_SPEC.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `WEEWX_DAILY_SUMMARIES_AUDIT.md`;
- veřejné `https://pocasi-loucka.eu/`, `/graphs/`, `/records/`, `/reports/`, `/about/` ve veřejném HTML/textovém zobrazení;
- jednorázová **SELECT-only** kontrola skutečných sloupců `information_schema.COLUMNS` a přítomnosti měření za posledních 7 dní v produkčním `archive`; neprovedeny žádné zápisy;
- oficiální podmínky Windy, Open-Meteo, publikace ČHMÚ CAP a informace ÚOOÚ k provozu kamery.

**Rozlišení stavu:** současný WeeWX/Belchertown portál je v provozu; nový Astro frontend je **specifikace, ne postavený web**. Přítomnost prvku ve starém portálu nepotvrzuje funkčnost stejné komponenty v novém návrhu.

### Veřejný současný web

Homepage má veřejně dohledatelné záložky **„Radar“ a „Kamera západ“**, widget Windy a přehled Slunce/Měsíc. Grafy jsou samostatná důležitá sekce `/graphs/`, rekordy na `/records/`, roční a měsíční reporty na `/reports/`. Veřejný textový fetch však **nezjistil URL originální kamery, skutečný obraz, interval obnovy, formát streamu, autentizaci nebo existenci archivů**. Kamerový zdroj tedy zůstává **BLOCKED – auditovat přes autorizované read-only nastavení stávajícího webu či DevTools, bez zveřejnění URL/tokenů**.

Podle Matomo za probíhající říjen 2026: **216 návštěv**, z toho **52,8 % mobilní telefon/phablet**; z 314 pageview akcí **186 úvodní stránka, 107 grafy**, dohromady 93 % zaznamenaných zobrazení. Technickou prioritou je tedy přehled+grafy v mobilu, ostatní sekce by je neměly vizuálně nebo výkonnostně zatlačit.

## 2. Funkční audit a cílové priority

| Funkce | Ověřené podklady | Stav v návrhu | Doporučení |
|---|---|---|---|
| Aktuální počasí / homepage | WeeWX, veřejný web a původní MQTT | MVP definováno, implementace není | **P0:** čas posledního měření, samostatný „live“ vs 5min archive, min/max a zdroj |
| Grafy 1h/24h/7d/30d/rok | `archive`, L2 denní souhrny | silná specifikace | **P0:** zachování gap/null, downsampling s meteo sémantikou, export |
| Radar | existující záložka Windy | plán widgetu | **P0:** widget jen po ověření podmínek; záložní link-out |
| **Webkamera západ** | existující veřejná záložka | homepage MVP vs samostatná /kamera fáze 2 | **P0:** potvrdit zdroj a nasadit skutečný latest snapshot; **P1:** archiv/timelapse |
| Výstrahy ČHMÚ | oficiální CAP | příprava ve fázi 3 | **P1:** lokální platnost / ORP, issued/updated/cancelled, stav nedostupnosti |
| Předpověď | existující prvky a návrh Open-Meteo | fáze 3 | **P1:** jasně rozlišit model vs měření; licence, čas model run |
| Blesky | `lightning_*` | bez rozpracovaného UX | **P1:** poslední událost, počet v okně, mapu neodvozovat z jedné vzdálenosti |
| Senzory / baterie / výpadky | `archive` / GW3000 | MVP | **P0/P1:** skutečná metadata senzoru, stav/dostupnost; null nemusí být offline |
| Půda a extra teploty | soil* a extra* | fáze 2 | **P1:** historicky verzované mapování hloubek, bez hádání |
| PM2,5 / UV / radiace | dostupné sloupce | fáze 2 | **P1:** meteo/QC, jednotky, kontext a důvěryhodnost |
| Klimatologie / rekordy | 78 denních WeeWX souhrnů a historické reporty | fáze 2 | **P1:** úplnost měření, rekonstrukce a pravdivé rekordy |
| Slunce / Měsíc | stávající homepage | chybí konkrétní API/UI scénáře | **P1:** východ/západ, délka dne, poloha a fáze s uvedením zdroje/metody |
| Historické porovnání „dnes dříve“ | existující rekordní prvky | navrženo | **P2:** tabulka podle stejných kalendářních dní s QC |
| Instalovatelná PWA / offline | bez rozhodnutí | chybí | **P2:** až po základní cache a semantice zastaralých údajů |
| Otevřená data / CSV/JSON | API návrh | částečně | **P1:** licence, jednotky, query limity, zdroj, UTC, coverage |

**Rozpor priorit:** `FRONTEND_SPEC.md` uvádí aktuální snímek kamery na homepage v MVP, ale vlastní `/kamera` až fáze 2. Doporučení: **MVP karta aktuálního snímku**, samostatná archivní stránka ve druhé fázi.

## 3. Webkamera – technický návrh, neprokázané detaily

### 3.1 Před implementací ověřit

- Odkud starý Belchertown bere „Kamera západ“: generovaný lokální soubor / HTTP JPEG / autentizovaný snapshot / RTSP/MJPEG / externí widget? Nestačí samotná existence záložky. Zdroj a credential jen do interní konfigurace, **nikoliv do GitHubu či klientského JS**.
- Reálné rozlišení, velikost snímku, čas pořízení vs čas načtení, směr, zorné pole, provoz v noci, autentizace, dostupnost, licence pro vlastní web.
- Zda jsou v záběru osoby, cizí obydlí, identifikovatelné SPZ. Před zveřejněním řešit **maskování obrazu**, účel a přiměřenou dobu uchování. Základní rámec: ÚOOÚ https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/kamerove-systemy .
- Kde je současná archivace, kapacita samostatného disku, možnosti retence, rozpočet CPU pro ffmpeg; nebudovat naslepo duplicitní snapshot procesy.

### 3.2 Doporučený pipeline pro první verzi

`ověřený privátní zdroj kamery → jediný interní capture worker (30–60 s) → kontrola/omezování rozměru + privacy mask + EXIF strip → atomicky publikovaný JPEG/WebP na samostatném úložišti → Nginx /camera/latest.webp a GET /api/v1/camera/status → Astro CameraPanel`.

- **Nevolat originální kameru pro každého návštěvníka** a nepoužívat webový SQL server jako proxy libovolně zadaného URL (SSRF).
- Jeden periodický fetch s pevně nakonfigurovanou adresou/allowlistem; timeout, omezená velikost odpovědi, content-type, validace dekódování a rozlišení, zákaz přesměrování na neznámý host či vnitřní služby. Případnou authentizaci držet server-side.
- Metadata **`captured_at`**, `published_at`, `camera_id`, `quality`, `status`, `width`, `height` a link na aktuální snímek; kontrolovat čerstvost podle skutečného času pořízení, ne podle času načtení do browseru. `last_success` a chybový stav public bez interních detailů.
- Responsive obrázek, pevný aspect ratio, `alt`, možnost zvětšení, dostupný alternativní text „kamera je nedostupná“; vždy vizuální datum/čas.
- Aktualizovat pouze u viditelné karty/záložky, pozastavit skrytou kartu/background tab. `Cache-Control` pro latest krátký (např. 15–30 s), immutable URL pro archiv; ETag/Last-Modified, bez agresivního build-time cache Astro pro měnící se URL.
- **Žádný permanentní stream nebo autoplay videa ve v1** bez ověření reálného zdroje, návštěvnosti a uplinku. RTSP nesmí být publikováno přímo klientovi. Pokud později live video, samostatná služba, HLS/WebRTC gateway podle latence a nákladů.
- Kamera offline nemá zablokovat homepage ani meteo API.

### 3.3 Archiv / timelapse až v P1

Návrh: každých 5 min archivovat již získaný snapshot, 30 dní retence; delší dobu maximálně hodinové snímky dle kapacity a soukromí. `288 snímků/den`, `8 640 snímků/30 dní`; při **500 kB/snímek cca 4,32 GB decimal / 4,02 GiB** plus náhledy, indexy a videa. **Jde o kapacitní model, nikoli skutečnou velikost kamery.**

- Náhledová časová osa a datum, roztříděné snímky; chybějící snímky nenahrazovat duplikátem bez příznaku.
- Denní timelapse dávkově mimo web worker a mimo rootfs release; CPU/IO quota a monitoring failed transcode; nevyžadovat návštěvnický request na generování videa.
- Vyřešit mazání dle retence včetně odvozených thumbnailů/MP4 a backup copies, s právem zastavit archivaci při narušení soukromí.
- Akceptační testy: offline, 404, 3× starý snímek, restart workeru, atomic publish, DST (čas snapshotu UTC+lokální displej), malá šířka mobilu, maskované oblasti.

## 4. Živá meteorologická data – důležitá mezera

Stávající proxy logy obsahují `/mqtt` **250× 101, 1× 502**; ukazuje to, že WS upgrade se používá, **ne** počet souběžných klientů či počet zpráv. Před návrhem nové live cesty změřit broker, subscribe topic, frekvenci, keepalive/reconnect, počet klientů, bytes/sec a bezpečnostní autentizaci. Na novém webu zobrazit `observed_at` z LOOP/MQTT a odděleně archivní pětiminutový `archive.dateTime`. Nenahrazovat „live“ periodickým dotazem do MariaDB každý vteřinu pro každého návštěvníka.

Doporučení: klient má snapshot + sdílený SSE/WS stream z lokálního live adaptéru; fallback na last 5min archive se štítkem „poslední archivní měření“ a s viditelným stáří. WS pouze tehdy, pokud skutečný zdroj a jednoduchost odůvodní trvalé připojení; při malé návštěvnosti může stačit řízený polling.

## 5. Skutečný audit dostupnosti senzorových polí (7 dní)

SELECT-only kontrola `information_schema.COLUMNS` ukázala v `archive` přesné názvy:
`soilMoist1`, `soilTemp1..6`, `extraTemp1..2`, `lightning_strike_count`, `lightning_distance`, `pm25_1`, `radiation`, `UV`, `luminosity`. **Není pravda, že aktuální schéma má `soilMoisture1..4`**, což je jeden ze starších neověřených popisů.

Na posledních **2014 archive řádcích (~7 dní)**:
| Metrika | Nenulový počet řádků ve smyslu NOT NULL | Výklad |
|---|---:|---|
| `soilMoist1` | 2014 | hodnota je přítomna, není doložena kvalita ani kalibrace |
| `soilTemp1` | 2011 | téměř úplné |
| `soilTemp2` | **0** | nezobrazovat jako aktivní hloubku/senzor bez mapování |
| `soilTemp3/4/5/6` | po **2011** | přítomná data; jejich hloubky a účel nejsou ověřeny |
| `extraTemp1` / `extraTemp2` | **2014 / 0** | názvy a význam nesměšovat s půdními sondami |
| `lightning_strike_count` | **39** | řídká data; **nelze z toho automaticky vyvodit offline**, může být event-only/NULL |
| `lightning_distance` | **0** | bez aktuálního měření vzdálenosti; „neznámá“ místo 0 km |
| `pm25_1` | 2014 | přítomná časová řada |
| `radiation`, `UV`, `luminosity` | po **2005** | téměř úplné, QC není tímto potvrzena |

Tento SELECT **nezaručuje správnost hodnot**. Časově platné mapování půdních sond/kalibrací musí být konfigurované explicitně, včetně migrací. Při návrhu lightning widgetu oddělit absence údaje od „0 blesků“ a od poruchy zařízení; zachovat jednotky a semantiku čítače.

## 6. Pozor: rekordy na současném webu mohou být problematické

Veřejná stránka `/records/` aktuálně uvádí mimo jiné **sluneční záření 2368 W/m²**, **UV 15**, **PM2.5 1000 µg/m³**, **max. rainRate 451,2 mm/h** a **měsíční srážky 701 mm v červenci 2021**. Tyto hodnoty **nejsou automaticky prokázané chyby**, ale představují jasné kandidáty na samostatnou QC a potvrzení senzorových epoch / resetů čítače před publikováním jako validované historické rekordy. Na veřejném webu uvést `quality=unverified/suspect`, původ, interval, jednotku a případně možnost porovnání s ověřenou rekonstrukcí. Nepublikovat extrémy jako nové „čisté“ rekordy jen proto, že v `archive_day_*` existují řádky.

## 7. Externí mapy, radar, předpověď, výstrahy – práva a produkty

### Radar / Windy – **licenční blocker k ověření**
Současný web obsahuje Windy iframe. Jeho [podmínky](https://account.windy.com/agreements/windy-terms-of-use) v části „Windy and Webcam embeddable widget“ říkají, že widgety jsou pro mediální použití, logo musí být viditelné/klikatelné a **nesmí se používat ve weather apps a jiných komerčních webech**. Osobní meteorologický portál může být pro tento účel považován za weather app; **nelze bez vyjasnění podmínek automaticky přenést iframe do nového webu**. Zdrojové API dlaždice nescrapovat. Jako přechodná záloha raději link na oficiální radar nebo licenčně doložený alternativní widget.

### Výstrahy ČHMÚ
ČHMÚ používá **CAP** s identitou/časem výstrahy, jevem, intenzitou, pravděpodobností a územní platností na ORP. Od **1. 7. 2026** platí upravený číselník jevů – parser nesmí hardcodovat historické mapování. Pro Loučku ověřit příslušný ORP kód, zrušení/aktualizace výstrahy, zdroj a TTL. **Nedostupnost fetcheru není „bez výstrah“**. Oficiální zdroj: https://www.chmi.cz/predpoved-pocasi/system-integrovane-vystrazne-sluzby .

### Předpověď
Open-Meteo má [zdokumentované podmínky](https://open-meteo.com/en/terms): bezplatná varianta je pro **nekomerční použití** s limity; při reklamě/komerčním využití je nutné ověřit odpovídající licenci. Karty oddělit jako `forecast` od `observation`, uvést čas vydání, model, platnost, zdroj a možnost unavailable. Externí provider nepřipojovat z každého browseru zvlášť; jedna aplikační cache s TTL a attribution.

### Radar UX
Lazy-load těžkých iframe/map až při zájmu, neblokovat LCP mobilní homepage. Vždy ukázat čas produktu, zdroj, legendu a stáří; nouzový odkaz na původní veřejný zdroj. Pokud se mapa právně nebo technicky nepodaří ověřit, nesmí převzetí nového webu záviset na nelegitimním embed kódu.

## 8. Mobil, přístupnost, dostupnost, bezpečnost

- Mobile-first, protože přibližně **53 % návštěv je mobilních**; přístup ke grafu a kamerovému náhledu bez skrytého gestického ovládání. Na homepage přednost skutečnému přehledu teploty, kvalitě dat a 24h grafu; kamera/radar až níže, aby nebrzdily první vykreslení.
- Kamera komponenta: pevný aspect-ratio, poster/placeholder, loading=lazy mimo viewport, `width/height`, foto neaktualizovat při background tab, status overlay „Pořízeno HH:mm“, ne auto-play a zvuk. WCAG 2.2 AA, keyboard, správná struktura a alternativy tabulek u grafů.
- Návrhové cíle LCP ≤2,5s, CLS ≤0,1, INP ≤200ms měřit skutečně, nelze tvrdit PASS bez nové aplikace a testů. Nezapínat všechna ECharts/modules/charty na homepage a nehydratovat celý layout kvůli jednotlivé hodnotě.
- HSTS/CSP a proxy policy až po zmapování legitimních externích iframe/camera endpointů; hlídat veřejné origin URLs, SSRF, open proxy, clickjacking, rate limit, 404 bursty. Live DB účet readonly a databáze nepublikovat.
- Status s nezávislými doménami `weather_data`, `camera`, `radar`, `forecast`, `alerts`. Při výpadku jedné služby zbytek homepage zůstane použitelný.
- Export CSV + zdroj/měření/reconstruction/quality, lokální CET/CEST, metrické jednotky. Čas z `archive.dateTime` je konec intervalu `(start,end]`; DST musí mít testy.

## 9. Praktická informační architektura – méně položek, více obsahu

**MVP navigace:** `/` Přehled, `/grafy`, `/rekordy`, `/o-stanici`. Karta kamery a radaru na homepage, diagnostický odkaz jen při existujícím obsahu. Při uvedení nového webu nesmazat hluboké odkazy Belchertownu: vytvořit mapu `/graphs/` → `/grafy`, `/records/` → `/rekordy`, `/reports/` → cílové `/statistiky` nebo funkční fallback; zachovat parametry rozsahu grafů podle validované mapy. Zajistit 301 až po staging verifikaci.

**Fáze 1+ (po MVP):** `/kamera` se snímky/archivem, `/senzory` + lightning/PM/půda/UV, `/klimatologie`, `/vystrahy` a `/predpoved`.

**Fáze 2:** timelapse, porovnání s okolními stanicemi (LuhaMet/ILOUKA4 s licencí a nadmořskou výškou), klimatologické heatmapy, export API a zobrazení revizí a provenience rekonstrukcí.

**Nezavádět najednou desítky prázdných položek.** Funkce, jejíž zdroj nebyl fyzicky potvrzen, může mít přípravu v backlogu, ale veřejná UI navigace nesmí ukazovat falešné aktivní funkcionality.

## 10. Konfliktní architektonický stav – nutné sjednotit

`main/docs/ARCHITECTURE_DECISION_2026-10-31.md` dnes **preferuje Node.js + Fastify + TypeScript**, ve stavu „navrženo“; starší `docs/frontend-audit-v1/ARCHITECTURE.md` a minulý benchmarkový ADR doporučovaly **Go**. Tato skutečnost nesmí zmizet v novém zadání. **Audit funkcí nevybírá runtime za uživatele.** Doporučení: definovat API kontrakt nezávislý na jazyku a pro jednoduchý staging PoC porovnat Node vs Go na skutečných produktových endpointoch (cache, downsampling, kamera metadata, live adaptér), pak provést jeden schválený ADR. Založením druhé služby kvůli malé výhodě RPS se neplýtvá, pokud není prokazatelně nutná.

## 11. Prioritizované akceptační kroky / backlog

| Pořadí | Práce | Výsledek / test |
|---|---|---|
| **P0** | Audit existujícího zdroje „Kamera západ“ | písemný interní záznam typu zdroje, obnovy, rozlišení, privacy a existujícího úložiště bez zveřejnění URL |
| **P0** | Ujasnit Windy iframe a licenční režim | lze doložit použití nebo vybrat legální fallback / link-out |
| **P0** | Potvrdit jeden ADR Node/Go a kontrakty API | nezávislé schéma response a validace, jednotná implementační pravda v main |
| **P0** | Staging homepage + grafy 24h, current, indikace data freshness | mobil/desktop, žádné falešné live, null, timestamp a offline fallback |
| **P0** | Karta kamery latest | status capture, datum pořízení, failover, žádný přímý privátní URL/token v HTML |
| **P0** | Audit nekvalitních rekordů před zobrazením | suspect/coverage/QC nepropustí ověřeně pochybný údaj jako nový validovaný rekord |
| **P1** | Kamera archiv 5min, denní timelapse, storage/retention quota | 30denní navigace, chybějící framy, overnight transcode, privacy deletion |
| **P1** | MQTT vs archive live kontrakt | broker metrics, reconnect/backpressure, konzistentní čas měření |
| **P1** | ČHMÚ CAP / Open-Meteo integrace s attribution | aktualizace, platnost oblasti, licence, stale/offline stavy |
| **P1** | Půda/PM2.5/blesky/UV a sensor mapping | datum/epoch, význam/units/null, žádné vymyšlené hloubky |
| **P1** | Převzetí deep linků starého webu a SEO | mapování `/graphs/`, `/records/`, `/reports/`, mobilní/keyboard testy |
| **P2** | Dlouhá historie a klimatologie | L2 `archive_day_*`, heatmapy, úplnost, prokazatelně validované rekordy |
| **P2** | Test PWA/offline/favorites | chytré cache invalidation a transparentní offline režim |

### Release gate před nahrazením Belchertown
- [ ] Reálná živá data a samostatná 5min data správně označena; v případě výpadku se neukáže falešná nula.
- [ ] Kamera má potvrzený zdroj a privacy mask, oddělené `captured_at` a `published_at`, zvládá offline bez blokování homepage.
- [ ] Radar/externí widget má právně ověřené podmínky; forecast/alerts mají jasnou licenci a attribution.
- [ ] Historické statistiky a rekordy mají QC a coverage; konkrétní známé extrémy nebyly bez ověření automaticky převzaty.
- [ ] Test mobilního grafu a kamerového náhledu, WCAG 2.2 AA, LCP/CLS/INP profil.
- [ ] Test DST, dlouhého výpadku, kompletního selhání MariaDB, kamery a externích zdrojů, žádné chybné 404/500 řetězení.
- [ ] Staging, rollback a monitorování camera freshness/cache, MQTT stavu, SQL poolu, CDN/Nginx 404 a diskové retence.
- [ ] Žádný build/deploy prod, změny či DDL v produkční DB v rámci tohoto auditu.

## Zdroje

**Vlastní projekt:** `main/docs/PROJECT_CONTEXT.md`, `main/docs/ARCHITECTURE_DECISION_2026-10-31.md`, `main/docs/MATOMO_AUDIT_2026-10-31.md`, `docs/frontend-audit-v1/FRONTEND_SPEC.md`, `docs/frontend-audit-v1/DECISIONS.md`, `docs/frontend-audit-v1/WEEWX_DAILY_SUMMARIES_AUDIT.md`.

**Externí, stav k datu auditu:** 
- Live veřejný web: https://pocasi-loucka.eu/ , https://pocasi-loucka.eu/records/ .
- Windy widget terms: https://account.windy.com/agreements/windy-terms-of-use .
- Open-Meteo terms: https://open-meteo.com/en/terms .
- ČHMÚ SIVS/CAP: https://www.chmi.cz/predpoved-pocasi/system-integrovane-vystrazne-sluzby .
- ÚOOÚ k kamerám: https://uoou.gov.cz/verejnost/qa-otazky-a-odpovedi/kamerove-systemy .
- OWASP SSRF guidance: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html .
- WCAG 2.2: https://www.w3.org/TR/WCAG22/ .

**Limity auditu:** neproběhla kontrola samotného obrazového záznamu kamery, interní konfigurace Belchertown/WeeWX, Nginx upstreamu ani reálných provozních souborů. Neexistující frontend nemá UI screenshoty, automatické E2E testy ani produkční lighthouse výsledky. Popisuje se návrh a skutečně ověřené externí zdroje, nikoli nasazená funkcionalita.
