# Počasí Loučka – měření návštěvnického výkonu a produkční brány

Stav: návrh PR ze 17. 11. 2026, bez automatického produkčního nasazení.

## Pasivní výkon DEV webu

Po sloučení změny spouští existující veřejný vizuální smoke kontrolu uživatelských stránek a současně ukládá `frontend/test-results/preview-screenshots/visitor-performance.json`. GitHub Actions již ukládá adresář do artefaktu `preview-screenshots`. Pro každou skutečně navštívenou stránku a viewport 390/1440 px obsahuje navigační TTFB, DOMContentLoaded, navigační duration, první vykreslení obsahu (FCP, pokud ho prohlížeč uvede), a počet a orientační P95 browser `fetch` požadavků z `/api/v1/`.

Žádné další požadavky na DB/API. Report je anonymní a neobsahuje parametry URL, počasí, IP, žádné přihlášení ani adresy interních hostů. Vždy ověřit shodu testovaného commitu s `deployment.json` a dostupnost `readyz`. Pokud smoke selže, report může být neúplný.

**Nejde o Core Web Vitals skutečných uživatelů**; jde o jeden laboratorní běh z runneru GitHub Actions. P95 několika resource entries není P95 Fastify/API ani SQL. Jeden běh není důkaz výkonové regrese či zlepšení.

### Doplnění 19. 11. 2026: laboratorní kritická cesta
- Od prvního vykreslení se v izolovaném prohlížeči při každé navigaci sleduje poslední kandidát `largest-contentful-paint`, dosud pozorované maximum CLS session-window (bez posunů po bezprostředním vstupu) a počet/celkové trvání dlouhých úloh.
- Z Performance Resource Timing se vybírá maximálně pět nejpomalejších zdrojů, uloží se **jen kategorie** (např. `img`, `script`, `fetch`), zda pochází ze stejného webu nebo externě, a jejich trvání v ms. **Žádné URL zdroje, parametry, IP, identifikátory, uživatelské chování ani počasí se neukládají.**
- Observery se spouštějí pouze ve skriptu Playwright, nejsou součástí distribuovaného frontend kódu; na DEV nevzniká nový telemetry endpoint a není žádný dodatečný síťový požadavek.
- `lcpCandidateMs` nemusí být konečné LCP, `clsSessionMaxSoFar` je dosavadní laboratorní odhad, `longTaskDurationMs` **není** Total Blocking Time. **INP ani field p75 nejsou změřeny.** Neplatí při nepodporovaném typu PerformanceObserver, který se zaznamená jako null/zero.
- Stávající baseline ze skutečně nasazeného commitu `35504d9`, workflow `44475961329`: jeden desktop/mobilní přechod na úvodu FCP 1 716 / 1 644 ms, DCL 2 105 / 2 062 ms, a v obou případech 10 pozorovaných API fetchů. Tyto jednotlivé vzorky nejsou prokazatelná regrese a neprokazují příčinu. V novém běhu korelovat typy nejpomalejších zdrojů s reálným vykreslením.
- Pro skutečné LCP/INP/CLS návštěvníků je nutné samostatně schválit soukromí, příjem dat, retention, rate-limit, oddělení DEV/produkce a reprezentativní velikost vzorku. Tato změna to **nenahrazuje**.

## Současný skutečný API výkon

Bezpečný existující postup na DEV LXC: `python3 /home/loucka/Loucka_weather/deploy/lxc/preview-performance-check.py`. Jedna sekvenční sonda, read-only, žádný zátěžový test a restart. Před spuštěním ověřit skutečný aktivní commit API, `deployment.json`, `readyz` a log nasazení. Záznamy hodnotit vedle `docs/API_PERFORMANCE_AUDIT_2026-11-05.md`. Zvlášť měřit stabilitu paměti a operativně pozorované první/ohřáté čtení. Nenazývat první GET cold bez důkazu.

## Povinné brány před produkcí

| Oblast | Kritérium | Stav |
|---|---|---|
| UX | Všechny veřejné trasy, 320–1440 px, ovládání dotykem/klávesnicí, kontrast, mobilní historické grafy | Dokončit živý audit po merge |
| Meteo přesnost | DST Europe/Prague, denní hranice, NULL vs. 0, předběžné rekordy, srážkové rizikové roky | Ponechat regresní kontroly, nezaměňovat QC a validní zobrazení |
| Stabilita | Ověřená revize dev, opakované měření API i webu, pozorování RSS/heap a 503 | Dlouhodobě nedoloženo |
| DB transport | Výchozí politika TLS verify; pro explicitně přijaté spojení výhradně v LAN lze zvolit `--trusted-lan`, evidovat plaintext a ověřit síťová omezení | Provozovatel TLS nevyžaduje; segmentace/ACL zatím provozně nedoloženy |
| DB oprávnění | Ověřit `SHOW GRANTS` provozní API identity jen na cílovém schématu; žádná nepotřebná zápisová oprávnění ani QC | Provozní stav neověřen; před produkcí povinné |
| Obnova | Testovaná záloha, rollback na WeeWX/Belchertown, monitorování, zdokumentované servisní okno | Bez živého testu NO-GO |
| Produkce | Oddělená produkční akceptace, žádný automatický cutover z dev | Nepovoleno |

Před ověřením všech bran je **release verdict NO-GO**. Nikdy neměnit původní `pocasi-loucka.eu.archive`, rekonstrukční kopii, WeeWX ani MariaDB prostřednictvím těchto testů. Nepřepínat produkční Nginx. Skript `deploy/lxc/site-readiness-audit.sh` je pouze čtecí; jeho úspěch necertifikuje externí firewall, zálohy nebo restore.

### Aktualizace 19. 11. 2026 – kandidáti na omezení kritické cesty
Veřejný DEV smoke #44488456029 potvrdil přesnou revizi `019623c1b8635a7bfd5651b442705b3d54f7183e` a 30 vzorků. Při jedné návštěvě úvodu v Chromium:

| Viewport | FCP (ms) | LCP kandidát (ms) | dosud pozorovaný CLS | 5 nejdelších kategorií |
|---|---:|---:|---:|---|
| Desktop 1440 | 928 | 1192 | 0,034 | stejný web: skript 719; externí obrázek 689; další skripty ~514 |
| Mobil 390 | 892 | 1156 | 0,0495 | stejný web: skript 720; externí obrázek 683; další skripty ~512 |

Žádné dlouhé úlohy nebyly tímto laboratorním pozorováním zachyceny, což **není** důkaz nulového INP. Jednotlivá navigace neprokazuje statistickou významnost ani kauzalitu. Vysoká doba stahování externího obrázku je konkrétní hypotéza pro zlepšení načítání a pro kontrolu spojení v prohlížeči; nelze ji zaměňovat za laboratorní LCP.

Navazující úzká změna používá jen na úvodu `preconnect` na kamerový hostitel a prioritní `preload` totožného JPEG. Původní čas pořízení snímku zůstává neověřený. Laboratorní observer nově označí element kandidáta LCP pouze jako `image`, `heading`, `text-or-container` nebo `other`; žádné URL/selektory/obsah ani návštěvnické vstupy se neukládají. V novém smoke porovnat FCP/LCP a externí obrázek, případně změnu vrátit bez dalších přístupů k API/DB.

### Doplnění 19. 11. 2026 – pomalý mobilní profil po PageSpeed
Provozovatel dodal PSI desktop 99 vs. mobil 59, mobil FCP 5,1 s a LCP 8,6 s na emulovaném Moto G Power / pomalé 4G (19. 11. 2026 09:52 SEČ). Rychlé jednotlivé DEV vizuální smoke bez omezení sítě nejsou adekvátní prediktor pomalého mobilu.

Nový `frontend/scripts/mobile-slow4g-lab.mjs` je **izolovaný Playwright + CDP test** spouštěný až po běžném veřejném smoke a kontrole přesného veřejného SHA, nikoliv přímo na návštěvnických stránkách. Profil: viewport 390×844, 4× CPU throttle, 1,6 Mbit/s down, 0,75 Mbit/s up, 150 ms latence, tři nové browser contexts se zakázanou cache; maximálně tři sekvenční návštěvy homepage, nikoli zátěžový test API. Poslední kandidát LCP a dosud nasbírané CLS se odečtou až po načtení kamerového snímku nebo po omezeném čekání.

JSON `frontend/test-results/preview-screenshots/mobile-slow4g-lab.json` ukládá jednotlivé vzorky, mediány a pouze anonymní kategorie pomalých zdrojů. URL konkrétních zdrojů, jejich obsah, interní hosty, IP návštěvníků ani weather readings neukládá. Perf test je zatím v workflow `continue-on-error`: neznámý výchozí výkon se nesmí vydávat za vynutitelný budget a nestabilní externí webcam nesmí způsobovat falešný FAIL bezpečnostní brány. Každý běh má být přezkoumán.

**Nelze numericky srovnávat skóre PageSpeed s těmito časy:** profil CDP používá skutečně emulované síťové podmínky na runneru, nikoli identický Lighthouse throttling a skórovací model. Jsou to synthetic, nikoli field data, neobsahuje INP, nevytváří se analytics endpoint a nevzniká žádné SQL.
