# Read-only kontrola kvality meteorologických měření (QC v1)

První izolovaná etapa pro [issue #80](https://github.com/Boym323/Loucka_weather/issues/80).
**Nejde o schválenou rekonstrukci, produkční endpoint, ani automatický import.**
Žádná změna produkční MariaDB, WeeWX, GW3000, originálního archivu ani již uložených
referenčních řádků. Modul čte jen původní intervalová měření Loučky a dříve
importované reference.

## Rozhraní a bezpečnostní hranice

- Čistý výpočet v `api/scripts/qc-engine.mjs`; dávkový SELECT-only čteč v
  `api/scripts/qc-report.mjs`; žádný veřejný HTTP endpoint ani zápisy do DB.
- Zdroj Loučky: `pocasi-loucka.eu.archive`. Referenční zdroj:
  `loucka_reconstruction.reference_observations`; přesná dvojice
  `station_id=luhamet_sehradice` a `wu_ilouka4`. Jiné schéma, tabulka ani
  identifikátor nejsou nastavitelné z CLI.
- Maximálně **7 dnů v jediném běhu** (UTC začátek/konec, násobky 5 minut),
  max. 2 800 řádků na zdroj; při překročení limitu se audit přeruší bez
  publikace částečného výsledku. Velké rozsahy zpracovat jako více běhů,
  **nepouštět nárazové plošné SELECTy přes celý historický archiv**.
- Účet musí mít **pouze SELECT**. Před každým reportem kontrolujeme
  `SHOW GRANTS`; přítomnost jiných typů grantů se odmítne.
  Podporujeme buď samostatný účet s SELECT na dvě vyjmenované tabulky,
  nebo existující staging účet s SELECT na **celé původní schéma**
  `pocasi-loucka.eu` a SELECT na **jedinou tabulku**
  `loucka_reconstruction.reference_observations`.
  Global SELECT, wildcard na `loucka_reconstruction`, jiné schéma a zápisová
  oprávnění zůstávají zakázané.
  Samotný SQL klient vykonává jen `SHOW GRANTS` a omezené, parametrizované
  `SELECT ... ORDER BY ... LIMIT`. Heslo nikdy nevypisovat.
- Protokol je JSON na standardní výstup; bez zápisu do databáze, bez
  automatické změny `qcStatus`, `dataset=approved` nebo `archive_day_*`.
  Kandidáti mají vždy `needs_manual_review` a
  `automaticWriteAllowed=false`.

## QC pravidla verze 1

| Vstup / situace | Pravidlo | Důsledek |
|---|---|---|
| Teplota | Číselná, orientační fyzikální mez −55 až +55 °C | Mimo mez vyřadit z párování; zapsat kandidáta |
| `usUnits` Loučky | WeeWX 1 = °F, 16/17 = °C | Jiný kód odmítnout |
| Vlhkost | 0–100 %; nulová RH je podezřelá | Podezřelé řádky vyřadit; samotná teplota 0 °C je povolena |
| Dlouhá konstanta | Stejná teplota ≥72 sousedních měření přes min. ~6 hodin | Označit k ruční kontrole, neprohlásit za automatickou chybu |
| Intervaly Loučky | Neplatná délka (mimo 1–30 min), překryv intervalů, duplicitní čas | Nezařazovat do důvěryhodných párů |
| Čas Loučky | Pětiminutová mřížka; odchylka přes 30 s je podezřelá | Nezařazovat do párování |
| Čas reference | Nejbližší pětiminutový slot s odchylkou menší než 150 s | Žádné nejednoznačné nebo duplicitní párování |
| Odchylka teplot | Absolutní rozdíl nad 5 °C | Kandidát `temperature_disagreement` bez navrženého přepisu |
| Chybějící vlastní měření | Referenční stanice má platný bod, Loučka ne | Souvislý `reference_evidence_for_gap`, **nikoliv náhradní hodnota Loučky** |

Pozor: skutečný interval WeeWX používá **koncové časové razítko**. Každý
běh má explicitní UTC okno. Zpracování místních 23/25hodinových dní
vyžaduje správné UTC hranice podle Europe/Prague; modul nedělá
falešné „288 bodů za každý kalendářní den“.

**Spolehlivost** obsahuje počet spárovaných měření, relativní pokrytí
očekávaných pětiminutových slotů, průměrný podepsaný rozdíl, MAE, RMSE,
95. percentil absolutní odchylky, vyřazené vzorky a počet rozdílů nad 5 °C.
`reliability.level` (`strong`, `moderate`, `limited`,
`insufficient`) a `score` 0–100 jsou **orientační heuristikou**
pro vhodnost kontroly, **nikoli vědeckou kalibrací stanice**.
Různá mikroklimata a expozice mohou být příčinou skutečných rozdílů.

Reference zůstávají `reference_only` i při vysoké shodě. Kandidát neobsahuje
hodnotu, která by se měla automaticky zapsat jako měření Loučky.

## Spuštění na odděleném staging LXC

Pro staging je možné opětovně použít stávající účet `loucka_web_ro`,
pokud má pouze granty:
`USAGE ON *.*`,
`SELECT ON pocasi-loucka.eu.*` a
`SELECT ON loucka_reconstruction.reference_observations`.
Druhou volbou je nový samostatný účet s přesnými tabulkovými SELECT granty.
Ani jedna možnost nevyžaduje změnu původních dat. Zpráva nesmí obsahovat
heslo ani jeho hash.

Rootem spravovaný EnvironmentFile (0600, mimo Git):
```ini
WEATHER_STAGING_ENABLED=YES
WEATHER_QC_READ_ONLY=YES
WEATHER_QC_DB_HOST=ADRESA_DB
WEATHER_QC_DB_PORT=3306
WEATHER_QC_DB_USER=loucka_web_ro
WEATHER_QC_DB_PASSWORD=TAJNE_HESLO
```

Jednorázový audit bez změny konfigurace služeb lze spustit přes
`systemd-run`, který bezpečně načte root-owned EnvironmentFile a
samotný proces poběží jako neprivilegovaný uživatel:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes \
  -p ProtectSystem=strict \
  -p ProtectHome=read-only \
  /usr/bin/node /home/loucka/Loucka_weather/api/scripts/qc-report.mjs \
    --from 2017-05-13T00:00:00Z --to 2017-05-14T00:00:00Z
```

Umístění `node` ověřit příkazem `command -v node` (Node.js 24).
Výstup může být rozsáhlejší (max. 100 kandidátů); ukládat ho pouze do
přístupově omezeného umístění mimo veřejný web, pokud je potřeba auditní
artefakt. Žádný timer se tímto PR automaticky nezapíná: nejprve ověřit
jednorázový běh, práva a vhodnost periodicity.

## Testování a limity

```bash
cd api
npm ci
npm test
# syntetická čistá funkce: node --test test/qc-readonly.test.mjs
```

První QC verze slouží ke **screeningu**. Před ručním schválením opravy je
nutné dohledat původní intervaly, časový posun, historické změny senzorů,
měřicí expozici, srovnávací stanice a dostupné důkazy. Srážkové čítače
LuhaMet/WU se zde **nesčítají** ani nepoužívají k rekonstrukci srážek.
Další navazující práce: dlouhodobé sezónní srovnání, překryvy
`archive_day_*` z 25.–26. 7. 2026, UI pro schvalování a až po
auditovaném rozhodnutí zápis **jen do oddělené rekonstrukční vrstvy**.


## Dávkové zpracování celé historie (navazující etapa)

`npm run qc:batch` používá existující `qc:report`, nikoli nové neomezené SQL.
Historie se rozdělí do sedmidenních **UTC** úseků; jeden běh má ve výchozím
nastavení povolen pouze **jeden** nový úsek, `--max-windows 4` je tvrdý
strop. Každý úsek je samostatný SELECT-only report. Spuštění lze opakovat:
ověřené, již existující reporty se bezpečně přeskočí. Není zde žádný
automatický plánovač, timer ani DB writer.

**Nejdřív ověř oprávnění účtu a jeden krátký report podle návodu výše.**
Účet musí mít pouze povolená čtecí oprávnění (viz výše). Výjimka
z tabulkové granularizace je **jen původní schéma** pro existující dev účet;
globální SELECT a přístup k celému referenčnímu schématu se zamítají.
Pro skutečné zpracování používej privátní adresář, např.:
```bash
install -d -o loucka -g loucka -m 0700 /var/lib/loucka-qc

# Bez DB přístupu ukáže, co bude další práce:
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-batch.mjs \
  --from 2009-01-01T00:00:00Z --to 2026-11-10T00:00:00Z \
  --output-dir /var/lib/loucka-qc --dry-run

# Po schválení jednorázové QC diagnostiky:
systemd-run --wait --pipe --collect \
  -p User=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict \
  -p ProtectHome=read-only -p ReadWritePaths=/var/lib/loucka-qc \
  /usr/bin/node /home/loucka/Loucka_weather/api/scripts/qc-batch.mjs \
  --from 2009-01-01T00:00:00Z --to 2026-11-10T00:00:00Z \
  --output-dir /var/lib/loucka-qc --max-windows 1

# Souhrn pouze z již vytvořených soukromých JSON reportů:
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-batch.mjs \
  --from 2009-01-01T00:00:00Z --to 2026-11-10T00:00:00Z \
  --output-dir /var/lib/loucka-qc --summary
```

**Výstupy:** soubory `qc_*.json` pouze pro uživatele `loucka` (0600),
adresář (0700), `--summary` vrací počty zjištění, kategorizaci vad a
spolehlivost podle jednotlivých stanic. Žádný výstup se neposílá na
veřejný web ani nezakládá nové DB záznamy. Lockfile brání současným běhům;
při přerušení násilím zkontroluj, že neběží QC proces, než odstraníš případný
zbylý `.qc-batch.lock`. Po změně konfigurace zdrojů/QC verze reporty
nejdřív samostatně přehodnotit, nelze je automaticky považovat za aktuální.

**Známé meze:** okna jsou nezávislá a UTC; 6hodinová konstantní řada
přes hranici dvou týdnů nemusí být v prvním reportu plně odhalena.
Před finální certifikací nutno kontrolovat i sousední úseky, DST a
historii změn stanice. `matchedPairs` není počet nezávislých dní.
Sumy klimatologie a roční průměry se tímto nástrojem nemění; jde jen o
vstupní kontrolu dat před samostatným schvalovacím procesem.

## Opatrný plánovaný screening (systemd, pouze staging, 10. 11. 2026)

Dva soubory v `deploy/lxc/loucka-qc-batch.service` a
`deploy/lxc/loucka-qc-batch.timer` **nejsou nasazené samy o sobě**.
Aktivace je vědomý provozní krok na staging LXC až po úspěšném
jednorázovém `systemd-run` s reálnými daty. Ověřeno na stagingu:
2017-05-13 až 2017-05-20 (Loučka 0, LuhaMet 2016)
a 2026-10-10 až 2026-10-11 (Loučka 288, LuhaMet 287,
ILOUKA4 288; žádné odmítnuté záznamy). Hodnocení strong ve druhém
okně neprokazuje dlouhodobou kalibraci stanic.

Timer plánuje nejvýše **jeden nový sedmidenní UTC úsek za 15 minut**,
s 0–120s náhodným odkladem; žádný souběh stejné systemd služby.
Služba má 256M limit paměti, 50% limit CPU a maximálně 120 sekund na běh,
startuje jako `loucka` bez zvýšených oprávnění, s root-owned `qc.env`
a jediným zapisovatelným adresářem `/var/lib/loucka-qc`.
Příkaz používá fixní rozsah **2009-01-01T00:00:00Z až 2026-11-10T00:00:00Z**:
nové dny po tomto cutoffu se automaticky nepřidávají, aby bylo
auditní období a názvy reportů deterministické. Po dokončení vypni timer
nebo explicitně naplánuj další audit.

### Ruční instalace jednotek na staging LXC

```bash
set -euo pipefail
test -f /etc/loucka-weather/qc.env
test "$(stat -c '%U:%G %a' /etc/loucka-weather/qc.env)" = "root:root 600"
test "$(stat -c '%U:%G %a' /var/lib/loucka-qc)" = "loucka:loucka 700"
runuser -u loucka -- git -C /home/loucka/Loucka_weather rev-parse --short HEAD

install -o root -g root -m 0644   /home/loucka/Loucka_weather/deploy/lxc/loucka-qc-batch.service   /etc/systemd/system/loucka-qc-batch.service
install -o root -g root -m 0644   /home/loucka/Loucka_weather/deploy/lxc/loucka-qc-batch.timer   /etc/systemd/system/loucka-qc-batch.timer
systemd-analyze verify /etc/systemd/system/loucka-qc-batch.service   /etc/systemd/system/loucka-qc-batch.timer
systemctl daemon-reload

# Nejprve jediný ruční běh a kontrola výsledku.
systemctl start loucka-qc-batch.service
systemctl show loucka-qc-batch.service -p Result -p ExecMainStatus -p ActiveState
journalctl -u loucka-qc-batch.service -n 30 --no-pager

# Teprve pokud je výsledek vyhovující, zapni plánovač:
systemctl enable --now loucka-qc-batch.timer
systemctl list-timers --all loucka-qc-batch.timer
```

### Sledování a zastavení

```bash
systemctl status loucka-qc-batch.timer --no-pager
journalctl -u loucka-qc-batch.service -n 50 --no-pager
runuser -u loucka -- /usr/bin/node   /home/loucka/Loucka_weather/api/scripts/qc-batch.mjs   --from 2009-01-01T00:00:00Z --to 2026-11-10T00:00:00Z   --output-dir /var/lib/loucka-qc --summary

# Kdykoli lze zastavit plánované skeny, JSON reporty zůstanou:
systemctl disable --now loucka-qc-batch.timer
```

`pendingWindows=0` značí dokončení všech plánovaných úseků
(v rozsahu tohoto pevného cutoffu), **ne** schválení rekonstrukce.
Dvě dřívější namátkově zvolená časová okna nesouhlasí s týdenní
mřížkou začínající 2009-01-01; při souhrnu celé historie se proto
nepočítají mezi dokončená okna. To je očekávané, nikoli ztráta dat.

Pokud služba selže, zůstává u posledního správně dokončeného JSON;
žádné porušené/neúplné období se neoznačí jako hotové. Před obnovením
plánovaného provozu prověř chybu a případné zaseknuté `.qc-batch.lock`.
Dílčí `--summary` není diagnostikou dlouhodobého bias/MAE;
před ručním schválením je nutné otevřít detail konkrétního JSON reportu.
Referenční stanice se nikdy nepřepisují jako vlastní měření Loučky.
