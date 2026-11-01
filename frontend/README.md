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
- **Grafy:** interaktivní ECharts s libovolným kalendářním obdobím do dvou let, dvěma porovnávanými veličinami, zoomem a CSV exportem; rychlý graf 24 h, intervalové srážky a archivní tabulka.
- **Klimatologie:** skutečný klient /statistics/yearly a /monthly, výběr roku, roční souhrny, měsíční teploty/srážky/vítr a orientační denní extrémy. Výsledky závisí na dostupnosti denních souhrnných tabulek; datum a úplnost jsou vždy uvedeny.
- **Kamera:** aktuální JPEG západní kamery, ruční obnova, informace o směru a archivních měřeních. Stáří snímku **není potvrzeno**, archiv snímků a časosběr zatím nejsou připojeny.
- **Mapy:** časová osa nedávných historických radarových snímků RainViewer, ovládání snímků, podklad OpenStreetMap. Ostatní mapové vrstvy zatím nejsou připojené.
- **Senzory:** archivní kanály z /current a oddělený auditovaný fyzický inventář /sensors. Současný inventář je prázdný; archivní hodnoty **nepotvrzují polohu, model, RSSI, baterie ani online stav jednotlivých čidel**.
- **O projektu:** meteorologická stanice, zdroj a vlastnosti dat, skutečně nasazená revize a čas.
- **Mobilní zobrazení:** vlastní menu, responzivní gridy podle návrhu. Testováno přes Playwright 390×844, desktop 1440×900.

## Nezávislé ověřování aktuálně nasazeného webu

GitHub Actions workflow [.github/workflows/preview-visual-smoke.yml](../.github/workflows/preview-visual-smoke.yml):
- po push do main s frontend změnou (čeká na odpovídající SHA v /deployment.json),
- denně v 08:23 UTC,
- ručně přes workflow_dispatch.

S Chromium Playwright kontroluje všech osm URL na desktopu a mobilu, HTTP 200, JavaScript výjimky, horizontální přetékání, /api/v1/readyz a /deployment.json. Z každého běhu vzniká artefakt **preview-screenshots** s 16 screenshoty, dostupný sedm dní. Externí Open-Meteo a RainViewer mají fallback a mohou být dočasně nedostupné; workflow loguje jejich stavy. Toto je skutečná prohlížečová kontrola **nasazeného webu**, nikoli pouze Astro build.

API v1 nyní implementuje `/current`, raw/hodinovou/denní `/history` s `resolution=auto`, denní/měsíční/roční statistiky a archivní SSE refresh. Frontend tyto endpointy využívá; dostupnost každého souhrnu je ověřována zvlášť. Ke skutečným statistickým výsledkům musí mít runtime read-only účet oprávnění SELECT také k příslušným tabulkám `archive_day_*`. Připojení a výsledky kontroluje samostatný veřejný Playwright test. [Produktový kontrakt](../docs/API_V1_PRODUCT_CONTRACT.md) popisuje implementaci i otevřené provozní požadavky; metodika souhrnů a jejich meze jsou v [auditu](../WEEWX_DAILY_SUMMARIES_AUDIT.md).



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

## Vizuální návrh – interakce doplněné 1. 11. 2026

- **Mobil:** spodní navigační lišta pro pět hlavních sekcí, ostatní stránky zůstávají dostupné přes horní menu.
- **Mapy:** časová osa dostupných snímků RainViewer a skutečně funkční přepínač radarové vrstvy. Nepřipojené meteorologické vrstvy nejsou falešně aktivní.
- **Kamera:** ruční aktualizace nebo volitelné obnovování po 60 sekundách (pouze ve viditelné kartě), fullscreen. Čas stažení obrázku neznamená čas jeho pořízení.
- **Senzory:** trendová SVG 24 h ze skutečných archivních bodů. Mezery se nepropojují. Bez měření se zobrazí nedostupný stav.
- **Klimatologie:** vedle měsíčních grafů také tři menší šestileté souhrny založené na ročních statistikách API.
- **Testy:** Playwright vyžaduje viditelnost mobilního menu, tři roční klimatologické grafy, prvky kamery, přepínač radarové vrstvy a trendové kontejnery senzorů.

Nezávislé blokery před publikací jako kompletního produktu: ověřený archiv fotografií a časosběr, určení času vzniku JPEG, registry fyzických čidel a telemetrie RSSI/baterií, lokálně validované výstrahy CAP ČHMÚ, případně další licenčně a technicky ověřené mapové vrstvy.


## Ověřené rozšíření: archiv kamery, čidla, lokální CAP, modelové vrstvy a klima

- Kamera: plnohodnotná galerie archivovaných skutečných JPEG a denní MP4 time-lapse z časovače na staging LXC. Bez spuštění časovače galerie pravdivě hlásí prázdný archiv. Čas na fotografii = archivace/stáhnutí, nikoli čas expozice.
- Senzory: `/api/v1/diagnostics/sensors` čte pouze stávající povolené diagnostické kanály z produkčního archivu WeeWX. Jde o surové hodnoty a předběžné mapování, nikoli potvrzené RSSI v dBm či procenta baterie.
- Výstrahy: oficiální ČHMÚ CAP XML `XOCZ50_OKPR.xml`, zpracování pro CISORP `7209`, expirační časy a fallback při neověřené geokódované oblasti. Zdroj se získává samostatnou Python službou na LXC, nikoli klientským CORS voláním.
- Klimatologie: integrál záření (kWh/m²) s uvedením pokrytí a počet mrazových dnů z původních denních minim. Obě statistiky jsou **odvozené**; nejsou to naměřené hodiny slunečního svitu ani výška sněhu.
- Mapy: vedle historického radaru RainViewer se zobrazují volitelné vzorkované hodnoty teploty a větru z předpovědního modelu Open-Meteo, jasně oddělené od staničních měření.
- Nepotvrzené historické snímky, sněhová pokrývka a dobu slunečního svitu web nedoplňuje syntetickými hodnotami.

Archivační galerie navíc podporuje výběr konkrétního UTC dne za posledních 35 dní a stránkování jednotlivých JPEG. Sběr zůstává opt-in a bez sběrné služby budou výsledky prázdné.
