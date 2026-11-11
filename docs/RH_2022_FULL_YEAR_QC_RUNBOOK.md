# RH 2022 – jeden ucelený celoroční technický audit (read-only)

**Provozní výsledek:** Operátor 11. 11. 2026 dokončil 73/73 oken a 12/12 offline testů; čistě čtecí roční report obsahuje 104 142 originálních řádků, 977 mezer v dotazovatelných UTC slotech, 5 153/5 153 historických zásahů, 41 727 RH NULL po experimentálních změnách a 7 orientačních rychlých skoků. **Znovu nespouštět bez nového zdroje dat nebo konkrétního rozporu.** Interpretace a další krok jsou v [RH_2022_ANNUAL_FINDINGS_2026-11-11.md](RH_2022_ANNUAL_FINDINGS_2026-11-11.md). Následuje čistě offline spojení se starou RH readiness evidencí, nikoli další sken 73 oken.

**Výchozí stav, 11. 11. 2026:** izolovaný operátorský sidecar RH 2022 na 127.0.0.1:3101 byl provozně ověřen operátorem (health/ready/UI 200, bez tokenu 401, původní API 3100 HTTP 200). Dosavadní pět dní 26.–30. 4. 2022: 1 438 originálních archivních řádků, přesně 2 chybějící celé pětiminutové UTC sloty, 166 existujících RH NULL bez odhadu, 1 272 experimentálních NULL→odhadů, žádné 20 p. b. skoky. Tento výsledek je **technická integrita a pokrytí**, nikoli meteorologická validace.

## Jediný navazující běh pro celý rok

Po sloučení PR do `main`, na dev LXC jako root:

```bash
set -euo pipefail
REPO=/home/loucka/Loucka_weather
runuser -u loucka -- git -C "$REPO" pull --ff-only origin main

# Offline testy obou auditorů; žádné spojení s DB.
python3 -m unittest discover -s "$REPO/deploy/lxc/tests" -p 'test_rh_*audit.py' -v

# 73 navazujících 5denních read-only GET proti lokálnímu chráněnému sidecaru.
python3 "$REPO/deploy/lxc/audit-rh-2022-year.py" --year 2022
```

Skript nepotřebuje znovu buildovat API ani restartovat službu. **Nevytváří cron/timer**, nic nemění v MariaDB, WeeWX, `loucka_reconstruction`, API 3100, Nginx ani veřejném webu. Z LXC provede přesně 73 sekvenčních, jednotlivě omezených HTTP GET požadavků na `127.0.0.1:3101`, se záměrnou nejméně 1,5s prodlevou mezi požadavky. Veškerá data pocházejí z SELECT-only sidecaru a neměnného privátního exportu, přístupový token se nikdy nevypíše. Tento celoroční čtecí audit není náročný benchmark, ale čte až cca 105 tisíc původních intervalových řádků; neběží opakovaně automaticky. Při HTTP chybě, nesouladu pinovaného balíčku nebo neúplném počtu změn se ukončí bez označení reportu jako kompletního.

### Přesná hranice prvního záznamu

WeeWX ukládá `dateTime` jako **konec** intervalu `(start,end]`. Privátní endpoint požaduje `from >= 2022-01-01T00:00:00Z` a dotazuje výhradně `(from,to]`. Proto nelze touto API verzí přečíst **první koncový bod `2022-01-01T00:00:00Z`**. Skript auditue zbývajících **105 119 očekávaných pětiminutových UTC slotů** od 00:05 1. 1. 2022 do 23:55 31. 12. 2022. Počet 5153 historických změn musí přesně odpovídat pinovanému balíčku (2 874 NULL→odhad, 2 194 podezřelá RH→odhad, 85 invalidací). Pokud první nepřístupný slot byl součástí změn nebo se data po exportu změnila, audit správně skončí s chybou; první bod se musí ověřit samostatně read-only a nikdy jej nesmíme považovat za skrytě pokrytý.

### Výsledky a další skutečný rozhodovací krok

Příkaz postupně vypisuje průběh po 10 blocích a nakonec **jeden roční souhrn**, dvanáct měsíčních řádků, deset nejproblematičtějších UTC dní a cestu k podrobnému soukromému JSON reportu s právy 0600 v adresáři 0700:

`/var/lib/loucka-qc/rh-preview-audit-reports/`

Rozlišuje skutečně chybějící celé časové intervaly, existující RH NULL bez odhadu, zachovaná původní měření, experimentální nahrazení, historická zneplatnění, atypické délky intervalů, případné časové offsety, podezřelé 5min skoky a pokrytí po měsících. Podrobné časové seznamy, záznamové SHA a provenience **zůstávají na LXC**, do chatu či veřejného GitHubu sdílet pouze stdout souhrn. Jeden report se vytvoří pouze při úplném běhu.

**Po tomto běhu nepokračovat dalšími náhodnými pětidenními kontrolami.** Z výsledků ročního auditu zvolit přímo:
1. Celoroční pokrytí a integrita: vyznačit měsíce a celé intervaly, které skutečně chybějí, a rozhodnout, zda je vůbec možné je rekonstruovat z jiných původních záloh/senzorů.
2. Všechny stále nevyplněné RH: seskupit dle navazujících časových úseků a důvodů z QC tabulek; nehádat chybějící zdroj bez důkazu.
3. Nezávislá meteorologická kontrola odhadů proti časově spárovaným referencím LuhaMet a ILOUKA4 (QC nulových sentinelů, ±150s párování, pokrytí a bias/MAE/RMSE na vhodné nezávislé sadě).
4. Teprve po odborné revizi rozhodovat o schválení jednotlivých hodnot nebo o jiném dalším období. **Roční technická úplnost není meteorologické schválení** a žádný automatický přepis produkčních hodnot se neděje.

## Ověření

Offline testy `deploy/lxc/tests/test_rh_2022_full_year_audit.py` kontrolují 73 přesných navazujících časových oken, syntetický rok s přesně 5153 změnami, rozlišení NULL a chybějících celých intervalů, fail-closed při neúplné dávce i při výměně privátního balíčku. Kód je testován v GitHub Actions bez přístupu k databázi; skutečný výsledek na LXC je oddělený.
