# RH 2022: férové porovnání LuhaMet a ILOUKA4 na shodných časových slotech

## Smysl

Dosavadní hodnoty MAE mezi Loučkou a dvěma referencemi za rok 2022
byly vypočteny na dvou různých množinách překryvných časů. Nelze z nich
samotných bezpečně vyvodit, která reference je přesnější pro Loučku.
Nový krok porovnává **obě reference vůči Loučce ve stejném UTC 5min slotu**.

Teplota, korekční koeficienty, odhady chybějící RH ani hodnoty k zápisu
do původního archivu se tímto krokem negenerují.

## Metodika

- Každý den 2022 načte přesně tři krátké indexované `SELECT` dotazy:
  vlastní archiv + LuhaMet Sehradice + WU ILOUKA4, s maximálně
  400 řádky na jednu zdrojovou tabulku a den.
- Přijme původní RH **1–100 %**, přesný 5min slot a jediný původní řádek.
  Reference: `quality_status=reference_only`, RH **1–100 %**, čas nejvýše
  ±30 s od stejného 5min slotu a právě jedna použitelná hodnota.
- Do MAE, RMSE a biasu obou referencí je zahrnut slot **jen tehdy**,
  pokud současně existují všechny tři kvalitativně přijatelné hodnoty.
  Zero-pair den/měsíc má chyby `null`, nikoliv zavádějících 0 %.
- Po načtení každého dne se znovu vypočítá již používané `buildRhDay`
  a ověří, že všechny základní souhrny a porovnání jsou přesně stejné
  jako v původním soukromém `qc-rh-2022-YYYY-MM-DD.json` včetně SHA256
  vazby na tuto bázi. Jakákoli změna archivního či referenčního
  podkladu běh **zastaví**; předchozí důkaz nikdy nepřepisuje.
- Měsíční i roční MAE/BIAS se počítají součtem jednotlivých rozdílů,
  nikoli aritmetickým průměrem zaokrouhlených denních MAE. Pro každý
  měsíc se zaznamená počet společných trojic a počet dnů s alespoň
  24 trojicemi. Třída `coverage_sufficient_for_further_validation`
  je **jen indikátor velikosti vzorku**, ne důkaz kalibrace.
- Porovnání se omezuje na dny, kdy Loučka vlastní RH měřila.
  **Únor 2022** může mít nulový počet trojic, což je očekávaná
  absence verifikačních údajů; nelze to interpretovat jako dobrou shodu.

## Privátní výstupy

V `/var/lib/loucka-qc` (0700) vzniknou:
- 365 samostatných `qc-rh-triplet-2022-YYYY-MM-DD.json` (0600,
  vytvoření pouze pokud neexistují; pro dávkové obnovení výpočtu);
- `qc-rh-2022-triplets-summary.json` (0600) s 12 měsíčními statistikami
  a celoroční statistikou;
- `qc-rh-2022-triplets-monthly.csv` (0600) pro kontrolu či tabulku.

Žádný veřejný API endpoint ani publikace do Astro/Nginx, žádné DB zápisy.

## LXC: bezpečný read-only běh

Nejdříve synchronizovat `main` tak, aby obsahoval merge commit
tohoto PR. Nechat běh proběhnout pod účtem `loucka` a používat
stávající root-owned `/etc/loucka-weather/qc.env`.

Dry-run bez jakéhokoli SQL:

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-triplets.mjs \
  --reports-dir /var/lib/loucka-qc --dry-run
```

Pilot pouze **duben 2022 (30 dní)**, výhradně čtecí režim:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=read-only \
  -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6" \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=600s \
  /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-triplets.mjs \
  --reports-dir /var/lib/loucka-qc --run \
  --from 2022-04-01 --to 2022-05-01 --max-days 30 --delay-ms 200
```

Pokud `processedThisRun=30` a `databaseWrites=0`,
v dalším běhu lze dokončit zbývajících 335 dní:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict -p ProtectHome=read-only \
  -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6" \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=2400s \
  /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-triplets.mjs \
  --reports-dir /var/lib/loucka-qc --run \
  --max-days 365 --delay-ms 200
```

Při opakovaném volání bezpečně pokračuje pouze u chybějících denních
důkazů. Pokud se údaje změnily, skončí chybou. Lock
`.qc-rh-triplets-2022.lock` se nesmí násilně odstranit bez ověření
existence aktivního procesu.

Očekávaný konečný stav: `analyzedDays=365`, `pendingDays=0`,
`complete=true`, `databaseWrites=0`, žádné automatické schválení
nebo rekonstrukce. Přesný počet trojic zatím **nelze předem odhadovat**.

Pro Mac:

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-rh-2022-triplets-monthly.csv ~/Downloads/
```

## Další rozhodnutí

Teprve po ověření identických časů lze porovnat reference na stejném
vzorku a případně navrhnout **oddělenou validaci** v čase, kdy Loučka
měřila, ideálně s různými sezonami a rozsahem vlhkosti. Rozhodnutí o
rekonstrukci původního RH archivu ani zápis do databáze se neprovádí.
