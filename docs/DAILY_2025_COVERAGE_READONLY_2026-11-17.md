# Kontrola úplnosti denních souhrnů WeeWX za rok 2025 (read-only)

Veřejný DEV smoke 17. 11. 2026 prokázal funkční klimatologii a 12/12 měsíčních souhrnů. **To není důkaz přítomnosti všech 365 denních řádků.** Dvě původní staging sondy ze dne 17. 11. 2026 v 20:03:48 UTC četly pro `outTemp`, `rain` a `windSpeed` shodně **363 denních souhrnných řádků** za rok 2025.

Tato kontrola odpovídá jen na otázku: **které místní kalendářní dny chybějí jako řádky v `archive_day_*`?** Nezkoumá všechny raw 5min intervaly, neověřuje fyzikální správnost měření a nic nedoplňuje do archivu.

## Jednorázové spuštění na DEV LXC

Po zeleném CI a přenosu příslušného commitu do DEV spustit jako root:

```bash
systemd-run --quiet --pipe --wait --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/api.env \
  -- /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/staging-daily-coverage-2025.mjs
```

Sonda vyžaduje `WEATHER_STAGING_ENABLED=YES` z existujícího prostředí Fastify, nepřijímá CLI parametry a používá původního `createMariaDbReader()`. Provede `ping` a **jen čtyři ohraničené SELECT** se stávajícími read-only granty, každý do nejvýše **366 souhrnných řádků**: `outTemp`, `rain`, `windSpeed` (fyzicky `archive_day_wind`) a `windGust`. Žádná vlastní SQL identifikace se nepřebírá z HTTP či CLI.

## Co číst ve výstupu

- `expectedDays=365`: kalendářní dny 1. 1.–31. 12. 2025 v pásmu `Europe/Prague`.
- `returnedRows`: existující **souhrnné** řádky pro veličinu. Předchozích 363 se má teprve znovu ověřit.
- `missingDates`: konkrétní lokální dny, pro které v dané `archive_day_*` **neexistuje souhrnný řádek**. To samo neznamená absenci raw měření v `archive`.
- `commonMissingDates`: průnik chybějících dní přes všechny čtyři souhrnné tabulky, ne jejich sjednocení.
- `zeroSampleDates`: souhrnný řádek existuje, ale uvádí `count=0`. Nesmí se zaměnit za chybějící řádek.
- `overCoveredDates`: `sumtime` přesahuje skutečnou délku místního dne. Jarní posun času má **23 hodin**, podzimní **25 hodin**; ve výstupu jsou jen kalendářní datum a přebytečné sekundy, nikoli hodnoty teploty/srážek.
- `status=fail`: nevalidní/nesetříděné/duplicitní timestampy, chybějící přístup nebo jiná chyba. Vypisuje pouze sanitizovaný kód, ne SQL, hostname nebo DB hesla.

**Následné QC rozhodnutí:** pro datum v `missingDates` nejprve výhradně read-only ohraničený audit příslušného okna v původním `archive`, rozlišit skutečný výpadek měření a chybu denní sumarizace. Oprava souhrnů se má odvozovat z provenience WeeWX a odsouhlasené metodiky. **Nepřepisovat původní `archive`, neměnit `archive_day_*`, nespouštět WeeWX přepočet automaticky a neoznačovat neověřenou rekonstrukci jako `approved`.**

Účel: [issue #80](https://github.com/Boym323/Loucka_weather/issues/80). Toto nejsou automatické operace na produkčním provozu.
