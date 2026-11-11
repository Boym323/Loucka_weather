# QC relativní vlhkosti 2022 – rozhodovací matice připravenosti podkladů

## Důvod

Rok 2022 má 44 516 původních archivních řádků s `outHumidity=NULL`,
978 zcela chybějících 5min slotů a 42 710 RH NULL slotů se dvěma
referenčními stanicemi. Pouze 33 388 z těchto slotů má shodu LuhaMet
a WU ILOUKA4 v rozmezí do 10 procentních bodů (screening, **ne**
povolení pro doplnění).

Přísný blokovaný holdout na **57 112** známých pětiminutových
trojicích (204 testovaných dnů) ukázal:

| Měsíc | testované dny | MAE WU bez / s experimentálním offsetem (p. b.) | Interpretace |
|---|---:|---:|---|
| 2022-01 | 0 | bez validace | RH převážně NULL, nelze kalibrovat |
| 2022-02 | 0 | bez validace | RH úplně NULL, nulový testovací překryv |
| 2022-03 | 0 | bez validace | nedostatek trénovacích dnů a rozpor referencí |
| 2022-04 | 25 | 6,516 / 6,614 | offset mírně škodí |
| 2022-05 | 0 | bez validace | RH převážně NULL |
| 2022-06 | 0 | bez validace | RH převážně NULL |
| 2022-07 | 27 | 6,142 / 6,245 | offset mírně škodí |
| 2022-08 | 31 | 5,995 / 6,174 | offset škodí, RH NULL = 0 |
| 2022-09 | 30 | 3,644 / 3,643 | zanedbatelný přínos |
| 2022-10 | 30 | 3,509 / 3,490 | malý přínos |
| 2022-11 | 30 | 4,176 / 2,086 | offset výrazně zlepšil **známá měření**, RH NULL = 0 |
| 2022-12 | 31 | 4,829 / 1,935 | offset výrazně zlepšil **známá měření**, RH NULL = 0 |

**Není možné** využít dobrý listopadový/prosincový model k
automatickému přepočtu února nebo března. Jedná se o retrospektivní
experiment uvnitř měsíce, s vyloučením sousedních ±3 dnů, nikoli
validaci na skutečně chybějících hodnotách.

## Implementace: soukromá měsíční evidence gating

`api/scripts/qc-rh-readiness.mjs` nemá DB klienta, nepoužívá síť,
`qc.env` ani přístup k veřejnému API. Ověří tři dříve vytvořené
soukromé reporty ve složce 0700:

1. `qc-rh-2022-triage.json` – 365 dnů a měsíční výpadky,
   počet dostupných a shodných referencí.
2. `qc-rh-2022-triplets-summary.json` – 365 dnů a měsíční
   společné trojice skutečně měřené RH.
3. `qc-rh-2022-holdout-summary.json` – 365 dnů, přísný
   blokovaný leave-one-day-out s vynecháním ±3 dnů.

Při neshodě verzí, neúplném roce, zápisových oprávněních,
nemožných měsíčních součtech, větším testovacím vzorku než
počet skutečných trojic nebo chybných zaokrouhlených MAE
generování **odmítne výsledek**.

Odvozené výstupy `qc-rh-2022-readiness.json` a
`qc-rh-2022-readiness.csv` jsou soukromé soubory **0600**.
Každý měsíc uvádí odděleně:

- původní RH NULL a kompletně absentující měření;
- dostupnost a shodu dvou referencí pro skutečně RH NULL intervaly;
- počet identických trojic a počet nezávisle hodnocených trojic;
- testovací MAE bez korekce a po ní, včetně znaménka zlepšení;
- **stav důkazů** a návrh dalšího manuálního šetření.

Kategorie jsou např. `blocked_no_local_validation`,
`blocked_reference_disagreement`,
`hold_offset_worsens_validation`,
`small_null_gaps_manual_only`, `no_null_rh`. **Žádná
kategorie nesmí být použita jako automatické schválení
rekonstrukce** a nevznikají žádné odhadované hodnoty RH.

### Příkaz na LXC po synchronizaci main

Pod běžným účtem `loucka` (příkaz z root shellu):

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-readiness.mjs \
  --reports-dir /var/lib/loucka-qc
```

Není potřeba systemd `EnvironmentFile`, databáze ani zvýšená
oprávnění. Výsledek je pouze přegenerovaný pracovní soukromý
JSON/CSV. Soubor pod `/var/lib/loucka-qc` není součástí veřejného
Nginx/Astro webu.

Ověření:
```bash
stat -c '%U:%G %a %s %n' \
  /var/lib/loucka-qc/qc-rh-2022-readiness.json \
  /var/lib/loucka-qc/qc-rh-2022-readiness.csv
```

## Co dělat potom

Pokud není dostatek místních vlastních RH měření k validaci
(Leden–březen, květen–červen), další technicky přiměřený krok je
**hledání nezávislých historických originálních RH záloh**
(staré WeeWX databáze, originální datové soubory, případně export
meteostanice) a ověření časových značek i identity senzoru.
Nový zdroj nesmí být automaticky považován za původní měření bez
auditovatelné provenience.

U března zkoumat meteorologické rozdíly a chyby referencí.
Pro duben/červenec porovnat výsledky bez offsetu, protože jeho
blokovaná validace RH WU chybu zvyšuje. Zcela chybějící původní
pětiminutové sloty zpracovat zvlášť; dostupná reference sama
nezaručuje rekonstrukční oprávnění.

V žádné fázi tento modul nepřistupuje k původní MariaDB,
nezapisuje do `pocasi-loucka.eu.archive` ani do
`loucka_reconstruction`, nepublikuje data na HTTP endpoint
a neschvaluje náhradní RH.
