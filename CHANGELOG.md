# Changelog

## 2026-11-28 – Validace aktuálních a historických odpovědí
- #206 sloučen jako `6e95cc9` po 231/231 MariaDB a 167/167 frontend + Chromium. Aktuální a historický klient ověřuje časové značky, konečné numerické hodnoty, kvalitu včetně skutečných stavů `sensor_error`/`unverified`, provenance a revizi; odmítá neplatné nebo neodpovídající rozlišení, bez nahrazování chybějících hodnot nulami. Testy kontraktu a realistické browser fixtures. CI/DEV pending, bez zásahu do SQL/dat.

## 2026-11-28 – Integrace kalendáře a modelu grafu
- Exact DEV #204 `d61cc68` 46167913348 (scheduled run, stabilní SHA před/po) PASS: grafy i senzory CLS 0, slow4G 3/3 medián 2320 ms. Původní push smoke byl zrušen souběžným scheduled během. #203 231/231 MariaDB a 164/164 frontend + Chromium PASS (46167869865/46167869867); #205 165/165 + Chromium PASS (46168021107). Integrované CI/DEV ověřit samostatně.

## 2026-11-28 – Ověření stabilizace a CSS
- #204 sloučen `d61cc68` po 162/162 testech a CSSOM potvrzení 4/15 tras s kompasem, 11/15 bez. Exact DEV #202 `7efde45` 46166974447 PASS: grafy CLS 0,1435 → 0, senzory 0,1061 → 0,026; slow4G 3/3 medián 2536 ms (lab). #203 první CI 163/163 unit PASS, browser odhalil chybějící denní pokrytí; oprava a nové CI v tomto PR.

## 2026-11-28 – Validace statistického kontraktu frontendu
- #202 sloučen `7efde45` po společném CI 46149223241 (161/161 + Chromium; 6 shodných geometrií). #200 exact DEV `5558396` 46149065666 PASS, rain 284/284, live/failover PASS, slow4G 3/3 medián 2600 ms (lab).
- Frontend odmítá neplatné statistické agregace, kvalitu, completeness a neověřenou coverage; skutečná nula, NULL a count=0 zůstávají rozdílné. Ověřuje duration basis/scope a původní toleranci 1 %. Test fixture kalendáře odpovídá backendu; přímé negativní testy. Bez změn backendu, SQL či zdrojových dat. CI/DEV ověřit samostatně.
- Regrese kalendáře odhalila nesoulad: API poskytovalo timeCoverage pouze ročnímu průměru, kalendář ji vyžadoval pro denní extrémy a srážky. Doplněno pouze pro outTemp min/max a rain sum z existujícího sumtime, skutečná délka dne 23/24/25 h, neznámé/překročené pokrytí NULL. Zůstávají QC brány, beze změny zdrojových dat nebo SQL. Kalendář výslovně rozlišuje evidované pokrytí od nezávislé validace. Testy skutečných API odpovědí + browser fixture.


## 2026-11-28 – Refaktoring historického grafu
- `history-chart-model.ts` odděluje čisté převody bodů, kvalitu, HTML escaping a jednoprůchodový souhrn minim/maxim a počtů. Bez změn zdrojových hodnot; neznámá kvalita se nezobrazuje jako platná. Abortovaný požadavek nesmí přepsat CSV/tabulku/tooltip po novějším výběru; nejprve ověření signálu, potom publikace. Chybový stav vyprázdní výsledky. Přímé testy nul, NULL, nekonečných/nesprávných hodnot, 150 tis. bodů a escapingu; stávající browser regrese. CI/DEV ověřit samostatně.

## 2026-11-28 – Komponentový CSS kompasu
- Přesun importu `wind-compass-v2.css` z BaseLayout do WindCompass.astro, bez změny pravidel CSS. Kompas se používá na přehledu, aliasu, klasickém přehledu a aktuálních údajích. Ostatní trasy nemají načítat cca 8,1 kB zdrojového CSS kompasu. Kontrola skutečně emitovaných CSSOM pravidel a tokenů na 15 trasách, stávající vizuální wind regrese zůstává. CI/DEV a velikost přenosu ověřit samostatně; bez změny dat.

## 2026-11-28 – Integrace frontendových refaktorů
- #200 sloučen `5558396` po 230/230 izolovaných MariaDB testech (46148573697); #198 exact DEV `1d9cadf` 46148520993 PASS, rain 284/284, live/failover PASS, slow4G 3/3 medián 2576 ms (lab). #199 samostatný frontend CI 46148626617 PASS (161/161), #201 CI 46148792514 PASS (155/155 a shodné sledované souřadnice před/po načtení v 6 viewport/theme kombinacích). Integrované CI a přesné DEV ověřit samostatně.

## 2026-11-28 – Sdílený lifecycle frontendových požadavků
- `concurrent-request.ts` vyčleňuje sdílení souběžného GET, individuální rušení, invalidaci a bezpečné uvolnění po chybě. Aktuální archivní GET zachovává veřejné rozhraní a validaci; žádná persistentní cache ani změna retry. Šest runtime testů skutečného modulu doplňuje stávající browser regrese. CI/DEV ověřit samostatně.

## 2026-11-28 – Kandidát stabilizace grafů a senzorů
- #152: místní responzivní prostor pro stav a souhrn podrobného grafu a stabilní sloupce senzorového adresáře. Bez změny dat, ořezávání textu nebo nového API. Chromium zadrží fixture odpověď a porovná souřadnice před/po načtení na 320/390/1440 v obou motivech; ověří 0 vs pomlčku. CI a skutečný CLS efekt ověřit samostatně.

## 2026-11-28 – Dokončení modularizace HTTP backendu
- #198 sloučen jako `1d9cadf` po opravení flakiness testu dynamického času kamery (bez změny API), 229/229 izolovaná MariaDB (46148381270). Exact DEV #197 `b0addaa` 46147114917 PASS, rain 284/284, live/failover PASS, slow4G 3/3 medián FCP/LCP kandidáta 2520 ms (lab).
- `observation-routes.ts` vyčleňuje live SSE, current a original QC. Zachovány schémata, limity, revision gate, replay, heartbeat a preClose drain per instance; `app.ts` je composition root. Přímý test shody current/QC, ETag, SQL parametrů a vypnutého SSE doplňuje existující stream integrační testy. CI/DEV ověřit samostatně, žádné změny dat/produkce.

## 2026-11-28 – Modularizace statistických a staničních endpointů
- #197 sloučen jako `b0addaa` po 227/227 testech izolované MariaDB (46144785988). Exact DEV #196 `439d896` smoke 46144700124 PASS, srážky 284/283 intervalů desktop/mobil, live/failover PASS, slow4G 3/3 medián FCP/LCP kandidáta 2588 ms (lab).
- `statistics-routes.ts` a `station-routes.ts` přebírají existující statistiky, liveness/readiness, metadata, live/current, monitoring, senzory a stav kamery. Stejné pořadí registrace, původní hodiny a cache jednotlivých instancí, limity a QC. Typované request/reply ve statistikách. Přímé testy shody samostatné a složené registrace, ETag, DST/SQL limitů, izolace senzorové cache. Bez změn dat, SQL, HTTP kontraktů a produkce. CI/DEV nové revize ověřit samostatně.

## 2026-11-28 – Modularizace klimatologických endpointů
- #196 sloučen jako `439d896` po 226/226 testech v izolované MariaDB (46143952486). Exact DEV #195 `31f1377` smoke 46143872572 PASS; srážková historie 284/283 platných intervalů (desktop/mobil v rozdílném čase), live/failover PASS; slow4G 3/3 medián FCP/LCP kandidáta 2584 ms (lab, nikoli field).
- `climate-routes.ts` přebírá existující čtyři klimatologické endpointy včetně jejich instančních cache, limitů, fingerprintů a diagnostiky. Registrace na téže Fastify instanci, stejné pořadí, bez změn SQL či HTTP. Nová regrese ověřuje shodu odpovědí, ETag, souběžné sdílení cold load a izolaci cache mezi instancemi aplikace. CI/DEV nové revize ověřit samostatně. Bez zásahu do dat či produkce.

## 2026-11-28 – Modularizace HTTP historie a společného kontraktu
- #195 sloučen jako `31f1377` po 224/224 testech v izolované MariaDB (46142200319). Exact DEV #194 `92909da` public smoke 46142138481 PASS: 284 platných srážkových intervalů na desktopu/mobilu, live/failover PASS, slow4G 3/3 medián FCP/LCP kandidáta 2224 ms (lab, nikoli field ani prokázaná kauzalita refaktoringu).
- `history-route.ts` odděluje původní HTTP registraci historie, `http-contract.ts` sdílí query schema, ETag, error a agregační policy. Zachovány URL, registrace na stejném Fastify instance, SQL, limity, revision gate a formát odpovědi; explicitní typ bodů a Fastify request/reply místo any. Test samostatné registrace vs. aplikace, ETag 304, validace a nepřítomnost DB čtení při odmítnutí požadavku. CI/DEV nové revize ověřit samostatně. Bez zásahu do produkce a dat.

## 2026-11-28 – Refaktoring denních statistik API
- #194 sloučen jako `92909da` po 219/219 izolovaných MariaDB testů (46136974838). Exact DEV #192 `1ae2199` public smoke 46136921592 PASS, srážky 284 platných intervalů na desktopu i mobilu, live/failover PASS; slow4G 3/3, medián FCP/LCP kandidáta 2332 ms (lab, nikoli field ani důkaz kauzality refaktoringu).
- Odděleny stávající denní agregace a tvorba denních bodů do `daily-statistics.ts`, explicitní typ namísto `any[]`. Přímé testy časově váženého průměru, nulových srážek vs. NULL, extrémů, směru větru, DST a odmítnutí neplatných souhrnů. Beze změny výpočtů, dat, HTTP, SQL a produkce. CI/DEV nové revize ověřit samostatně.

## 2026-11-28 – Refaktoring časových hranic API
- PR #192 sloučen jako `1ae2199` po API/MariaDB CI 46136304168 (215/215 v izolované MariaDB). Veřejný smoke předchozího #191 na `cfb6711` 46136211605 PASS; mobilní CLS kalendář 0,1748 → 0,0004 a stav služeb 0,1604 → 0; grafy 0,1435 a senzory 0,1061 zůstávají. Slow4G 3/3, medián FCP/LCP kandidáta 2572 ms. Jde o lab, nikoli field.
- Nový `calendar-time.ts` soustřeďuje RFC3339 validaci, převody Europe/Prague, hranice hodin/dnů a původní omezenou cache půlnocí; algoritmy a rozsahy nezměněny. Přímé testy neplatných dat, offsetů, přestupného roku, 23/25h dnů a hranice (start,end]. CI/DEV nové revize ověřit samostatně. Bez změn SQL, HTTP kontraktů, dat a produkce.

## 2026-11-28 – Refaktoring archivních bodů a agregací API
- Oddělen výpočet raw/hourly historie, validace metadat a streaming seskupování překryvů z `app.ts` do typovaného modulu `archive-history.ts`. Beze změny HTTP kontraktu, SQL dotazů, výpočtů, pořadí a původu měření; explicitní typ archivního bodu nahrazuje `any[]` v těchto dvou výpočtech. Přímé offline testy porovnávají streaming s nezávislým referenčním algoritmem včetně kompakce, hraničních intervalů, skutečné nuly a bezpečných chyb. CI a DEV ověřit samostatně.

## 2026-11-28 – Stabilnější rozložení historického kalendáře a stavu služeb
- Opakovaný veřejný lab na `8760c23` (46133455708) ukázal mobilní CLS kalendáře 0,1748 a stavu služeb 0,1604; další kandidáti grafy 0,1435 a senzory 0,1061. Nejde o field p75.
- Kalendář a stav služeb rezervují responzivní prostor pro stavové štítky a výsledné texty; bez ořezávání textu, změn dat nebo API. Chromium fixture zadrží odpověď a porovná pozice před/po načtení na desktopu/mobilu v obou motivech. Veřejný smoke pasivně přidává povolené kategorie posunutých prvků (ne příčiny ani field CLS), bez dalších požadavků a bez DOM obsahu. Issue #152; CI a skutečný efekt DEV ověřit samostatně.

## 2026-11-28 – Ověřená obnova historických grafů a integrace oprav
- PR #188, commit `9b05527`: veřejný DEV smoke [46132945676](https://github.com/Boym323/Loucka_weather/actions/runs/46132945676) ověřil přesné nasazení, HTTP 200 pro raw teplotu, nárazy a srážky i hodinovou teplotu, 284 platných srážkových intervalů na obou viewports, 11 tras a GW3000/archiv failover PASS. Issue #183 uzavřeno; původní překryvy zůstávají k odbornému read-only posouzení v #80.
- PR #189 sloučen jako `8760c23`; všechny čtyři původní PR #182/#174/#172/#186 jsou sloučené. Integrační API/MariaDB [46133026036](https://github.com/Boym323/Loucka_weather/actions/runs/46133026036), frontend/Chromium [46133026052](https://github.com/Boym323/Loucka_weather/actions/runs/46133026052) a security [46133026015](https://github.com/Boym323/Loucka_weather/actions/runs/46133026015) PASS, npm audit 0 zranitelností. Nová veřejná akceptace exact SHA `8760c23` [46133455708](https://github.com/Boym323/Loucka_weather/actions/runs/46133455708) PASS na přesném SHA: 284 platných srážkových intervalů na desktopu/mobilu, 11 tras, GW3000 live/failover; všechny post-merge API, frontend a security workflow PASS. Slow4G 3/3, medián FCP/LCP kandidáta 2588 ms (lab, nikoli field).
- Mobilní slow4G lab na `9b05527`: 3/3, medián FCP i LCP kandidáta 2612 ms; dva CSS soubory ~191574 CDP B bez potvrzené gzip/br komprese, další práce #152. H.264 dekódování #143 není prokázané, produkční readiness #69 a historická QC #80/#107/#111 zůstávají otevřené. Bez změn DB, originálního archivu a produkce.

## 2026-11-28 – Společný integrační kandidát zbývajících oprav
- Zachovány samostatné změny #182 (ČHMÚ), #174 (QC), #172 (Astro) a #186 (srážky) nad main s #188. Integrační CI musí ověřit kombinaci; veřejné nasazení ověřit samostatně. Bez zásahu do produkce a archivu.

## 2026-11-28 – Aktualizace výstrah ČHMÚ bez ztráty rozbalení a fokusu
- Shodná výstraha zachovává původní DOM a aktualizuje jen čas ověření. U změněné výstrahy se obnoví rozbalení a fokus podle jednoznačné kombinace události a časů platnosti; při odstranění výstrahy se fokus přesune na stavový prvek.
- Browser fixture ověřuje pravidelnou aktualizaci, změněné doporučení, aktivní extrémní výstrahu, ukončení a nedostupnost na přehledu a předpovědi. Issue #180; CI a DEV nasazení ověřit samostatně.
- Rozšířena browser regrese: skutečně vypršená výstraha zůstává v odpovědi, ale nesmí být vykreslena; po obnově a následném neověřeném stavu se fokus bezpečně přesune na stavový prvek. CI nové revize ověřit samostatně.

## 2026-11-28 – Zachování originální hodnoty při QC chybě senzoru
- API kvality (`/api/v1/quality/observations`) zachovává převedenou původní číselnou hodnotu v `measurementValue` i při `SENSOR_ERROR`; `displayValue` zůstává maskovaná, QC příznaky a nezpůsobilost pro extrémy se nemění. PR #174; původní izolované API/MariaDB CI prošlo, aktuální revizi ověřit znovu. Bez změn originálního archivu, agregací a schvalování rekonstrukcí.

## 2026-11-28 – Patch aktualizace Astro 7.4.13
- Kandidát PR #172 aktualizuje Astro 7.4.11 na 7.4.13 včetně lockfile. Předchozí frontend CI a dependency audit PASS, novou revizi ověřit samostatně. `picomatch` zůstává 4.0.7 (vnořená 2.3.2); GHSA-fc5q-39xc-vjpf bylo [oficiálně staženo 18. 11. 2026](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), protože nejde o bezpečnostní chybu. Audit 46132677882 PASS; issue #124 lze uzavřít na základě stažení advisory, nikoli změny verze. Bez vynuceného downgradu nebo potlačení bezpečnostního auditu.

## 2026-11-28 – Neznámý srážkový úhrn není nula
- Detail srážek při absenci všech platných intervalů uvádí, že úhrn nelze určit; skutečná naměřená nula zůstává 0,0 mm a při mezerách je označena neúplnost. Přidán Chromium scénář chybějící a podezřelé hodnoty versus skutečná nula. Issue #185; CI a DEV ověřit samostatně. Neřeší příčinu výpadku #183; bez změn meteorologických dat a API.

## 2026-11-28 – Izolace překrývajících se archivních intervalů
- DEV smoke 46132046210 na přesném SHA e799fda potvrdil HTTP 503 `overlapping_intervals` u raw teploty, nárazů, srážek i hourly teploty. Namísto výpadku celého grafu kandidát maskuje celé souvislé skupiny konfliktů jako explicitní `null` s původem `weewx-archive-overlapping-intervals`; dotčené hodinové souhrny včetně extrémů a počtů jsou nedostupné. Nepřekrývající se měření, skutečná nula, hranice intervalů a stávající fail-closed pravidla ostatních vad zůstávají zachovány.
- Doplněny testy zpětného dosahu delšího intervalu, hranice hodin a stránkování, skutečné nuly a neplatné konverze. Frontend vysvětluje vynechané konflikty. CI a skutečné nasazení ověřit zvlášť; bez opravy či zápisu archivu, změny denních agregací a výběru domněle správného záznamu.

## 2026-11-28 – Klasifikace výpadku archivních grafů
- Veřejný DEV smoke 46130015774 potvrdil na přesném SHA 3b22d66 HTTP 503 `Unsupported archived observation` u raw teploty, nárazů a srážek; hodinová teplota rovněž selhala, denní agregace HTTP 200. Stejné selhání doloženo již před #181 (27. 11.).
- API rozlišuje bezpečnými pevnými chybovými zprávami neplatný timestamp, interval, jednotky, překryv, pořadí a konverzi; HTTP 503 a fail-closed validace zůstávají zachovány. Smoke rozpozná tyto kategorie bez dalších požadavků či zveřejnění řádků. Přidány raw/hourly regresní testy. Issue #183: přesný typ vady v reálném archivu dosud neověřen, CI a DEV ověřit samostatně. Bez změny zdrojových dat a výpočtů.

## 2026-11-28 – Diagnostika dostupnosti historických grafů na DEV
- Veřejný smoke loguje omezené HTTP stavy a povolené chybové kódy existujících history požadavků bez nových požadavků, URL nebo hodnot měření. Při selhání rozliší stav grafu a dostupnost SVG. Původní akceptační brány zůstávají nezměněné; issue #183, příčina výpadku zatím neověřena.

## 2026-11-28 – Stabilita živých údajů větru
- Větrný panel chrání čerstvé live hodnoty každé veličiny zvlášť před opožděnou archivní odpovědí i její chybou; archiv může doplnit ostatní údaje. Starší live událost nepřepíše novější a po vypršení živého režimu se obnoví archiv.
- Chromium scénář nové výchozí homepage pokrývá zpožděný úspěch i chybu archivu, nulovou rychlost, neplatný směr a návrat k platnému severu na mobilu/desktopu v obou motivech. Issue #179; CI a skutečné DEV nasazení ověřit samostatně. Bez změn zdrojových dat, API a produkce.

## 2026-11-27 – Vizuální hierarchie úvodní stránky
- Zpřehledněny rozestupy a úvodní pás; výstrahy mají kompaktnější podobu a navigace na širokých obrazovkách je čitelnější.
- Při neověřeném směru větru se skryje prázdný kompas, ale rychlost a nárazy zůstávají jako kompaktní měření včetně zdrojových štítků. Data ani výpočty se nemění.
- Opraveno zastaralé očekávání v přístupnostním testu: odpovídá aktuálnímu formátovači tabulky, který zachovává přesnost podle veličiny.
- Opraveno očekávání osy srážek v Chromium kontrole: přijímá nulu zobrazenou s českou desetinnou čárkou (`0,0`) a odmítá záporný začátek.
- Změna je připravena ve větvi `codex/portal-visual-polish-20261127`; CI a DEV náhled je nutné ověřit samostatně.


## 2026-11-25 – Jednotná přesnost grafů
- Formátování podle veličiny v historických, srážkových a klimatologických grafech, tooltipech, tabulkách a souhrnech; osy ECharts s minimálním krokem podle přesnosti. Teplota, tlak, vítr, srážky a UV na desetiny; vlhkost, směr a záření na celá čísla.
- Česká desetinná čárka, chybějící hodnoty zůstávají pomlčkou, odstranění záporné nuly. Bez zaokrouhlení zdrojových dat či výpočtů. Doplněny regresní testy; CI a nasazení ověřit samostatně.

## 2026-11-25 – Rychlý přehled bez roztříštěných měření
- Na homepage kompaktní rozbalitelný pruh výstrah s názvem, stupněm, platností a úplným zněním. Aktivní extrémní výstraha zůstává otevřená. Ostatní stránky zachovávají dosavadní režim.
- Vítr, nárazy, směr, denní minima/maxima/srážky a hodinové trendy seskupeny k aktuálnímu měření; bez dvojího zobrazování rychlosti a nárazů. Předpověď vedle měření, radar a kamera potom, historický graf přes celou šířku. Klasický přehled zachován.
- Doplněny kontroly pořadí, jedinečnosti větru a výšky výstrahy. CI a nasazení ověřit samostatně. Bez zásahu do DB, WeeWX a meteorologických výpočtů.

## 2026-11-25 – Sjednocení kandidáta s interaktivní mapou
- Zachovány všechny změny mapy z main. Opraven kontrast astronomického štítku v tmavém režimu a dotyková plocha metodiky klimatologického srovnání. Přepnutí vyžaduje zelené CI a následný veřejný smoke.

## 2026-11-25 – Vizuální audit kandidáta portálu
- Zkráceny mezery v panelu výstrah a mobilním záhlaví; na homepage je přesná hodinová tabulka rozbalitelná pod meteogramem. Na samostatné předpovědi zůstává otevřená.
- Opraveny tři zastaralé testovací kontrakty z přesunu klasického přehledu a rozšíření auditu z 15 na 18 tras. Doplněna funkční kontrola rozbalování tabulky a úplné výstrahy. PR stále vyžaduje zelené CI a potvrzené nasazení.

## 2026-11-25 – Kandidát přepnutí výchozího portálu
- Nový portál jako výchozí `/`, alias `/prehled-novy/` používá stejnou komponentu. Původní přehled je zachován na `/prehled-klasicky/` včetně plného mobilního režimu.
- Trendy přesunuty k větru, rychlé mobilní odkazy a úspornější karty. Nadcházející výstrahy na telefonu zobrazují nebezpečí, platnost a stručný popis; úplné doporučení v podrobnostech. Aktivní a extrémní výstrahy zachovávají doporučení přímo.
- Kandidát v samostatné větvi, bez DB nebo produkčních změn. Přepnutí až po průchodu CI; veřejný smoke po nasazení musí potvrdit nový commit.

## 2026-11-25 – Interaktivní radar a modelové vrstvy
- Posun mapy, zoom 5–9, návrat na Loučku; radar nad zoomem 7 pouze zvětšen (limit RainViewer). Vzorkovací mřížka se odvozuje z aktuálního výřezu a rozměrů, 9–35 modelových vzorků místo pevných souřadnic.
- Interpolovaná teplotní vrstva s legendou, směrové šipky větru, přístupný seznam vzorků a samostatné poslední archivní měření Loučky. Chybějící hodnoty nejsou interpolovány přes neplatné buňky. Po posunu se stará vrstva odstraní; nový model se načte na požádání kvůli limitům API.
- ČHMÚ okolní stanice zatím pouze odkaz na otevřená data; bez ověřeného collectoru nejsou vydávány za měření. Přidány geometrické a browser testy; CI a nasazení ověřit samostatně.

## 2026-11-25 – Čitelné modelové body na mapě
- Modelové značky jsou oddělené od transformovaného radarového podkladu; na široké mapě krátké hodnoty ve dvou řádcích, na menší mapě číslované body s detailem a přístupným seznamem všech hodnot.
- Zjednodušené vrstvy a odkaz na samostatnou předpověď. Radar a model nadále nezávislé, výchozí modelové vrstvy vypnuté.
- Přidán Chromium test s kontrolovanými modelovými údaji, pěti šířkami a oběma motivy. Výsledky CI a DEV nasazení ověřit samostatně.

## 2026-11-25 – Dotažení portálu podle nasazených screenshotů
- Kompaktnější blok výstrah, kontrastní nadpis, jednotky denních údajů vedle hodnot, desetinné srážky v modelu a odstranění záporné nuly u předpovědi.
- Opraven typ navigace po přesunu klimatologie do mobilního menu (předchozí CI TS2367). Nové testy a nasazení ověřit samostatně.

## 2026-11-25 – Trendy, meteogram, historický kalendář a navigace
- Archivní hodinové změny teploty a tlaku pouze ze dvou blízkých platných měření, grafický meteogram s oddělenými osami, propojení výstrah s kalendářními dny bez druhého požadavku na ČHMÚ.
- Srovnání měsíce, části sezóny a roku se shodnými dny starších let, nikoli klimatický normál; srážkové srovnání zatím nepřidáno kvůli známým omezením archivu. Historický kalendář s kontrolou pokrytí a odkazem na konkrétní den grafu.
- Přístup k předpovědi, radaru a kameře v hlavní navigaci; původní homepage zůstává výchozí do vizuálního ověření alternativy. Bez změn DB, WeeWX a produkce.

## 2026-11-25 – Alternativní portálový přehled
- Nová zkušební trasa `/prehled-novy/`, původní homepage zůstává výchozí. Měření a předpověď vedle sebe, radar a kamera, širší interaktivní graf, vítr a včerejší souhrn.
- Samostatná `/predpoved/` s hodinovou tabulkou Open-Meteo a stávajícími denními údaji. Klikatelné názvy veličin otevřou odpovídající historický graf. Včerejší statistiky pouze při doloženém pokrytí alespoň 90 %.
- Bez změny databáze, výpočtů, globální navigace nebo produkčního webu. Nové trasy zahrnuty do vizuálního QA; CI a nasazení ověřit samostatně.

## 2026-11-25 – Kompaktní záhlaví všech stránek
- Homepage: nadpis nejvýše 40 px na desktopu, nižší fotografické pozadí a odstraněný redundantní popisek; měření se posouvá výše. Kompaktní úvod na všech ostatních veřejných trasách včetně atlasu.
- Zkráceny úvodní texty při zachování informací o zdrojích a nejistotě dat; žádné změny měření.
- Opravena kontrola kontrastu CSS tokenů po chybě CI; přidány geometrické limity úvodů pro všech 15 tras, sedm šířek a oba motivy. Výsledky nové revize ověřit samostatně.

## 2026-11-25 – Mobilní přehled a klimatologická čitelnost
- Kompaktní mobilní homepage je výchozí; plný přehled zůstává dostupný a vítr i graf lze rozbalit klávesnicí či dotykem. Desktop zůstává beze změny rozložení.
- Sjednoceny plochy klimatologických grafů, tabulky, osy sezón, rozlišení omezených ročních bodů, jednotky historických hodnot a zkráceny nadbytečné texty.
- Browser testy ověřují rozbalení grafu, plnou variantu a kontrast základních textových tokenů. Výsledky nové revize a DEV nasazení ověřovat samostatně. Bez změn meteorologických výpočtů a DB.

## 2026-11-25 – Dotažení vizuálu po veřejném screenshot auditu
- Mobilní zkratka skutečných výstrah ČHMÚ nad měřením, bez nových požadavků na API; stav nedostupnosti nezaměňuje za bezpečí.
- Rekordní hodnoty s menší jednotkou na stejném řádku; kamera používá společný barevný token. Sezónní série mají samostatnou modrou barvu a přerušovanou druhou křivku i legendu.
- Zkrácená opakovaná označení živých hodnot, archivní a nejisté hodnoty zůstávají rozlišeny. Kompaktní režim zůstává volitelný.
- Kontroly a nasazení nového commitu ověřovat samostatně; bez zásahu do zdrojů meteorologických dat.

## 2026-11-25 – Sjednocení návštěvnického vizuálu
- Předpověď a radar před kontextovými kartami, méně výrazné stíny, dostupný odkaz na kompaktní mobilní variantu (výchozí rozložení větru a grafu zachováno).
- Jednotky půdy a ovzduší vedle hodnot, česká data rekordů, větší radar a graf, jedna mobilní navigace atlasu, rozlišení sezón a ročenka s jasným stavem načítání.
- Shodný zdroj měření bez opakovaných vizuálních štítků; výjimky zůstávají viditelné. Browser QA rozšířena na 15 tras, 7 šířek a oba motivy. Výsledky CI a skutečné nasazení ověřovat zvlášť. Bez změn DB, WeeWX a produkce.

## 2026-11-25 – Výstrahy ČHMÚ na DEV
- API odlišuje výslovná oznámení „Žádná výstraha…“ od skutečných výstrah, nevyřazuje samotnou závažnost Minor a nezobrazuje ukončené výstrahy. Neplatný snapshot není stav bez výstrah.
- Přehled má české časy a závažnosti, barevné rozlišení, stav platnosti, čitelný jednosloupcový layout a rozbalitelné originální znění. Přidány regresní testy API a frontendových formátovacích funkcí.
- Bez změny produkce, databáze a instalovaného collectoru; ověření nasazení vyžaduje DEV smoke.

## 2026-11-24 – Ověřený soukromý náhled historického tlaku
- Na DEV LXC byl ověřen SHA-256 finálního třívrstvého gzipu a vytvořen soukromý denní index s 1 697 621 záznamy. Náhled běží odděleně na loopbacku portu 3102 pod účtem `loucka`; bez veřejné proxy.
- Ověřeny chráněný Q1 2018, rozlišené vrstvy v říjnu 2018, zlom zdroje 26. 4. 2019 a absence regionální reference v roce 2026. Headless prohlížeč ověřil desktop i mobil.
- Bez změny produkčního webu, WeeWX, databází, veřejného API a oficiálních statistik. Hodnoty zůstávají neschválené.

## 2026-11-24 – Soukromý náhled rekonstrukce tlaku
- Přidán samostatný DEV náhled tří tlakových vrstev nad SHA-256 ověřeným snapshotem Meteo_audit #99. Omezené UTC výřezy, tři přepínače a tabulka, bez slučování vrstev.
- Import a HTTP proces jsou oddělené od veřejného API, MariaDB a WeeWX; původní implementační záznam předcházel ověření na DEV LXC, které zaznamenává následující položka.

## 2026-11-22 – Diagnostika komprese CSS na veřejném DEV
- Při dosavadních třech mobilních návštěvách test pouze anonymně počítá CSS odpovědi podle `Content-Encoding`, `Vary: Accept-Encoding` a jednoleté `immutable` cache. Neukládá jednotlivé URL ani citlivé hlavičky, nepřidává další požadavky a sám gzip/br nezapíná.
- Před převzetím výsledku se ověřuje skutečně nasazený commit; proxy může hlavičky upravovat. Bez ručního testu `nginx -t` a bezpečného rollbacku se nastavení Nginxu nemění.

## 2026-11-20 – Jednotky u hodnot a horizontální posuvník homepage
- Jednotky dnešního minima, maxima a srážek jsou vedle čísla, stejně jako jednotky ostatních hlavních měření; styly telefonu už je nevysouvají na samostatný řádek.
- Zúžený přesah celoplošné fotografie o šířku svislého posuvníku už nevytváří vodorovné rolování stránky.
- Bez změny hodnot, API, databáze nebo výpočtů.

## 2026-11-20 – Srozumitelnější texty pro návštěvníky
- Zkráceny opakované technické popisy na aktuálním počasí, klimatologii, výstrahách, radaru a měřeních půdy a ovzduší; interní názvy služeb a zkratek byly nahrazeny běžným jazykem.
- Podrobnosti o původu a omezeních historických údajů jsou dostupné po rozkliknutí. Upozornění na chybějící a předběžná data zůstávají zachována.
- Bez změny výpočtů, API, databáze, meteorologických dat a nasazení.

## 2026-11-19 – Oprava vyvážení desktopové observatoře podle uživatelského PDF
- Jednostránkový screenshot úvodu při 1328 px odhalil chybu: starší Atlas pravidlo pro historii mezi 761–1330 px vytlačilo kartu historických měření na celý samostatný řádek a kartu stanice osamoceně doleva; vpravo zůstávaly nevyužité plochy.
- V Evergreen homepage lokálně rušíme pouze `grid-column:1/-1` historické karty. Desktop ≥1271 px ukazuje čtyři přístroje v jednom řádku, tablet 761–1270 px ve dvou vyvážených dvojicích, mobil do 760 px zůstává pod sebou v původním pořadí.
- Chromium layout gate rozšířen na 5 tras × 320/390/1024/1328/1440 px × light/dark (50 kombinací) s kontrolou skutečných pozic a screenshotem celé homepage při 1328 px. Žádné změny API, meteorologických hodnot, WeeWX, DB ani produkce.

## 2026-11-19 – Finální vizuální sjednocení návštěvnických stránek
- Společný rytmus titulků a úvodních popisů na 15 trasách, čitelnější mobilní popisky a zdroje měření; jednotné dotykové cíle alespoň 44 px u grafů, kamerového ovládání a rozbalovacích částí.
- Téma zůstává založené na stávajících proměnných Atlas, obsah živých a archivních dat se nemění; úvodní stránka a klimatologické rozložení zůstávají stejné. Volitelná mobilní varianta `?mobile=compact` **není nastavena jako výchozí** bez uživatelského testu.
- Přidána samostatná krátká Chromium vizuální brána s 320/390/1440 px, světlem/tmou, popisky, navigací, textovým zvětšením a screenshoty bez osobních údajů. Z GitHub Actions byly odstraněny závislosti na apt mirroru `security.ubuntu.com` při instalaci prohlížeče, protože 19. 11. vracel HTTP 503. Nezaručuje to dostupnost CDN ani stav DEV.
- Původní meteorologické hodnoty, databáze, WeeWX a produkční web zůstávají beze změny. Skutečné iPhone/Safari/VoiceOver/TalkBack ověření je samostatná nepokrytá ruční kontrola.

## 2026-11-19 – Mobilní ECharts až při přiblížení k historickému grafu
- Na běžné homepage při mobilní šířce se objemná knihovna ECharts načítá až po skutečném vstupu grafu do viewportu (IntersectionObserver, spodní okraj −40 px), nejpozději po 3,5 s. Tím může uvolnit síť/CPU pro hlavní kamerový obrázek a měření.
- Na desktopu a specializovaných stránkách zůstává původní automatické vykreslení. U dobrovolně sbalené kompaktní varianty se skrytý graf nepřipravuje, dokud není zobrazen.
- Žádná změna výsledků historie, jednotek, mezery NULL/suspect, čtení API ani zdroje dat. Regresní browser test používá jen izolované syntetické API fixture a ověřuje autentické SVG a stav archivního měření po scrollu; panel ovládání se na úvodu záměrně nezobrazuje.
- Účinek na FCP/LCP musí potvrdit 3× veřejný DEV slow4G/CPU smoke a nové PageSpeed; tato implementace sama o sobě neprokazuje zrychlení. Produkce a databáze beze změn.



## 2026-11-19 – Návrh gzip pro fingerprintované soubory DEV Nginxu
- Konfigurace interního DEV Nginxu nově zapíná gzip **pouze** ve statické cestě `/_astro/` (CSS/JS/SVG nad 1024 B), s `Vary: Accept-Encoding`, úrovní 4 a dosavadní roční immutable cache; API, HTML, kamera, produkce a DB nedotčeny.
- Předchozí 3× cold mobile lab ukázal dva CSS requesty ~195 916 B přenosu a hlavní autentický JPEG ~110 736 B včetně CDP overhead; nutno po ručním ověření gzip proti stejnému profilu znovu změřit. Nezaměňovat přenos s přesnou velikostí zdroje.
- **Změna šablony se sama neaktivuje v běžící root-owned konfiguraci.** Provozní návod vysvětluje zálohu, `nginx -t`, kontrolu interních i veřejných HTTP hlaviček a explicitní rollback. Žádné automatické reloady ani produkční zásahy.

## 2026-11-19 – Velikost kamery a CSS z již běžících mobilních testů
- Do 3× slow-4G/CPU veřejného DEV smoke doplněno čtení **existujících** CDP odpovědí hlavního JPEG a vlastních CSS: přenesené bajty včetně HTTP overhead, stav odpovědi, typ obrázku, nativní rozměry, případná hodnota Content-Length, cache max-age/typ politiky a přítomnost ETag/Last-Modified.
- Jde jen o anonymní souhrny a kategorie. Neukládají se URL zdrojů, hlavičky jako text, obsah obrázků, IP, osobní údaje, hodnoty počasí ani identifikátory návštěvníků; nevytvářejí se žádné nové požadavky na server či DB.
- Test rozlišuje chybějící hlavičku od nuly. CDP `encodedDataLength` je orientační síťový přenos včetně overhead, nikoli přesná velikost samotného JPEG; jedna cold odpověď neprokazuje chování při znovunačtení.
- Získané hodnoty slouží jako podklad pro navazující malou optimalizaci; bez změny fotografie, API, archivů, produkce a WeeWX.

## 2026-11-19 – Styly úvodní meteorologické observatoře jen na úvodní stránce
- Dlouhá stránkově specifická sada `observatory-evergreen.css` (35 747 B nekomprimovaného zdrojového CSS) už není globálním importem `BaseLayout.astro`. Načítá se pouze z `src/pages/index.astro`, kde jsou všechny její prvky.
- Regresní Chromium test ověřuje skutečně aplikovaný CSS token na homepage a nepřítomnost této sady pravidel na `/aktualne/` po Astro build. Existující layout testy pokrývají 320–1440 px, světlé/tmavé barvy, grafy a kameru.
- Změna neodstraňuje žádné meteorologické hodnoty ani JS funkcionalitu. Přenesená velikost CSS a přínos k PageSpeed mobile LCP je nutné ověřit samostatně, nikoli vyvozovat z velikosti zdrojového souboru.

## 2026-11-19 – Syntetický test mobilu s pomalou sítí a procesorem
- Po PageSpeed Insights mobile 59/100 a LCP 8,6 s přidán k veřejnému DEV smoke dobrovolný, pouze laboratorní test úvodu: Chromium 390×844, síť 1,6 Mbit/s / RTT 150 ms, CPU zpomalený 4×, tři izolované návštěvy bez cache.
- Test vyžaduje skutečně nasazený `deployment.json` SHA a `readyz`, nesmí míchat revize. Ukládá jednotlivé FCP, kandidát LCP, dosud pozorované CLS, úspěšnost stažení hlavního snímku a anonymizované kategorie pomalých zdrojů; ukládá i medián tří běhů.
- Export pouze do GitHub Actions artefaktu `preview-screenshots/mobile-slow4g-lab.json`, ne do návštěvnického webu; bez URL požadavků, IP, počasí, osobních údajů či SQL. Jde o CDP aproximaci, nikoliv Lighthouse skóre, INP, p75 nebo návštěvnická Core Web Vitals. Zatím pouze informační, nikoliv blokující performance budget.

## 2026-11-19 – Klimatologické styly jen na klimatologických stránkách
- PageSpeed ukázal na DEV mobilu 59/100, FCP 5,1 s a LCP 8,6 s v simulované pomalé síti; uvádí 124 KiB nepoužitého CSS a render-blocking potenciál 870 ms. Jde o jednorázové laboratorní hodnoty, nikoli data návštěvníků.
- CSS `climate-atlas.css` (~18,8 kB před kompresí) se již nenačítá na všech trasách přes BaseLayout, ale jen na pěti stránkách klimatologického atlasu; sdílená pravidla pro tisk zůstávají v globálním přístupnostním CSS.
- Regresní testy střeží kompletní seznam atlasových tras, přítomnost lokálního importu a oddělení pravidel pro tisk. Úsporu v přenosu a LCP je potřeba teprve změřit na veřejném DEV ve zpomaleném režimu.

## 2026-11-19 – Volitelný test kompaktního mobilního přehledu
- Mobilní úvod může návštěvník porovnat s alternativou `/?mobile=compact` bez změny standardního zobrazení.
- Testovací varianta zmenšuje dekorativní kamerovou krajinu a ponechá vítr a historický graf dostupné pod nativním tlačítkem; hodnoty, varování, zdroj a rychlé odkazy jsou zachované.
- Testovací označení a návrat na běžnou verzi jsou viditelné jen v mobilní experimentální variantě; bez ukládání preferencí, analytics či dalších API požadavků.
- Izolovaný Chromium screenshot test ověřuje 320/390/1440 a oba motivy. Před výchozím přepnutím je nutné skutečné uživatelské porovnání; viz `docs/MOBILE_FIRSTFOLD_TRIAL_2026-11-19.md`.

## 2026-11-19 – První cílená optimalizace kritické cesty domovské stránky
- Po DEV laboratorním smoke `44488456029` (deployed `019623c`) byl externí kamerový obrázek mezi nejpomalejšími zdroji (~689 ms). Domovská stránka v záhlaví včas otevírá spojení k tomuto zdroji a přednačítá stejnou skutečnou fotografii jako prioritní obrázek; ostatní stránky nejsou dotčeny.
- Laboratorní report nově uvádí jen anonymní kategorii LCP kandidáta (obrázek, nadpis, text/kontejner, ostatní). Nezaznamenává URL, identitu návštěvníka, obsah snímku ani meteorologická data.
- Jde o hypotézu zrychlení, nikoli změřený přínos. Po merge nutný porovnávací DEV smoke a případné odstranění hintu, pokud se neprokáže přínos. Bez databáze, WeeWX či produkce.


## 2026-11-19 – Přesnější laboratorní diagnostika pomalého načítání
- Veřejný DEV prohlížečový smoke ukládá vedle TTFB/FCP také průběžného kandidáta LCP, dosud pozorované posuny rozložení, dlouhé úlohy a pět nejpomalejších kategorií zdrojů.
- Report obsahuje pouze kategorie same-origin/externí a časy. Nikdy URL, parametry, IP, tokeny ani samotná meteorologická měření; nepřidává se žádný požadavek pro běžného návštěvníka.
- Výslovně jde o jednotlivá laboratorní pozorování v headless Chromium, nikoli o field CWV nebo reprezentativní p75. Viz `docs/VISITOR_PERFORMANCE_AND_RELEASE_GATES_2026-11-17.md`.


## 2026-11-19 – Ovládání časové osy historického grafu také klávesnicí
- Podrobný historický graf umožňuje přiblížit, oddálit a obnovit celé období pomocí nativních tlačítek, nejen posuvníkem ECharts.
- Ovládání nevolá znovu API a nemění měřená data, rozlišení, časovou zónu ani kvalitu; při chybě/prázdném grafu jsou tlačítka vypnuta.
- Prohlížečový regresní test ověřuje Enter a mezerník na šířkách 320/390/1440 px ve světlém a tmavém motivu. Dokumentace: `docs/HISTORY_KEYBOARD_ZOOM_2026-11-19.md`.

## 2026-11-19 – Jednodušší mobilní navigace a přístupnější historické grafy
- Na telefonech již horní Menu neduplikuje spodní navigaci s panelem Více.
- Podrobný graf umožňuje otevřít tabulkovou alternativu přesně vrácených hodnot, kvality a zdroje bez dalšího API požadavku; CSV export zůstává.
- Časosběr používá skutečný archivní snímek pouze při shodném lokálním dni s videem; jinak zůstává bez náhledu. Jasné upozornění na provenienci snímků.
- Regresní prohlížečový test 320/390/1440 ve světlém/tmavém motivu, `docs/UX_ACCESSIBLE_HISTORY_CAMERA_2026-11-19.md`.


## 2026-11-19 – Rychlejší načítání aktuálních meteorologických údajů
- Aktuální archivní hodnoty se při souběžném načítání sdílí mezi panely; počáteční požadavek není třikrát odeslán do API.
- Rozlišení živé GW3000 a původní WeeWX zůstává zachované. Po změně archivního záznamu a při zániku live se data znovu načítají.
- Přerušení jedné komponenty nepoškodí ostatní; po dokončení se archivní odpověď neuchovává v nové cache.
- Prohlížečové regresní kontroly a snímky 320/390/1440 px light/dark, dokumentace v `docs/CURRENT_FETCH_COALESCING_2026-11-19.md`.


## 2026-11-18 – Zpřehlednění klimatologického atlasu
- Kapitoly Extrémy, Trendy, Srovnání sezón a Meteorologická ročenka se nově zobrazují před historickými rekordy, aby se návštěvník dostal rychleji k cíli.
- Výraznější nadpis, kompaktnější mobilní karty, sjednocená typografie, přístupný focus a zachované barvy obou motivů.
- Při chybě nebo prázdném výsledku zůstává krátká vysvětlující zpráva s možností opakovat načtení namísto čtyř prázdných hodnot.
- Zdroj dat, historické hodnoty, varování o předběžnosti a všechny meteorologické výpočty zůstávají nezměněné.
- Dokumentace: `docs/CLIMATE_VISUAL_POLISH_2026-11-18.md`.


## 2026-11-18 – Vizuální doladění přehledu, grafů a kamery
- Mobilní úvod ponechává skutečná měření dominantní a odděluje jejich přehled, denní souhrn, větrnou růžici a 24h graf do vzdušnějších karet.
- Grafy a související ovládací prvky mají sjednocenou typografii, popisky, stavy a přístupné ovládání. Chybějící záznamy nadále zůstávají mezerami, bez odhadů.
- Kamera nyní nabídne jasnou navigaci Aktuální pohled / Časosběr / Fotografie, časosběr před archivem snímků a na mobilu obě média před odbornými informacemi.
- Zachovány ovládací prvky přehrávání, stažení MP4, obnovování snímků, fullscreen a výběr dne. Provenience archivace versus pořízení snímku se nemění.
- Cílená barevná a responsivní vrstva `ui-refinement.css`, regresní testy a snímky před/po úpravách.


## 2026-11-18 – Follow-up audit UX: mobil, live měření a atlas
- Na mobilním úvodu jsou akce Předpověď / Radar / Kamera již pod aktuálními hodnotami, nikoliv až za historickým grafem.
- Platný živý stav měření není přepsán neúspěšným požadavkem na archiv, chybové/retry stavy zůstávají pravdivé.
- Aktivní položka Klima ve spodním docku funguje i v podkapitolách atlasu.
- Pokročilá klimatologie je rozdělena do tří nezávislých rozbalitelných sekcí, včetně bezpečných hlubokých odkazů.
- Vizuální screenshoty používají izolovaná validní testovací měření a nezaměňují je za data stanice.
- Dokumentace a regresní testy: `docs/UX_FOLLOWUP_FIXES_2026-11-18.md`. DEV konfigurace Nginx již obsahovala noindex; produkční DB, API ani WeeWX se nemění.


## 2026-11-18 – UX etapy: mobilní počasí, grafy a klimatologický atlas
- Jednotné označení posledních ověřených hodnot i po selhání aktualizace, bez doplňování nul nebo domnělých meteo dat.
- Historické grafy mají srozumitelný prázdný/chybový stav a volbu pro opakování načtení.
- Mobilní úvodní stránka přináší rychlé odkazy na předpověď, radar a kameru a řadí praktické informace před odborné karty. Kompaktnější graf zachovává skutečný archivní průběh.
- Atlas má nativní výběr kapitol na mobilu a rozbalitelné pokročilé analýzy s funkčními hlubokými odkazy.
- Nová cílená UX CSS vrstva a regresní testy, včetně odstranění 320px přetečení odkazu v nadpisu. Podrobnosti v `docs/UX_STAGES_2026-11-18.md`.
- Pouze DEV frontend: bez zásahů do MariaDB, WeeWX, kamerového kolektoru nebo produkce.


## 2026-11-18 – Audit návštěvnického UX, kamera a provozní úspory
- Opravené samostatné kotvy pro archiv a časosběr na stránce kamery, přístupnější ovládání nejnovějšího MP4 bez úplného reloadu náhledů.
- Stav externího JPEG již nepřepisuje dostupnost posledního archivního snímku; chyba zobrazení má náhradní text bez rozbitého obrázku.
- Galerie JPEG po vyčerpání fronty vypíná plánovač náhledů místo permanentního 450ms intervalu.
- Stránka stavu neprovádí pravidelné kontroly při skryté kartě a hlavička korektně uklízí časovač hodin při navigaci.
- Srozumitelnější návštěvnické texty a explicitní informace o UTC galerii proti místním časům videí.
- Nové regresní testy a veřejné smoke aserce; provozní/produkční brány a meteorologická databáze bez změn. Závěry a omezení v `docs/VISITOR_UX_CAMERA_AUDIT_2026-11-18.md`.


## 2026-11-18 – Průběžný dnešní časosběr (DEV kamera)
- Kamera nově sestavuje denní video podle kalendářního dne v Europe/Prague, správně i při přechodu zimního a letního času; po šesti různých JPEG jsou během dne vytvářeny průběžné verze nejvýše každých 15 minut (při desetiminutové archivaci přibližně každých 20 minut).
- Průběžné MP4 mají neměnná verzovaná jména, publikují se až po úspěšném převodu a zůstávají ještě několik hodin k dispozici pro rozběhnuté HTTP Range přehrávání. Po místní půlnoci vzniká jednou dokončené denní MP4.
- API a stránka kamery rozlišují průběžný a dokončený záznam; doplněny regresní testy pro místní hranice dne, DST, atomické zveřejnění a bezpečné přehrávání.
- **Pro aktivaci na DEV LXC je nezbytné ručně přeinstalovat root-owned kolektor** z main do /usr/local/libexec; samotná synchronizace webu jej neaktualizuje. Produkční meteorologická databáze, WeeWX a původní JPEG snímky se nemění.


## 2026-11-17 – Kamera: přehrávání MP4 časosběru a diagnostika
- HTTP `/api/v1/camera/timelapse/:file` podporuje standardní byte-range GET (206 + Content-Range / Accept-Ranges), začátek/konec souboru a suffix; neplatné/nepodporované rozsahy odmítá 416.
- Na stránce kamery se chyba přehrávání zobrazí návštěvníkovi a lze stáhnout příslušný MP4; seznam funguje pouze pro bezpečné publikované URL a netvrdí, že samotný index zaručuje přehratelnost.
- Sběrný skript zapisuje aktuální index JPEG i pokud FFmpeg při tvorbě timelapse selže, aniž by se tím zakryl nenulový exit sběrné systemd služby.
- API injekční testy pokrývají jednotlivé range, invalidní range, stream a chybějící MP4. Public dev smoke vyžaduje 206 jen pokud existuje video; bez videí neoznačuje skutečné přehrání za ověřené.
- Produkční WeeWX, MariaDB a archiv historických meteorologických dat zůstávají beze změny.


## 2026-11-17 – Diagnostika časových překryvů 25.–26. července 2026
- Čistě čtecí SQL nově lokalizuje jednotlivé překrývající se nebo nepokryté intervaly denních teplot, včetně okrajových mezer v místním 24h dni; původní naměřené hodnoty se nepublikují ani nemění.
- Podle ověřeného auditu činí překryvy 3120/1800 s a nepokrytý čas 720/0 s; přidány regresní testy intervalové aritmetiky a operátorský postup.

## 2026-11-17 – Historický graf úvodní stránky po načtení DOM
- Na hlavní stránce se vykreslovací knihovna ECharts pro posledních 24 hodin načítá samostatným dynamickým blokem až po DOMContentLoaded. Stránka již nemusí čekat na vykreslovací balíček před dokončením HTML parsování.
- Zachován skutečný archivní graf, barvy, kvalita bodů, ovládací prvky i fallback. Zrušení opožděné inicializace při výměně stránky; bezpečný text při chybě načítání knihovny.
- Veřejný dev smoke nově vyžaduje skutečně vykreslené SVG historického grafu, nestačí jen přítomnost prázdného kontejneru. Předchozí měření home DCL 2,79–2,95s / FCP 1,58–1,72s je výchozí vzorek, **ne důkaz očekávaného zrychlení**. Pozor: home je v průchodu první cold navigace, jiné stránky warm cache; tyto vzorky proto nejdou férově přímo srovnávat.
- Beze změn originálních meteorologických dat, API, databázových oprávnění, TLS, WeeWX nebo produkce.


## 2026-11-17 – Kontrola úplnosti původních denních souhrnů 2025
- Nový čtecí DEV nástroj vypíše konkrétní chybějící dny v archive_day_* bez přepisu dat; odděluje neexistující denní řádek, nulový počet vzorků a přebytek sumtime včetně 23/25hodinových dní.
- Doplněny izolované DST/časové regresní testy a provozní návod; sonda není automaticky spouštěná při deploymentu.

## 2026-11-17 – Diagnostika historických rekordů HTTP 503
- Provozní DEV měření vrací na endpointu historických rekordů 8/8 HTTP 503; nové čtecí ověření identifikuje selhání SQL, denních hranic či výpočtu bez úprav archivu.
- Sonda používá právě tři původní denní SELECT dotazy, bezpečné kódy chyb a žádné meteorologické hodnoty v logu; připraveny regresní testy.


## 2026-11-17 – Srozumitelnější klimatologie a půdní měření
- Hlavní vysvětlení u extrémů, trendů, sezón, ročenky a půdních čidel používají běžnou češtinu místo interních pojmů `QC`, `dataset original` a `forenzně schválené`.
- Informace o původních denních souhrnech, metodě Theil–Sen, neověřených historických záznamech a možnostech výpadků zůstávají dostupné po rozkliknutí. Varování před neúplností a chybami srážek se neztrácí.
- Revizní otisky ročenky přesunuty do rozbalovacích technických podrobností; kvalita dat zůstává uvedená také v samotné tištěné ročence.
- Jen texty a testy, bez změny výpočtů, API, MariaDB či produkčního webu.


## 2026-11-17 – Stabilní přechod mezi živými a archivními měřeními
- Panel aktuálního počasí ignoruje opožděné odpovědi starších souběžných archivních GET. Nová data a návrat ze živých měření už nemohou být přepsány starším dotazem.
- Při návratu k archivu se sjednotí stavové CSS třídy místo souběžných `ok`, `warning` a `error`.
- Offline Playwright test se zadrženou starší odpovědí ověřuje aktuální údaje na 320/390/1440 px. Bez simulovaných požadavků na skutečnou MariaDB a GW3000.
- Jen frontend a regresní testy, žádné zásahy do archivu ani do produkčního WeeWX.


## 2026-11-17 – Efektivnější roční/měsíční klimatologické indexy a opt-in časování
- Roční a měsíční skupiny souhrnného endpointu `/api/v1/climate/dashboard` vznikají jediným ověřeným průchodem denních řádků, nikoliv opakovaným formátováním všech dat pro každý graf. Výsledky původních agregací zůstávají stejné.
- Výslovné `WEATHER_API_PERF_LOG=YES` po cache miss zapíše anonymní čas SQL read fáze včetně čekání na pool, zpracování, počty denních řádků a RSS/heap. Žádné počasí, přístupové údaje ani identifikátory návštěvníků se nelogují.
- Izolované testy hlídají stejné výstupní hodnoty, jeden výkonový log po nové dávce a žádné logování bez opt-in.
- Jen API, testy a dokumentace; žádné změny MariaDB oprávnění, TLS, zdrojového archivu, WeeWX ani produkce.


## 2026-11-17 – Výslovná výjimka pro důvěryhodnou LAN v DB auditu
- Provozovatel potvrdil požadavek na komunikaci API a MariaDB výhradně v LAN bez povinného TLS. Auditní sonda nově přijímá příznak `--trusted-lan`; výchozí bezpečný režim nadále požaduje certifikátem ověřené TLS.
- Skutečný stav přenosu zůstává transparentní v `transportEncrypted`, `certificateVerified` a `warnings`; žádné vypnutí skutečné TLS konfigurace ani skryté označení nešifrované relace za šifrovanou.
- Nadbytečná zápisová práva do jiných schémat **zůstávají blokující**. Žádný SQL zápis, odstraňování grantů, změna databáze, WeeWX či produkce.


## 2026-11-17 – Veřejný dev smoke i po změně API (návrh PR)
- GitHub Actions ověřuje skutečně nasazený commit, grafy, klimatologii, GW3000 live a návrat k archivu nejen po změnách `frontend/**`, ale také po změnách `api/**` na `main`.
- Tím se uzavírá mezera, kdy změna Fastify mohla úspěšně projít izolovaným CI bez automatického veřejného prohlížečového testu aktuálně nasazeného API.
- Test zůstává read-only; žádné API, WeeWX, MariaDB, GW3000 ani produkční změny. Všechny runtime závěry dál závisí na skutečné synchronizaci dev LXC.


## 2026-11-17 – Čtecí prověrka TLS a oprávnění DEV databáze (návrh PR)
- Nová explicitně spouštěná staging-only sonda ověří skutečný `Ssl_cipher`, vyžádané ověřování DB certifikátu a SELECT-only přístup k cílovému archivu i klíčovým denním tabulkám.
- Nadbytečná zápisová práva v jiných schématech a aktivní role blokují produkční verdikt, aniž by zastavovaly veřejné čtení původních dat. Výstup nikdy nevypisuje credential, identitu účtu, adresu DB ani text grantů.
- Samostatné unit testy dokládají fail-closed TLS, zápisová práva a scope, ale reálné LXC spuštění stále čeká; automatický audit ani změny konfigurace se nedělají.
- Žádné SQL zápisy, změna Fastify runtime, MariaDB, produkčního WeeWX ani rekonstruovaných dat.


## 2026-11-17 – Regresní rozpočet požadavků klimatologie (PR)
- Veřejný dev test po optimalizaci #119 prokázal 10 API fetchů namísto 69 na desktopu i mobilu během úplného průchodu klimatologií (run #44148375636). Přidána trvalá kontrola nejvýše 20 fetchů a přesně jednoho souhrnného dashboard requestu; zachovává prostor pro krátké opakování požadavků.
- Jedná se o laboratorní počet požadavků, nikoli důkaz vyšší rychlosti zobrazení. Výsledky z návštěvnického počítače, studený SQL dotaz a provozní TLS zůstávají samostatnou prací.
- Jen read-only testy a dokumentace, žádný zásah do WeeWX, MariaDB, Fastify ani produkce.


## 2026-11-17 – Klimatologický přehled bez desítek jednotlivých API dotazů (PR)
- Nový read-only `/api/v1/climate/dashboard` sjednocuje roční, měsíční a extrémní klimatologické údaje z původních denních souhrnů WeeWX; provádí tři omezené SELECT dotazy místo 58+ samostatných HTTP statistických požadavků.
- Zachován shodný serverový výpočet průměrů s časovým vážením, jednotky, CET/CEST, skutečné nuly, chybějící období a označení předběžné kvality. Odmítnutí neexistujícího approved datasetu a kontrola mřížky.
- Frontend validuje celý přehled, jednotné API vrací ETag/304 a omezenou pětiminutovou cache; zachované přepínání roků. Izolované API a browser testy; veřejný dev provozní důkaz až po merge.
- Bez zásahu do `archive`, rekonstrukce a produkčního WeeWX; auto-sync může restartovat jen vývojové API.


## 2026-11-17 – Návštěvnický a mobilní audit webu (PR #118)
- Oprava veřejného testu živých měření a návratu k archivu na srozumitelné texty zavedené v PR #114. Zachována kontrola skutečného původu `gw3000_live`, čerstvosti a nenahrazení archivního deště.
- Přesun více než 58 statistických dotazů do odloženého načítání až při dosažení detailního klimatologického přehledu. Přímá navigace na graf i ruční změna roku stále fungují.
- Odpojování listenerů po přechodu mezi stránkami a ochrana před opožděným otevřením SSE. Mobilní ovládání rekordních dnů min. 44 px.
- A11y audit všech 15 stránek nově také na šířce 320 px, ve světlém a tmavém režimu. Dokumentovány skutečné výsledky dev smoke a nejistoty laboratorních časů.
- Jen frontend, testy a dokumentace; žádná změna MariaDB, API, WeeWX či produkce. Staging výsledek ověřit po merge podle komitu.


## 2026-11-17 – Měření načítání dev webu během vizuální kontroly (návrh PR)
- Stávající veřejný test dev webu zaznamenává pasivně navigační TTFB, DOMContentLoaded, First Contentful Paint a souhrn browser fetch požadavků API.
- Anonymní JSON report se ukládá do již používaného artefaktu `preview-screenshots`; nezachytává URL s parametry, meteo hodnoty ani údaje návštěvníků. Žádné další HTTP/SQL požadavky.
- Laboratorní měření nejsou reálné návštěvnické Web Vitals ani benchmark studené DB. Dokumentovány bezpečnostní podmínky a dosud nesplněné produkční brány.
- Bez změny API, přístupů, TLS, databází, produkčního WeeWX a bez produkčního nasazení.


## 2026-11-17 – Úvod klimatologického atlasu s historickými zajímavostmi (návrh PR)
- Nové čtyři stručné karty historických extrémů na rozcestníku klimatologie, načítané až při zobrazení sekce výhradně z původního veřejného API, bez náhradních či vymyšlených hodnot.
- Kontroly stavu `preliminary`, datasetu `original`, jednotek, data, numerických hodnot a původu. Známé srážkové anomálie jsou viditelně označené.
- Přímé odkazy na extrémy, sezóny, teploty všech roků a vlastní historické období. Mobilní rozložení a izolované unit/browser testy.
- Bez změny API, WeeWX, MariaDB, rekonstrukce nebo produkčního archivu. CI, merge a převzetí dev synchronizací ověřit zvlášť.

## 2026-11-17 – Přehlednější historické grafy a klimatologie (návrh PR)
- Rychlé volby historického grafu jsou přesné lokální kalendářní dny („Dnes“, „Včera“, „Letos“, „Minulý rok“); datumové posuny respektují hranice CET/CEST.
- Graf meziročních teplot začíná třemi nejnovějšími dokončenými roky místo všech křivek; všechny roky lze jedním kliknutím zapnout. Metodika zůstává dostupná rozbalením a upozornění na neúplné údaje viditelné.
- Opraven vizuální smoke pro předběžné rekordy po změně textů v PR #114 a doplněna kontrola skutečně vykreslené maximální teploty.
- Pouze frontend a testy: původní archiv, API, QC, rekonstrukce ani produkční WeeWX se nemění. Výsledek CI a nasazení nové větve ověřit samostatně.


## 2026-11-17 – Přístupnější texty veřejného webu
- Úvod, aktuální měření, grafy, senzory, rekordy i stav stanice používají srozumitelnější češtinu místo interních názvů databází, API a diagnostických zkratek.
- Odborné vysvětlení kvality měření zůstává v rozbalitelných podrobnostech; chybějící data a nejisté historické rekordy se nadále nezaměňují za ověřená měření.
- Identifikace GitHub commitu byla odebrána z běžné patičky, ale je k dispozici v rozbalitelné sekci O stanici.
- Bez změn meteorologických výpočtů, API, databází a produkčního WeeWX.


## 2026-11-17 – Volitelný ověřený TLS režim pro Fastify API
- Přidána konfigurace `WEATHER_DB_TLS_MODE=verify` a volitelná důvěryhodná CA z externího PEM souboru; ověřování certifikátu se nikdy nevypíná.
- Readiness při vyžádaném TLS ověřuje skutečný `Ssl_cipher` z databázové session. Chybná nebo nečitelná CA konfigurace selže uzavřeně.
- Přidány izolované testy nastavení a operátorský postup. TLS zůstává výchozí vypnuté, dokud není na dev LXC ověřen důvěryhodný serverový certifikát; produkční DB ani služby se nemění.


## 2026-11-17 – Obnovení historického API a kvality grafů
- Fastify kontrola read-only práv nyní vyhodnocuje pouze cílové produkční archivní schéma; nesouvisející oprávnění účtu na `loucka_reconstruction` již neshazují veřejné čtecí API.
- Historický graf zobrazuje počty měřených, odvozených, rekonstruovaných a chybějících bodů; tooltip uvádí kvalitu a původ vrácený API. NULL a podezřelé hodnoty zůstávají mezerami, nikoli nulami.
- Ověřeno na vývojovém LXC proti produkčnímu archivu pouze pro čtení: readiness, historie, denní a měsíční statistiky. Testy API a frontendu prošly; žádný databázový zápis ani produkční deploy.

## 2026-11-12 – Srážkový atlas a ochrana historických trendů
- Aktuální read-only porovnání originálu a rekonstrukce v 18 ročních oknech 2009–2026 do stejného cutoff. Úhrny se liší v pěti letech, zejména červenec 2021 (701,015 → 42,567 mm), pracovní nejvyšší roční a denní úhrny nejsou certifikované rekordy. 221 pending srážkových položek rozděleno podle skutečného aktuálního stavu; žádné nové opravy.
- Nová sekce `/klimatologie/trendy/#srazky-archiv`: měsíční původní úhrny, dny s deštěm/nulou, missing/suspect a známá rizika. Roční srážkový sklon vyžaduje i časové pokrytí ≥90 % a vynechá známé problematické roky; původní hodnoty zůstávají viditelné. Extrémy označí známé problematické srážkové dny.
- Syntetické unit/browser testy, pouze existující veřejné original endpointy. Žádná DB změna nebo publikace neschválených odhadů. Podrobnosti docs/RAIN_ARCHIVE_IMPACT_2026-11-12.md.

## 2026-11-12 – RH duben 2022: experimentální rozhodovací filtr Magnus
- Přímá SELECT-only kontrola na 4 752 původních RH trojicích (22 dní) včetně přísné skupiny 2 043 (MAE Magnus 1,82 vs WU 2,16 p. b.). Ze starých numerických odhadů 285 missing a 1 140 frozen splňují konzervativní pracovní filtr; při stejnodenních kontrolách nemá žádný missing odhad prioritu, 264 frozen jen k ruční revizi.
- Samostatný offline modul, reprodukovatelné omezené SELECT dotazy, testy a dokumentace. Bez automatického schválení, nové RH, DB zápisu, runtime změny nebo dalšího ročního skenu. Podrobnosti docs/QC_RH_APRIL_2022_MAGNUS_DECISION_2026-11-12.md.

## 2026-11-12 – Atlas: dostupnost historické vlhkosti
- Sekce `/klimatologie/trendy/#vlhkost-archiv` s volbou dokončeného roku, měsíčními počty dnů s původním RH souhrnem, chybějícími a podezřelými souhrny a samostatným časovým pokrytím z roční konsolidace. Výchozí 2022 s upozorněním na známé výpadky a dubnové zamrzlé čidlo.
- Pouze existující veřejné `dataset=original` denní a roční endpointy, načtení až na vyžádání. Neschválené rekonstrukce, privátní sidecar a databáze beze změny. Přestupné roky, DST, NULL, odmítnutí cizího původu a syntetické browser regresní testy. Podrobnosti docs/ATLAS_HUMIDITY_COVERAGE_2026-11-12.md.

## 2026-11-11 – celoroční RH 2022 technický read-only audit
- Nový operátorský `deploy/lxc/audit-rh-2022-year.py`: 73 navazujících 5denních oken, jeden omezený GET na okno přes izolovaný sidecar 127.0.0.1:3101, záměrná prodleva >=1,5 s, žádná DB/HTTP mutace ani restart. Kontrola všech 105 119 dostupných UTC 5min slotů 2022 (první časová hranice není dostupná přes existující API).
- Souhrny po měsících a dnech, skutečně chybějící celé řádky vs. existující NULL RH, auditní dávky, 5min skoky včetně hranic oken, a striktní celoroční kontrola všech 5 153 historických změn proti pinovanému JSON. Soukromý root-only report vznikne pouze při kompletním průchodu; výsledky z LXC teprve ověřit.
- Syntetické offline testy, CI a návazný plán nezávislé meteorologické kontroly. Všechna RH zůstávají neschválená a originální archiv nedotčený.

## 2026-11-11 – read-only QC kontrola RH 2022 z privátního sidecaru
- Nový lokální Python 3 audit v deploy/lxc/audit-rh-preview.py: jeden omezený autentizovaný HTTP GET proti 127.0.0.1:3101, bezpečné zpracování časové mřížky (from,to], oddělené počty celých chybějících slotů a existujících RH NULL, 3 typy historických zásahů, auditní dávky a pouze orientační skoky RH ≥20 p. b./5 min.
- Soukromý JSON report (root-only 0700/0600), přístupový token zůstává v paměti a nikdy se neloguje. Žádná změna API, databází, systemd, Nginx či veřejného webu; automatické spouštění není aktivováno.
- Přidány offline syntetické unit testy a operátorský návod; skutečný LXC QC výsledek tímto commitem ještě nebyl ověřen. Experimentální odhady zůstávají neschválené.

## 2026-11-11 – izolovaný operátorský náhled RH 2022 na localhost 3101
- Připraven vlastní Fastify sidecar bez archivního polling observeru a GW3000 collectorů, s explicitním allowlistem `WEATHER_DB_SCHEMA=pocasi-loucka.eu`, `HOST=127.0.0.1`, `PORT=3101` a opt-in zámky. Nemění API procesu `main.ts` na 3100 ani Nginx.
- Soukromý operátorský HTML/JS/Canvas graf umožňuje srovnávat původní a experimentálně rekonstruované RH 2022, třídí odhady vs. zneplatnění, ukazuje provenance a žádná chybějící data nenahrazuje nulou. Bearer token pouze v paměti prohlížeče, CSP, no-store, žádné externí assety.
- Přidána samostatná systemd unit a explicitní root instalátor se SHA-256 integritou již ověřeného JSON, náhodným tokenem, automatickou kontrolou 401/200 a vypnutím při neúspěšném smoke testu. Nic se neinstaluje ani nezapíná samotným merge commitem; originální archiv zůstává SELECT-only.
- Přidány TS integrační testy na izolaci, protokol, CSP, token, 404 v původní API a syntaxi JS. Skutečný dev runtime ani nasazení nejsou samotným PR prokázány.


## 2026-11-11 – oprava exportu RH dev preview podle skutečné QC konfigurace
- Po úspěšném `--dry-run` na LXC selhal `--export` s potlačenou chybou: exportér chybně očekával `WEATHER_DB_*` (produkční API), ale `qc.env` dodává `WEATHER_QC_DB_*` (QC role).
- Opraveno použití správné QC credential sady; možné explicitně vybrat izolovanou `WEATHER_RH_EXPORT_DB_*` SELECT-only identitu, pokud běžný QC uživatel nemá nové tabulky. Nikdy neslučovat přístupové údaje z různých identit.
- Nový `--check` testuje pouze `SHOW GRANTS` a omezené `SELECT 1 LIMIT 1` nad třemi tabulkami, bez čtení RH či zápisů. Všechna chybová hlášení jsou bezpečně kódovaná bez zobrazení tajemství.
- Neproveden žádný DB GRANT/UPDATE/INSERT, export ani produkční/dev deployment. Před publikováním experimentální RH nadále platí izolace dev, SHA256, auth a rollback.


## 2026-11-11 – volitelný chráněný dev RH náhled nad neměnným exportem
- Připraven explicitně opt-in privátní HTTP endpoint pro RH 2022: originál a starší experimentální odhad odděleně, raw pouze max. 7 dní / 2000 bodů, kontrola pinovaného SHA256 a historických změn.
- Bez `WEATHER_DEV_PREVIEW_ENABLED=YES` route neexistuje. Se zapnutým náhledem vyžaduje izolovaný režim, soukromý soubor, bearer token a fail-closed konzistenci původního archivu; `Cache-Control: no-store`.
- Žádný aktivovaný deploy, změna `api.env`, SQL mutace nebo zveřejnění neschválených historických hodnot. `dataset=approved` a původní /history se nemění.


## 2026-11-11 – versionovaný archivní balíček RH 2022 pro budoucí dev náhled
- Ověřeno přímo z read-only DB: 5153 unikátních starých `applied` změn RH na 35 dávkách; 2874 původně NULL → starší experimentální odhad, 2194 podezřelých původních RH → experimentální náhrada, 85 původních RH → NULL v rekonstrukční kopii; 0 nesouladů mezi auditními old/new a oběma archive tabulkami.
- Implementován zcela read-only export a čistá validace původu, se soukromým obsahem a dvojitým SHA256, přísným omezením 5153 záznamů a zákazem přepisu již exportovaného balíčku.
- Žádná databázová migrace, žádný import do dev, žádná aktivace preview, žádný zásah do původního archive. Navazující dev overlay/rollback vyžaduje nejprve nezávislé ověření skutečné konfigurace a izolace dev od produkce.


## 2026-11-11 – provenance existujících RH změn 2022 podle rekonstrukčního auditu
- Přímé read-only dohledání 1 575 již aplikovaných březnových a červencových RH odhadů v `reconstruction_changes`; všech 1 575 mělo původní RH NULL, rekonstrukční hodnota odpovídá auditnímu `new_value`, žádné chybějící časové řádky.
- Úplná účetní rekonciliace 2022: 2 874 původně NULL → odhad, 2 194 podezřelých původních RH → jiná hodnota, 85 zneplatněno; rekonstrukční kopie má 41 727 RH NULL, originál 44 516. Dřívější modelové holdout výroky v textu auditu nejsou automaticky reprodukovanou nezávislou validací.
- Nový read-only SQL podklad a dokumentace provenance pro meteorologický atlas; žádné nové odhady, zápisy do DB, schválení oprav nebo produkční nasazení.


## 2026-11-11 – audit původu a rizika existujících dubnových RH návrhů
- Autonomní přímý SELECT-only audit všech 3 734 `reconstruction_humidity_202204` návrhů vůči původnímu archivu: 0 nesouladů originálních RH/teplot nebo chybějících originálních řádků.
- Zamrzlé RH čidlo: 2 279 původních RH v devíti odlišných hodnotách, sekvence přes 39 hodin. Tyto hodnoty nejsou nezávislou pravdou pro trénování modelu.
- U 1 299 starších odhadů pro chybějící RH: 852 pouze předběžná shoda referencí, 384 rozpor 10–20 p. b., 54 rozpor nad 20 p. b., 9 odhadů mimo referenční rozpětí o více než 10 p. b.; žádné odhady nejsou schválené.
- Přidán čistý rizikový klasifikátor s fail-closed původním časem, RH, teplotou a jednotkami, čtyři reprodukovatelné SELECT-only dotazy a testy správného UTC denního řazení.
- Žádné změny produkční ani rekonstrukční databáze, staging stavů nebo veřejného webu.


## 2026-11-11 – omezení falešně pozitivních záloh a Proxmox host metadata audit
- Po LXC kontrole 6/6 souborových kandidátů potvrzeno pět vývojových schémat/testovacích JSON a jeden pravděpodobně systémový Debian alternatives TAR, bez nové nezávislé RH série pro leden–červen 2022.
- Zpřesněn metadata-only LXC backup scanner: vynechává aplikací generované schemas/test/fixtures a známé systémové Debian zálohy; testy hlídají zachování skutečných názvů WeeWX dumpů.
- Přidán nezávislý, neinvazivní Proxmox VE host skript vypisující pouze `pct list` a `pvesm` backup metadata pro identifikaci původního loggeru, VMID a zálohovací storage; žádná obnova kontejneru, žádná extrakce/SQL ani změny produkce.


## 2026-11-11 – omezené čtecí rozpoznání šesti možných záloh RH 2022
- LXC metadata inventura: 39 prošlých adresářů, 176 položek, 6 kandidátů bez roku 2022 v názvu, stav partial kvůli chybějícím kořenům /var/lib/weewx a /etc/weewx. Žádné SQL ani zápisy.
- Nová opt-in signatura kandidátů z privátní inventury: maximálně 512 bajtů z každého souboru, O_RDONLY a O_NOFOLLOW, kontrola neměnného inode/size/mtime, bezpečnost před symlink/mountpoint, jen indikace formátu SQLite/SQL/komprese; žádná extrakce, propojení k DB nebo kopie obsahu.
- Soukromý 0600 JSON, testy bezpečnostních hranic, neznámé a změněné soubory odmítány. Bez rekonstrukce RH.


## 2026-11-11 – čtecí inventura RH archivních alternativ a hledání lokálních záloh
- Přímé SELECT-only porovnání historických databází 2022: GW1000 RH identické s původním archivem; stará databáze má 7 navíc RH na existujících původních NULL řádcích a 123 dalších časů pouze v srpnu–říjnu; rekonstrukční schema obsahuje dříve změněnou RH a nesmí se vydávat za nezávislý originál.
- Soukromý metadata-only CLI pro LXC s omezením na výslovně zadané kořenové adresáře, maximální hloubku a počet záznamů; žádné čtení obsahu záloh, procházení symlinků, MariaDB připojení, zápis původních dat ani schvalování RH.
- Testy bezpečného ukládání 0600, falešných/nezvěstných kořenů, symlinků, mezí skenování a reprodukovatelného lokálního výstupu.


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
