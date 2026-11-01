# Loučka Weather – ADR 001: volba architektury (31. 10. 2026)

**Stav: NAVRŽENO / ČEKÁ NA POTVRZENÍ.** Toto je výsledek analýz, nikoli schválený produkční standard. V původním `main/README.md` figuroval jako první varianta Python; mezi tím proběhlo šestijazyčné HTTP i offline numerické měření a audit reálné návštěvnosti a 35denních HTTP logů. Nový směr je zdokumentován zde, aby jej AI v dalších chatech neztrácela.

## Rozhodovací návrh
- **Frontend:** Astro + TypeScript; grafy ECharts; statický build, SSR jen tam, kde je nutný. Mobilní prvky a přístupnost jsou důležité (v říjnu 53 % návštěv Matomo telefony+phablety).
- **API:** preferovaný **Node.js + Fastify + TypeScript**, read-only přístup k MariaDB, validace dotazů, omezení rozsahu časových sérií a timeouty; nejdříve vyzkoušet staging.
- **Aktuální počasí:** jeden sdílený stav načtený z existujícího datového kanálu nebo ze souboru se současnými měřeními. Live MQTT/WebSocket feed sdílet; nedělat nový DB dotaz každý vteřinu pro každého klienta.
- **Historické grafy:** předpočítané řady s vhodnou granularitou (minutová/hodinová/denní), cache, podmíněné HTTP odpovědi, omezení počtu bodů pro danou šířku grafu; neodesílat surových 100 tisíc bodů, pokud je UI nevykreslí.
- **Statistiky:** dávková a **inkrementální** agregace, přepočet jen intervalů dotčených novými či opravenými daty; pokud nelze zaručit úplnost či původ, zobrazit odpovídající indikátor kvality.
- **Záznamy:** původní `archive` pouze číst; opravy `loucka_reconstruction` aplikovat kontrolovaně s proveniencí; vyhodnocení data lineage, časových zón a jednotek dle WeeWX.
- **Infrastruktura:** oddělený testovací deployment vedle produkčního WeeWX/Belchertown; Nginx Proxy Manager před aplikací, rozumná cache statiky, limitování zjevných scanů. Neotvírat nové interní služby napřímo na internet.
- **Bezpečnost:** parametrizované SQL, read-only účet aplikace, whitelisting parametrů grafů, rate limiting a generická levná 404 na neexistujících cestách, CSP dle ověřených potřeb. Nelogovat a nepublikovat osobní IP do veřejného repozitáře.

## Proč Node.js?
1. Současný provoz webu (Matomo **216 návštěv** za říjen, 35denní Nginx **54 966** HTTP událostí) není primárně limitovaný rychlostí běžného REST endpointu. Většina viditelné HTTP špičky pochází z automatických skenů a má se absorbovat na proxy.
2. HTTP testy potvrzují, že Node.js má velmi dobrý výkon pro malé a střední odpovědi; při **30d c10 17,37 RPS**, Go **31,34 RPS**. V tomto těžkém scénáři Node prohrál, ale historie se má cachovat a downsamplovat.
3. Jeden TypeScript ekosystém může zjednodušit sdílení validovaných kontraktů a vývoj UI/API; není to automatická garance nižších nákladů.
4. Offline celohistorický výpočet Node.js **15,36 s / 272,25 MiB** je pomalejší než Go/Rust, ale při dávkovém přepočtu a inkrementálním obnovování agregací se nemusí projevit na latenci návštěvníků.

## Co hovoří pro Go a Rust?
- **Go:** nejlepší medián `30d c10` ve třech původních HTTP bězích (**31,34 RPS**). Potenciálně nižší režie API a snadná samostatná binárka. V offline výpočtu syntetické celé historie **5,26 s**, ale aktuální implementace alokovala ~423 MiB RSS – optimalizovat a opakovat.
- **Rust:** syntetická offline historie **4,10 s / ~107 MiB RSS**, nejlepší čas a paměť ze šesti měřených implementací. Provoz samostatného Rust workeru přidává složitost; nasadit jen pokud nákladné dávkové výpočty prokážou opravdový problém.
- **C++:** dobré výsledky krátkých endpointů, ale vyšší nároky na bezpečnost, integraci a dlouhodobou údržbu nejsou pro tuto velikost portálu opodstatněné.
- **Python/PHP:** funkční a numericky souhlasící, ale aktuální benchmarky nepřinesly důvod preferovat je pro nové API. Python nadále může být vhodný pro **offline analýzu a datovou vědu**; bez opakovaného testu nezaměňovat výsledky konkrétních aplikací za obecnou kvalitu jazyka.

## Nutné provozní limity a konkrétní rizika
- **Skenery:** 8. 10. 2026 bylo 247 requestů v 1 sekundě od jedné IP, 244 skončilo 404. Zatížení cizími URL nemá spouštět drahé SSR, parsování historických dat ani SQL.
- **Redirect storm:** 26. 10. 2026 359 requestů/s od jedné IP, všechno 301 na proxy; žádný důkaz stejného zatížení Node aplikace.
- **WebSocket:** 250 HTTP 101 a jedna 502 na `/mqtt` v 35 dnech; access log neumí dokázat simultánní spojení ani objem zpráv. Pro cílové dimenzování změřit broker / otevřená spojení.
- **Bezpečnostní sondu s injekčním URL parametrem** zachytil Matomo na stránce grafů; záznam sám o sobě neprokazuje XSS zranitelnost. Validovat allowlist parametrů, escape výstupy.
- **HTTP 404:** 24 255 (44,1 % všech requestů); významná část jde na neexistující soubory. Neodvozovat z toho nekvalitu navigace.
- **NPM neobsahuje potřebné údaje pro aplikační p95/p99**, CPU a DB IO. Nelze z něj vyčíst limit backendu nebo vliv na WeeWX.

## Návrh testovacího plánu před schválením
1. Postavit minimální **staging** Node Fastify API se `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`, `/healthz`. Datové kontrakty a semantiku intervalů sjednotit se zdroji.
2. Bench s běžným profilem 1/10 současných klientů; **odděleně** 250/s na levné neexistující URL (test proxy; ne proti produkční DB). Kromě RPS měřit p95/p99, event loop, RSS, CPU, DB p95 dotazů a cache hit rate.
3. Změřit počet otevřených MQTT WebSocket připojení, jejich trvání, zprávy/s, CPU a paměť; ověřit reconnect a backpressure.
4. Při opravách v `loucka_reconstruction` ověřovat inkrementální invalidaci cache a přesnost agregátů na reálném **izolovaném snapshotu** (včetně 2009–2026, CET/CEST, zdrojových dat a výpadků).
5. Po těchto měřeních **potvrdit Node.js**, nebo doloženě změnit rozhodnutí na Go či přidat Rust batch worker. Nenasazovat více runtime jen pro teoretické zlepšení.

## Stabilní hranice vůči API

Bez ohledu na finální volbu Fastify/Go musí frontend komunikovat přes **jazykově nezávislý, verzovaný API kontrakt**. API má být samostatná služba mimo WeeWX (v MVP může běžet v novém LXC společně s Astro, ale v odděleném procesu). Podrobný návrh endpointů, OpenAPI, testů parity a bezpečné migrace uvádí [Návrh vyměnitelného API](API_ARCHITECTURE_AND_MIGRATION_2026-10-31.md). Tento odkaz **neschvaluje definitivně Node/Go** ani neznamená existenci hotové implementace.

## Relevantní podklady
- [Matomo](MATOMO_AUDIT_2026-10-31.md), [Nginx provoz](TRAFFIC_AUDIT_2026-10-31.md), [benchmarky](BENCHMARK_SYNTHESIS_2026-10-31.md).
- [HTTP referenční report na benchmark větvi](https://github.com/Boym323/Loucka_weather/blob/bench/go-rust-python/benchmark/REAL_LXC_SIX_LANGUAGES_FULL_THREE_RUNS_2026-10-30.md).
- [Offline výpočetní report na benchmark větvi](https://github.com/Boym323/Loucka_weather/blob/bench/go-rust-python/benchmark/compute/REAL_LXC_OFFLINE_RESULTS_2026-10-31.md).
