# RH 2022 — celoroční audit dokončen, rozhodovací krok nad existujícími důkazy

**Datum:** 11. 11. 2026. **Zdroj:** stdout kompletního operátorského běhu na dev LXC, nikoli nové měření v tomto repozitáři. Kód a runtime sidecar jsou oddělené od produkčního WeeWX. **Data a experimentální hodnoty zůstávají neschválené.**

## Rok 2022, read-only technický souhrn

Operátor potvrdil `12/12` offline testů a `73/73` navazujících chráněných pětidenních dotazů. Kontroly neměnného balíčku, pořadí časů a všech historických změn prošly.

| Zjištění | Ověřená hodnota |
|---|---:|
| Celkem teoreticky pětiminutových UTC slotů v roce 2022 | 105 120 |
| Dotazovatelné sloty přes privátní API (první 00:00Z vyloučen) | **105 119** |
| Původní archive řádky v dotazovatelných slotech | **104 142** |
| Chybějící celé sloty v dotazovatelných slotech | **977** |
| Historicky zjištěné celé výpadky ve všech 105 120 slotech | **978** |
| Původní RH NULL (existující archivní řádky) | **44 516** |
| Původní ne-NULL RH (včetně podezřelých čidlových období) | **59 626** |
| Původně NULL → experimentální RH | **2 874** |
| Podezřelá původní RH → experimentální RH | **2 194** |
| Historicky invalidovaná RH → NULL | **85** |
| Celkem historických změn v privátním balíčku | **5 153** |
| Neschválený rekonstruovaný náhled RH NULL | **41 727** |
| Neschválený náhled RH s číselnou hodnotou | **62 415** |
| Pětiminutové skoky RH >=20 p. b. k revizi | **7** |
| Nejdelší souvislá nevyplněná sekvence RH | **4 658 slotů (~16,17 dne)** |

**Nezaměňovat 977 a 978:** privátní Fastify sidecar má `(from,to]` a odmítá `from < 2022-01-01T00:00:00Z`; pětiminutový koncový bod `2022-01-01 00:00 UTC` tak není jeho součástí. Dřívější celoroční QC ho posuzuje a vykazuje 978 chybějících celých slotů. Shoda součtů dvou metod naznačuje, že vynechaná hranice byla chybějící; nová soukromá API kontrola tohoto jediného hraničního bodu však neproběhla a nesmí se předstírat.

| UTC měsíc | Archivní řádky | RH NULL po starém náhledu | Historické zásahy | Chybějící celé sloty (rozsah API) |
|---|---:|---:|---:|---:|
| 2022-01 | 8 499 | 8 485 | 0 | 428 |
| 2022-02 | 8 058 | 8 058 | 0 | 6 |
| 2022-03 | 8 681 | 6 980 | 1 023 | 247 |
| 2022-04 | 8 633 | 265 | 3 578 | 7 |
| 2022-05 | 8 902 | 8 851 | 0 | 26 |
| 2022-06 | 8 577 | 8 379 | 0 | 63 |
| 2022-07 | 8 893 | 702 | 552 | 35 |
| 2022-08 | 8 840 | 0 | 0 | 88 |
| 2022-09 | 8 614 | 2 | 0 | 26 |
| 2022-10 | 8 892 | 5 | 0 | 36 |
| 2022-11 | 8 634 | 0 | 0 | 6 |
| 2022-12 | 8 919 | 0 | 0 | 9 |

**Význam:** technická integrita je potvrzená, ale 5 153 odhadovaných/změněných RH není soubor 5 153 meteorologicky ověřených měření. Původní čidlo v dubnu bylo podle existujícího QC zčásti zamrzlé, historický holdout má v lednu–březnu a květnu–červnu nedostatek vlastních referenčních měření. Proto nelze souhlas dvou vzdálených stanic prohlásit za potvrzení místního odhadu.

## Co bylo hotové již před tímto auditním kolem

- [QC_RH_2022_READONLY.md](QC_RH_2022_READONLY.md): 365 denních výřezů originálu vs. LuhaMet + ILOUKA4, s časovou kontrolou a omezenou shodou referencí.
- [QC_RH_TRIPLETS_2022.md](QC_RH_TRIPLETS_2022.md): stejně časově spárované trojice skutečné původní RH a obou referencí.
- [QC_RH_HOLDOUT_2022.md](QC_RH_HOLDOUT_2022.md): retrospektivní blokované leave-one-day-out, nepoužívá rekonstruované RH jako pravdu.
- [QC_RH_READINESS_2022.md](QC_RH_READINESS_2022.md): rozhodovací gate po měsících, podložený privátním triage/triplets/holdout; ve 2022 nebyl automaticky schválen žádný měsíc.
- [QC_RH_APRIL_2022_STAGE_RISK.md](QC_RH_APRIL_2022_STAGE_RISK.md): 3 578 dříve aplikovaných dubnových změn a starší staging rizika referenčního nesouhlasu.

**Není důvod tyto analýzy znovu spouštět proti MariaDB jen proto, že existuje nový graf.**

## Následující jediný offline rozhodovací krok

Připraven `deploy/lxc/rh-2022-evidence-brief.py`: bezpečně přečte *pouze* hotový root-only roční JSON a již vytvořený `qc-rh-2022-readiness.json`. Nečte DB, nečte privátní HTTP API ani bearer token, negeneruje žádné náhradní RH a nic nezapisuje.

Na dev LXC po aktualizaci `main` jako root:

```bash
python3 /home/loucka/Loucka_weather/deploy/lxc/rh-2022-evidence-brief.py --brief
```

Před tím **není třeba spouštět další 73dotazový audit, ani QC daily scans**. Skript kontroluje původní NULL v obou nezávislých evidencích, chybějící celé sloty včetně výjimky první UTC hranice, počty historických zásahů, měsíční součty a označení `needs_manual_review`. Při jakékoli neshodě **skončí chybou**. Výsledkem je bezpečná veřejně sdělitelná tabulka měsíčních gate a priorit, nikoli automatické schválení.

Pokud starý soukromý readiness report fyzicky chybí, **nekonstruovat jej z odhadů**. Nejprve ověřit existující soubory RH triage/triplets/holdout, případně přegenerovat pouze odvozený readiness report již připraveným offline nástrojem `api/scripts/qc-rh-readiness.mjs` dle jeho původní dokumentace. Opět žádná DB mutace.

## Rozhodnutí, které bude po tomto kroku skutečně potřeba

1. Leden–únor a květen–červen: bez nezávislých původních RH záloh **blokovat automatické doplňování**, vyhledat jen věrohodné originální zdroje.
2. Březen, duben, červenec: soustředit se na **kvalitu přesně 5 153 existujících historických zásahů** a staré rizikové příznaky. Zejména dubnový archiv má 3 578 změn, včetně 85 invalidací.
3. Zbývající měsíce: nepřepisovat dostupná měření; řešit pouze výjimečné NULL a samostatné chybějící celé intervaly.
4. Sedm označených skoků: prošetřit v kontextu sousedních skutečných meteorologických měření, neautomaticky „opravovat“.

**Stále zakázáno:** UPDATE/INSERT/DELETE původního `pocasi-loucka.eu.archive`, automatické publikování do veřejného atlasu, neověřená reference jako lokální naměřené RH.
