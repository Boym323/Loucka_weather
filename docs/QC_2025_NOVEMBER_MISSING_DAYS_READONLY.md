# Dva listopadové dny bez denního WeeWX souhrnu: read-only diagnostika

Staging/DEV operátorský [coverage report 17. 11. 2026 20:21 UTC](https://github.com/Boym323/Loucka_weather/issues/80) prokázal, že `archive_day_outTemp`, `archive_day_rain`, `archive_day_wind` a `archive_day_windGust` obsahují shodně **363 ze 365** denních souhrnů roku 2025. Ve všech čtyřech chybějí **6. a 28. listopad 2025** v kalendáři `Europe/Prague`.

## Krok 1: pouze čtecí dotazy, bez automatického spouštění

Po sloučení PR otevři `deploy/lxc/qc-november-2025-missing-days-readonly.sql` ve své **čtecí** Navicat relaci nad existujícím `pocasi-loucka.eu`. Soubor obsahuje tři nezávislé dotazy a používá pevně určených **šest lokálních dní**: 5.–7. a 27.–29. listopadu 2025.

Konkrétní hranice dvou chybějících dnů (v souladu s WeeWX archive `dateTime` jako časem **konce** intervalu):

| Lokální den | Počátek, UTC (exclusive) | Konec, UTC (inclusive) | Unix epoch |
|---|---|---|---|
| 2025-11-06 | 2025-11-05 23:00 | 2025-11-06 23:00 | (1762383600,1762470000] |
| 2025-11-28 | 2025-11-27 23:00 | 2025-11-28 23:00 | (1764284400,1764370800] |

A. **Existence denního souhrnu** pro všechny čtyři tabulky v těchto šesti dnech. Očekávaná absence v obou cílových dnech musí být potvrzena nezávislým SQL čtením.

B. **Přítomnost původních intervalových dat** pro všechny čtyři veličiny, počet řádků, chybné intervaly, off-grid časové značky a součet intervalových sekund. Nevypisuje jednotlivé teploty ani jiné meteorologické hodnoty.

C. **Skutečné pokrytí teplotou** jen ve dvou chybějících dnech po odstranění časových překryvů. Pokud nejsou žádné použitelné teplotní intervaly, dotaz C pro takový den nevrátí řádek; první indicie o celkovém raw výpadku je dotaz B.

## Interpretace a rozhodnutí

- **A chybí, B má raw data:** pravděpodobně jde o chybějící WeeWX denní agregaci; před přepočtem ověřit, zda záznamy jsou celé, časově správné a meteorologicky platné. Bez schváleného postupu nic nedopočítávat.
- **A chybí, B má nula raw dat:** skutečný výpadek v původním `archive`; bez vlastního původního zdroje nevymýšlet hodnoty ani neimportovat LuhaMet/ILOUKA4 jako měření Loučky.
- **B má dílčí data:** nejprve vyčíslit původní lokální rozsah a přesnost intervalů, zvláště přechod mezi nocí a sousedním dnem. Neznamená to automaticky obnovit celý den.
- **A obsahuje řádek navzdory předchozímu reportu:** ověřit skutečné DB připojení a mezitímní úpravy, protože se zdroje v čase liší.
- **C vykazuje duplicitní pokrytí:** zkontrolovat off-grid, intervaly a překryvy; souhrn nesmí automaticky použít prostý součet délky jednotlivých intervalů.

**Zákazy:** nezapisovat do `pocasi-loucka.eu.archive`, `archive_day_*` ani `loucka_reconstruction`. Žádné `UPDATE`/`GRANT`, `weewx database reconfigure` ani produkční přepínání. Ponechat `original_unverified`. Jde o historické QC, nikoliv požadavek na změnu GitHub CI nebo produkčního webu.
