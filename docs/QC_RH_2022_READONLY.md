# QC relativní vlhkosti 2022 – denní read-only screening

## Cíl a hranice bezpečnosti

Srovnat původní `pocasi-loucka.eu.archive.outHumidity` se dvěma
existujícími referencemi `loucka_reconstruction.reference_observations`
(`luhamet_sehradice`, `wu_ilouka4`) bez rekonstrukce, schvalování,
vkládání ani úprav původních dat.

V únoru 2022 bylo zjištěno 8058 původních řádků s `outHumidity=NULL`,
ale velké množství dostupných RH pozorování v obou referencích.
Dva vybrané kontrolní dny 15. 4. a 15. 8. 2022 naznačují sezónně
proměnlivé odchylky; proto **nelze** přebírat referenční RH ani
paušální offset bez dalšího dokazování.

## Metodika

- **Pevný UTC rozsah** 2022-01-01 až 2023-01-01, 365 kalendářních dnů
  po 288 pětiminutových slotech. Tři malé indexované SELECTy/den:
  původní archive + obě reference zvlášť. Bez globálního SQL JOIN.
- Původní archiv: `archive_absent` = bez originálního řádku,
  `rh_null` = jednoznačný originální řádek s `outHumidity=NULL`,
  `rh_invalid_or_ambiguous` = neplatná RH, nenulová mimo 1–100 %,
  RH 0 % nebo duplicitní vlastní slot. Původní čas mimo přesnou
  pětiminutovou UTC síť je zvlášť sečten, nikoli zaokrouhlen na záznam.
- Reference: `quality_status='reference_only'`, RH v rozmezí 1–100 %
  a časové zarovnání nejvýše ±30 sekund. Tento práh přijímá známé
  odchylky sekund typu WU −8 s, ale odmítá časově nejednoznačné páry,
  duplicity a nulové RH. Reference jsou nezávislé meteorologické
  stanice s možnou geografickou, kalibrační i expoziční odchylkou.
- Není-li na vlastní stanici RH, dvě reference ve stejném
  pětiminutovém slotu mohou dát **screening evidence**
  pouze pokud jejich RH rozdíl nepřesahuje 10 procentních bodů.
  Tento **heuristický práh** není schválení ani záruka korektnosti;
  do původního sloupce se nic nepřepisuje a ani se nenavrhuje
  definitivní náhradní hodnota.
- Každý den obsahuje velikost výpadků, segmenty UTC,
  počty referenčních validních slotů, RH bias a MAE na překryvu
  s vlastními ne-NULL RH, MAE mezi referencemi a časy slotů
  s oběma shodnými referencemi.
- Zpracování může být částečné: `analyzedDays`, `pendingDays`
  a `complete=false` dokud nejsou všechny dny roku skutečně
  zkontrolované; vybraný kratší interval se nikdy nevydává
  za kompletní audit roku 2022.

## Privátní soubory (nikoliv web)

Pro každý zpracovaný den vznikne **nový a bez přepsání** soubor
`/var/lib/loucka-qc/qc-rh-2022-YYYY-MM-DD.json` (`0600`).
Po každém běhu se z ověřených denních JSON bezpečně přegenerují
odvozené souhrny:

- `qc-rh-2022-summary.json` – 365 dní/12 měsíců, částečné či plné
  ukazatele, zpracované dni a ref. statistiky.
- `qc-rh-2022-overview.html` – samostatný offline interaktivní přehled
  s výběrem měsíce a dne, rozdíly RH, souhrny výpadků a CSV exportem.

Všechna data jsou ve vlastní složce 0700, nejsou publikována
přes HTTP API, Astro, NPM ani /srv/loucka-preview. Původních
932 týdenních QC JSON, obnovený overflow soubor ani kompletní
`qc-candidates-complete.csv` se nemění.

## Postup po aktualizaci main na LXC

Spouští uživatel **root** pro správu systemd; proces databázových
dotazů běží pouze pod Unix účtem `loucka` s SELECT-only DB granty.

1. Ujisti se, že lokální Git obsahuje commit tohoto PR; nejdříve
   zkontroluj dostupný příkaz dry-run **bez přístupu k databázi**:

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-humidity-2022.mjs \
  --reports-dir /var/lib/loucka-qc --dry-run
```

Očekává se `analyzedDays=0`, `pendingDays=365`, `databaseWrites=0`
(pokud ještě neexistují RH denní důkazy).

2. Celý rok postupně pouze čtecími dotazy a se systemd sandboxem:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes \
  -p ProtectSystem=strict -p ProtectHome=read-only \
  -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6" \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=2400s \
  /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/qc-humidity-2022.mjs \
  --reports-dir /var/lib/loucka-qc --run \
  --max-days 365 --delay-ms 200
```

V případě přerušení jsou existující denní důkazy 0600 zachovány
a další stejné spuštění pokračuje pouze zbývajícími dny.
Přísný `.qc-rh-2022.lock` zabraňuje souběhu. Pokud zůstane
po tvrdém ukončení, **nejdřív ověřit**, že žádná instance neběží,
a až potom řešit starý zámek; automaticky jej neodstraňovat.

3. Offline kontrola bez databáze:

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-humidity-2022.mjs \
  --reports-dir /var/lib/loucka-qc --summary

stat -c '%U:%G %a %s %n' \
  /var/lib/loucka-qc/qc-rh-2022-summary.json \
  /var/lib/loucka-qc/qc-rh-2022-overview.html
```

Při dokončení očekáváme `analyzedDays=365`,
`pendingDays=0`, `complete=true`,
`automaticCorrections=false`, `databaseWrites=0`.
Jiné součty původní RH jsou možné podle rozdílu mezi
`NULL`, off-grid, 0 % a duplicitními časovými sloty.
Přesný skutečný počet nelze předepsat před reálným čtením DB.

4. Na Macu:

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-rh-2022-overview.html ~/Downloads/
open ~/Downloads/qc-rh-2022-overview.html
```

## Další autonomní etapa po kontrole výsledků

Vytipovat dny s nejvyšším počtem `rh_null` a dvojitou referenční
shodou, samostatně přezkoušet sezónní odchylku a MAE tam, kde Loučka
měřila. Až potom může vzniknout **samostatný návrh rekonstrukčních
pravidel** s označením nejistoty; nebude sám zapisovat do `archive`
ani do rekonstrukčního schématu. Samotné RH 2022 nejsou stejné jako
teplotní QC `temperature_disagreement` a jejich počty se nesmí sčítat.
