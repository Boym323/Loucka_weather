# Počasí Loučka – testovací Astro frontend

**Aktuální vývoj: 1. 11. 2026.** Web vzniká podle uživatelem schváleného devítipanelového tmavého vizuálního návrhu. Testovací náhled: https://dev.pocasi-loucka.eu/. Není to veřejná produkce. Všechny změny do main se sestavují a nasazují přes LXC automaticky; přesná zveřejněná revize je vidět ve webové patičce a v /deployment.json.

## Příkazy a nasazení

Použij Node.js 24. Pro lokální vývoj:

    cd frontend
    npm ci
    npm run check
    npm test
    npm run build
    npm run dev

Služby LXC, atomické vydávání, časovač a Nginx jsou v [deploy/lxc/README.md](../deploy/lxc/README.md). Skript je read-only vůči produkční WeeWX MariaDB. Pro nasazení nejsou potřebné ruční restarty.

## Funkční moduly na testovacím webu

- **Přehled:** fotografie ze západní webkamery; meteorologické karty z Fastify /api/v1/current (poslední archivní měření), kompaktní historie z /api/v1/history, šesti­denní **modelová** předpověď Open-Meteo, RainViewer historické radarové snímky nad OpenStreetMap, informace o posledním zveřejněném commitu.
- **Aktuálně:** podrobné metriky GW3000/WeeWX, větrná růžice z archivního windDir, graf nárazů větru, doplňková data a přehled dalších **archivních kanálů** (bez neověřeného fyzického mapování).
- **Grafy:** ECharts s volbou teploty, vlhkosti, tlaku, rychlosti/nárazů větru a intenzity srážek, období 6/24/72 hodin. Samostatný sloupcový graf **intervalových srážek**, tabulka archivních intervalů.
- **Klimatologie:** plně responzivní vizuální šablona podle návrhu. Denní/měsíční/roční souhrny a ověřené extrémy **ještě nejsou připojeny**. Frontend nezobrazuje demonstrační údaje jako skutečná měření.
- **Kamera:** aktuální JPEG západní kamery, ruční obnova, informace o směru a archivních měřeních. Stáří snímku **není potvrzeno**, archiv snímků a časosběr zatím nejsou připojeny.
- **Mapy:** časová osa nedávných historických radarových snímků RainViewer, ovládání snímků, podklad OpenStreetMap. Ostatní mapové vrstvy zatím nejsou připojené.
- **Senzory:** přehled osmice skutečných archivních kanálů z API. Názvy a čísla jsou pouze sloupce WeeWX, **nepotvrzují fyzické umístění, model, RSSI, baterii ani online stav jednotlivých čidel**.
- **O projektu:** meteorologická stanice, zdroj a vlastnosti dat, skutečně nasazená revize a čas.
- **Mobilní zobrazení:** vlastní menu, responzivní gridy podle návrhu. Testováno přes Playwright 390×844, desktop 1440×900.

## Nezávislé ověřování aktuálně nasazeného webu

GitHub Actions workflow [.github/workflows/preview-visual-smoke.yml](../.github/workflows/preview-visual-smoke.yml):
- po push do main s frontend změnou (čeká na odpovídající SHA v /deployment.json),
- denně v 08:23 UTC,
- ručně přes workflow_dispatch.

S Chromium Playwright kontroluje všech osm URL na desktopu a mobilu, HTTP 200, JavaScript výjimky, horizontální přetékání, /api/v1/readyz a /deployment.json. Z každého běhu vzniká artefakt **preview-screenshots** s 16 screenshoty, dostupný sedm dní. Externí Open-Meteo a RainViewer mají fallback a mohou být dočasně nedostupné; workflow loguje jejich stavy. Toto je skutečná prohlížečová kontrola **nasazeného webu**, nikoli pouze Astro build.

API v1 v repozitáři nyní implementuje `/current`, raw/hodinovou/denní `/history` s `resolution=auto`, denní/měsíční/roční statistiky a archivní SSE refresh. Denní SQL mapování bylo ověřeno SELECT-only proti připojené WeeWX databázi; API zatím není nasazené. Frontend klimatologii ještě na tyto endpointy nenapojuje. [Produktový kontrakt](../docs/API_V1_PRODUCT_CONTRACT.md) popisuje implementaci i otevřené provozní požadavky; metodika souhrnů a jejich meze jsou v [auditu](../WEEWX_DAILY_SUMMARIES_AUDIT.md).



## Stav integrace po rozšíření API (1. 11. 2026)

- **Klimatologie:** /klimatologie/ čte skutečné /api/v1/statistics/yearly a /monthly. Tabulka ročních souhrnů, průměrné měsíční teploty, srážky, vítr a výběr roku jsou napojené na API; dostupnost výsledků závisí na produkčních denních tabulkách archive_day_* a jejich SELECT oprávněních. Historické extrémy zůstávají před QC jen orientační. Neúplné údaje se nikdy nevymýšlejí.
- **Grafy:** /grafy/ nabízí vlastní kalendářní rozsah, dvě veličiny na oddělených osách, časový zoom a CSV export skutečných bodů. Rozlišení raw/hourly/daily se vybírá podle rozsahu, hranice dnů jsou Europe/Prague včetně DST.
- **Aktuálně:** na úvodu i detailu dnešní minimum/maximum teploty a dnešní srážky z denního statistického API; SSE reaguje na skutečné změny archivu (nikoliv sekundové LOOP živé vysílání).
- **Senzory:** inventář /api/v1/sensors je oddělen od archivních kanálů /current; API dosud publikuje prázdný fyzický seznam, takže polohu, hloubky, baterie a RSSI nelze bez důkazů uvádět.
- **Kamera:** frontend čte /api/v1/camera/status, avšak aktuální API vrací disabled; externí západní JPEG je dostupný samostatně. Archiv snímků, časosběr a ověřený čas pořízení zatím nejsou implementované v datovém zdroji.
- **Neexistující zdroje:** sluneční svit v hodinách není totéž jako sluneční záření ve W/m²; sníh a oficiální výstrahy ČHMÚ nejsou dostupné v současném kontraktu a web je neprezentuje jako naměřené.
- **Testy:** CI používá npm ci, astro check, unit testy, build a prohlížečový Playwright smoke všech 8 veřejných stránek; ten nyní diagnostikuje i roční statistiku. Automatický LXC deploy ukazuje faktický commit v /deployment.json.
- **Bez zápisu do produkční DB:** web i API jsou read-only, případná rekonstrukce historických dat má vlastní oddělený postup.

## Důležitá otevřená práce

- **Provoz klimatologie:** UI je napojené; zbývá potvrdit nasazení agregovaného API v LXC, existence a SELECT granty tabulek archive_day_* a úplnost/QC historických dat.
- **Víceřadé grafy:** dvě veličiny, datum a CSV nyní fungují; dlouhé souvislé období 2009–2026 zatím vyžaduje postupné stránkování dat.
- **Senzorová diagnostika:** ověřit fyzické mapování, instalaci, údaje o bateriích, RSSI a čas výpadků.
- **Kamera:** nezávislý čas snímku, archiv, časosběr.
- **Výstrahy ČHMÚ a další mapové vrstvy:** přímé zdroje a jejich podmínky nejsou zatím zprovozněny. Neprezentujeme stav výstrah jako nulový bez ověření.
- **Zdrojové podmínky:** Open-Meteo a RainViewer mají omezení licencí a typu použití; před veřejným komerčním provozem je nutné ověřit práva a kvóty, případně přejít na autorizované poskytovatele.
- **Bezpečnost:** preview je určeno k vývoji a má být chráněno přes NPM Access List. Není to produkčně hardenované API.

Změny zapisuj i do [changelogu](../CHANGELOG.md). Vždy odliš stav v GitHubu, stav CI a verzi **fakticky nasazenou na LXC**.
