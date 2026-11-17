# Počasí Loučka – měření návštěvnického výkonu a produkční brány

Stav: návrh PR ze 17. 11. 2026, bez automatického produkčního nasazení.

## Pasivní výkon DEV webu

Po sloučení změny spouští existující veřejný vizuální smoke kontrolu uživatelských stránek a současně ukládá `frontend/test-results/preview-screenshots/visitor-performance.json`. GitHub Actions již ukládá adresář do artefaktu `preview-screenshots`. Pro každou skutečně navštívenou stránku a viewport 390/1440 px obsahuje navigační TTFB, DOMContentLoaded, navigační duration, první vykreslení obsahu (FCP, pokud ho prohlížeč uvede), a počet a orientační P95 browser `fetch` požadavků z `/api/v1/`.

Žádné další požadavky na DB/API. Report je anonymní a neobsahuje parametry URL, počasí, IP, žádné přihlášení ani adresy interních hostů. Vždy ověřit shodu testovaného commitu s `deployment.json` a dostupnost `readyz`. Pokud smoke selže, report může být neúplný.

**Nejde o Core Web Vitals skutečných uživatelů**, pole LCP/INP/CLS se netvrdí; jde o jeden laboratorní běh z runneru GitHub Actions. P95 několika resource entries není P95 Fastify/API ani SQL. Jeden běh není důkaz výkonové regrese či zlepšení.

## Současný skutečný API výkon

Bezpečný existující postup na DEV LXC: `python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py`. Jedna sekvenční sonda, read-only, žádný zátěžový test a restart. Před spuštěním ověřit skutečný aktivní commit API, `deployment.json`, `readyz` a log nasazení. Záznamy hodnotit vedle `docs/API_PERFORMANCE_AUDIT_2026-11-05.md`. Zvlášť měřit stabilitu paměti a operativně pozorované první/ohřáté čtení. Nenazývat první GET cold bez důkazu.

## Povinné brány před produkcí

| Oblast | Kritérium | Stav |
|---|---|---|
| UX | Všechny veřejné trasy, 320–1440 px, ovládání dotykem/klávesnicí, kontrast, mobilní historické grafy | Dokončit živý audit po merge |
| Meteo přesnost | DST Europe/Prague, denní hranice, NULL vs. 0, předběžné rekordy, srážkové rizikové roky | Ponechat regresní kontroly, nezaměňovat QC a validní zobrazení |
| Stabilita | Ověřená revize dev, opakované měření API i webu, pozorování RSS/heap a 503 | Dlouhodobě nedoloženo |
| DB TLS | `WEATHER_DB_TLS_MODE=verify`, ověření CA/hostname, skutečně šifrovaná session, fail-closed | Kód v #113; aktivní LXC režim neověřen |
| DB oprávnění | Ověřit `SHOW GRANTS` provozní API identity jen na cílovém schématu; žádná nepotřebná zápisová oprávnění ani QC | Provozní stav neověřen; před produkcí povinné |
| Obnova | Testovaná záloha, rollback na WeeWX/Belchertown, monitorování, zdokumentované servisní okno | Bez živého testu NO-GO |
| Produkce | Oddělená produkční akceptace, žádný automatický cutover z dev | Nepovoleno |

Před ověřením všech bran je **release verdict NO-GO**. Nikdy neměnit původní `pocasi-loucka.eu.archive`, rekonstrukční kopii, WeeWX ani MariaDB prostřednictvím těchto testů. Nepřepínat produkční Nginx. Skript `deploy/lxc/site-readiness-audit.sh` je pouze čtecí; jeho úspěch necertifikuje externí firewall, zálohy nebo restore.
