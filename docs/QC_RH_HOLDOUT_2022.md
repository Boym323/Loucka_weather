# RH 2022: blokovaná retrospektivní validace referenčních korekcí

## Cíl

Uzavřené porovnání na přesně identických pětiminutových UTC trojicích
Loučka–LuhaMet–WU ILOUKA4 potvrdilo na **57 769 párech** MAE
**7,170 p. b. LuhaMet** a **4,893 p. b. WU**; WU vychází lépe na
33 689 slotech, LuhaMet na 21 343 a 2 737 skončilo nerozhodně.

Tyto výsledky ale neověřují **odhad korekcí mimo pozorované úseky**.
V únoru má přímý RH tripletový audit 0 párů, v lednu 14,
v květnu 50, v červnu 196. V době výpadku Loučky tedy obvykle
**nelze ověřit ani skutečný sezónní bias referenční stanice**.
Na samotném MAE nelze stavět automatickou rekonstrukci.

## Nové soukromé a čistě čtecí ověření

`qc-rh-holdout.mjs` vyžaduje předem vytvořených 365 denních RH
reportů `qc-rh-2022-YYYY-MM-DD.json` a 365 denních
`qc-rh-triplet-2022-YYYY-MM-DD.json`, všechny privátní 0600.
Pro každý den v roce provede maximálně **3 krátké indexované SELECT**:
originální archiv, LuhaMet a WU. Nově načtená data nejprve přepočítá
do stávajícího RH QC a porovná s historickým RH souhrnem i tripletovým
reportem. Jakákoli neshoda znamená **fail-closed**, nikoli automatické
přepsání důkazů.

V samostatném souboru `qc-rh-holdout-2022-YYYY-MM-DD.json` (0600)
se zachová přesná RH trojice v daném UTC slotu a SHA256 vazba na obě
již existující QC evidence. Původní dvě série důkazů se nepřepisují.

### Retrospektivní metoda

Pro každý testovací den:

- Metriky se počítají jen při alespoň **24 trojicích** v testovacím dni.
- Trénování jednoduchého **mediánového RH offsetu** pro LuhaMet a WU
  je možné jen z **jiných dní téhož měsíce**, přičemž se vyloučí
  celé období **±3 dny** kolem testovacího dne (purge).
- Vyžaduje se alespoň **7 různých trénovacích dnů a 500 trojic**.
- Offset = medián vlastních známých RH minus referenčních RH.
  Záměrně se neodhaduje odměřená hodnota v žádné chybějící hodině;
  offset je pouze **testovací parametr** aplikovaný na dny,
  kdy původní skutečná RH existuje.
- Porovná se MAE dvou původních a dvou experimentálně korigovaných
  referenčních hodnot na **totožných held-out testovacích slotech**.
  Měsíční MAE je vážené podle počtu slotů, nikoliv průměr
  zaokrouhlených denních hodnot.
- Když chybí trénink nebo test, nevznikne žádná náhradní nula;
  měsíc zůstane `insufficient_holdout_evidence`.
- Výsledky jsou **retrospektivní leave-one-day-out** a mohou používat
  měření z pozdějšího dne téhož měsíce. Nejde o predikci budoucího
  počasí ani o nezávislou prospektivní validaci. Blok ±3 dny pouze
  omezuje časovou korelaci, neodstraňuje ji.

**Žádná modelová korekce se nepovažuje za navrhovanou náhradní RH.**
`proposedReconstruction=false`, `databaseWrites=0`.
Na výrobu náhradních údajů ani změnu `archive` tento skript nemá kód.

## Jak spustit na LXC

Použij až po synchronizaci potvrzeného GitHub `main` z tohoto PR.
Vše běží v existující privátní složce `/var/lib/loucka-qc`.

Bez databáze:

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-holdout.mjs \
  --reports-dir /var/lib/loucka-qc --dry-run
```

Pilot: 7 dní, potom celý rok. Proces může navázat na vytvořené
denní soubory, nikdy je nepřepisuje. Jako root:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict \
  -p ProtectHome=read-only -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6" \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=2400s \
  /usr/bin/node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-holdout.mjs \
  --reports-dir /var/lib/loucka-qc \
  --run --max-days 365 --delay-ms 200
```

Běh je možné nejprve omezit `--max-days 7`; další spuštění
zpracuje dosud nezpracované dny. Pokud by SQL vracelo
změněná data, skript se zastaví a **nikdy nenahradí** starý
RH, triplet ani holdout JSON. Existuje samostatný lock
`.qc-rh-holdout.lock`.

Úplný výsledek až po **365/365 dnech**:

- `/var/lib/loucka-qc/qc-rh-2022-holdout-summary.json`;
- `/var/lib/loucka-qc/qc-rh-2022-holdout-monthly.csv`.

Tyto dva odvozené soubory jsou také 0600, v 0700 adresáři,
nejsou v Nginxu, Astro ani veřejném API. Na Mac lze CSV přenést:

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-rh-2022-holdout-monthly.csv ~/Downloads/
```

## Co bude následovat

Zkontrolovat změnu MAE po korekci pro duben, červenec–prosinec a
rozložení úspěšnosti po dnech. Únor a další měsíce bez dostatečného
vlastního RH překryvu se automaticky **nezařazují mezi ověřené
kandidáty rekonstrukce**. Také dobrá chyba v holdout testu
je pouze jeden z podkladů pro budoucí ruční rozhodnutí o metodice.

Každá budoucí změna či zápis do původních dat vyžaduje
samostatné, explicitní schválení.
