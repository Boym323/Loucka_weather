# Klimatologický přehled: souhrnný read-only endpoint – etapa 17. 11. 2026

## Předchozí doložený stav
GitHub Actions public dev smoke nad commitem `333f2c8`, run `44144985564`, prošel 15 veřejných tras a skutečný GW3000 live/fallback. Úplné procházení `/klimatologie/` generovalo **69 browser fetchů** do `/api/v1/` na desktopu i mobilu, z toho velká část vznikla ze 4 ročních souhrnů, 18 jednotlivých ročních hodnot a 36 měsíčních souhrnů. Údaj je z jediné laboratorní návštěvy v CI, ne reálný návštěvnický percentil.

## Nové rozhraní
`GET /api/v1/climate/dashboard?year=2025&units=metricwx&dataset=original`

- Konečná konfigurace pouze `original`, s `qcStatus: original_unverified`. `approved` selže uzavřeně. Žádné rekonstrukční zdroje ani přepis tabulek.
- Jeden HTTP požadavek provede **právě tři omezené read-only dotazy** `ArchiveReader.dailySummaries`: `outTemp`, `rain`, `windSpeed`; nejvýše sedm kalendářních roků včetně současného roku (max. 2 600 dní) a limit počtu vrácených řádků. Metody agregace i převody jednotek jsou shodné s původním API statistik.
- Obsah: zvolený rok, čtyři roční údaje, 6 posledních dokončených let podle výběru, 12 měsíčních hodnot tří veličin, časové pokrytí teploty a měsíční teplotní extrémy – všechny **předběžné**.
- Nulová srážka při existujícím měření zůstává 0; neexistující nebo nevalidní intervaly jsou `null`. Časové hranice používají `Europe/Prague` i při přechodu CET/CEST. Měsíční průměry se nikdy nepočítají jako prostý průměr denních průměrů; server používá `sumtime/wsum`.
- Každé podezřelé dílčí období selže jako chybějící hodnota, nikoliv publikovaný neověřený odhad. Nesprávná časová mřížka, duplicita nebo překročený počet řádků blokuje celý endpoint.
- Stávající `/statistics/{monthly,yearly}` a `/climate/annual-matrix` se nemění; nový endpoint přidává pouze čtecí přehled. Pětiminutová paměťová cache se sdílí mezi současnými návštěvníky, odpověď podporuje ETag / 304.

## Ověření a limity
API unit/inject testy musí ověřit přesnou numerickou shodu s původními /statistics, včetně DST a reálných nul, a dokázat 3 čtení místo desítek. Frontend Chromium testy musí dokázat přepnutí roku, vykreslení měsíčních grafů a procházení archivu. Teprve po sloučení a skutečném dev deploy lze tvrdit, o kolik požadavků se browser zátěž snížila. Veřejný smoke musí ověřit `deployment.json` a stabilní `readyz`.

**Bezpečnostní omezení:** změna zasahuje do testovacího Fastify API; auto-sync po sloučení může krátce restartovat jen dev API. Produkční WeeWX a MariaDB archiv zůstávají beze změny. Pro produkci nadále NO-GO bez ověřeného MariaDB TLS, aktuálního SHOW GRANTS, zálohy/obnovy, dlouhodobé stability a rollbacku.

## Živý DEV výsledek po sloučení PR #119

Veřejný GitHub Actions [run #44148375636](https://github.com/Boym323/Loucka_weather/actions/runs/44148375636) dne 17. 11. 2026 prokázal aktivovaný commit `e13bf6e`, úspěšné 15stránkové vizuální ověření, reálné klimatologické karty a grafy i GW3000 live/failover. Při **úplném testovaném průchodu** `/klimatologie/` bylo v browser Resource Timing zachyceno **10 fetch požadavků** na API jak v desktopovém, tak mobilním běhu; předchozí run `44144985564` na commitu `333f2c8` zachytil **69**. Rozdíl je **59 požadavků / přibližně 85,5 % méně**.

Pozor: tento test při úplném scrollování před změnou a po ní měl obdobnou funkční hloubku, ale neidentickou síťovou zátěž a CI prostředí. `DOMContentLoaded` se změnilo ze zhruba 0,93 s na zhruba 1,02 s desktop a z 0,94 s na 1,02 s mobil; nejde o potvrzení zrychlení času načtení. Orientační API resource p95 v jediném novém běhu bylo 1 814,5 ms desktop / 970,5 ms mobil a může být ovlivněno jedním delším souhrnným požadavkem. Je potřeba oddělené opakované měření a případná optimalizace SQL.

Regresní test nově selže, pokud `/klimatologie/` v úplném veřejném průchodu vyvolá více než 20 API fetchů nebo nevyvolá přesně jeden `/api/v1/climate/dashboard`. Zachováno rozlišení původních dat, rekonstruovaných kandidátů a předběžných rekordů.
