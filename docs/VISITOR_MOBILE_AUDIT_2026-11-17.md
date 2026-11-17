# Počasí Loučka – návštěvnická a mobilní revize (PR #118)

Datum auditu: 17. 11. 2026. Zdroj: aktuální GitHub `main` po PR #117, veřejný dev smoke [run #44141560890](https://github.com/Boym323/Loucka_weather/actions/runs/44141560890). **Žádné zásahy do dat ani do produkční služby.**

## Zjištění z nasazeného webu

- Vizuální smoke po synchronizaci commitu `9c7ac20` úspěšně prošel 15 veřejných tras na 390 a 1440 px. Zkontroloval reálné grafy, rok 2025, meziroční srovnání i čtyři historické karty. Celý workflow přesto selhal na samostatném live/failover testu.
- Failover test očekával názvy `Archivní měření` / `Živá data GW3000` z doby před úpravou textů v PR #114, přestože aktuální komponenta používá `Poslední měření` / `Živá měření`. V PR #118 se srovnávají oba srozumitelné stavy, ale zachovává se kontrola skutečného `gw3000_live` a `WeeWX` původu, čerstvosti a neměnnosti archivních srážek. To **není potvrzení funkčního failoveru** bez následného veřejného zeleného testu.
- Komponenta aktuálních údajů měla odpojení živých listenerů při navigaci, ale anonymní listener `loucka:archive-updated` zůstával registrovaný. Nově se odebírá. SSE nesmí být otevíráno po zrušení navigace.
- Klimatologický detail v jednom plném veřejném průchodu zaznamenal 69 prohlížečových `fetch` požadavků na API. 58+ z nich mohou tvořit roční/měsíční statistiky, které byly původně vyžádány ihned po načtení komponenty. Nově se spouštějí až po přiblížení detailu do viewportu. **Celkový počet požadavků při úplném procházení všech grafů se nemění**. Vliv na první návštěvu je potřeba změřit odděleně.
- Izolovaný a11y audit rozšířen z 390/1440 i na **320 px**, ve světlém i tmavém režimu, všech 15 tras. Automatický Axe audit neprokazuje celou WCAG shodu ani uživatelský test dotykem.

## První orientační návštěvnický výkon

Hodnoty z jednoho headless Chromium běhu dev webu, **nikoliv terénní Web Vitals** (run #44141560890):

| Stránka | Desktop DOMContentLoaded | Mobil DOMContentLoaded | API fetch v průběhu testu |
|---|---:|---:|---:|
| Úvodní stránka `/` | 1 758 ms | 1 768 ms | 12 |
| Historické grafy `/grafy/` | 454 ms | 456 ms | 4 |
| Klimatologie `/klimatologie/` | 611 ms | 612 ms | 69 |

`DOMContentLoaded` neznamená, že se všechny grafy dokončily. Snímek výkonu se pořizoval až po interakcích a skrolování, proto počet fetchů neodpovídá pouze prvotnímu zobrazení. Domovská stránka je kandidát pro samostatné profilování. Nelze odvodit P95 skutečných návštěvníků ani příčinu pomalejšího načítání bez opakování.

## Bezpečnost a další rozhodovací brány

Před produkcí stále platí **NO-GO**: skutečné TLS ověření spojení MariaDB, aktivní DB granty API na cílovém schématu, stabilita SSE/archivu při chybě, LXC RAM/CPU a obnovení zálohy, ověřený fallback na původní web. Neprovádět SQL zápisy, změny gateway ani ostrý deploy. Podrobný seznam v `docs/VISITOR_PERFORMANCE_AND_RELEASE_GATES_2026-11-17.md`.

Pokud CI nebo veřejný smoke zůstane červený, nejprve rozlišit zastaralý test, skutečnou chybu a dočasný stav stanice. Nesnižovat meteorologické bezpečnostní kontroly pouze kvůli zelenému testu.
