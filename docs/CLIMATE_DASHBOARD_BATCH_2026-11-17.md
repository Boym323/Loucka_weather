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
