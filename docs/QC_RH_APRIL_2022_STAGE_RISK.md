# Počasí Loučka — audit historických dubnových návrhů RH 2022

**Datum:** 11. listopadu 2026. **Režim:** pouze čtení produkčního
archivu a existujících návrhů `loucka_reconstruction`.
**Žádná oprava RH nebyla schválena ani provedena.**

## Rozsah a původ důkazů

Audit vychází z tabulky
`loucka_reconstruction.reconstruction_humidity_202204` s
**3 734** již dříve vytvořenými řádky metody
`dual_vapor_pressure_v1`. Všechna porovnání vůči původním
měřením používají **pouze**
`pocasi-loucka.eu.archive`; **nikdy**
`loucka_reconstruction.archive` jako nezávislý originál.

Přímé `SELECT` srovnání všech 3 734 staging řádků s produkčním
archivem přes `target_time=dateTime` prokázalo:

- **0** chybějících produkčních řádků;
- **0** nesouhlasů mezi původní RH v archive a staging;
- **0** případů, kdy `missing` má v původním archivu přítomnou RH;
- **0** případů, kdy `frozen` má původní RH `NULL`;
- **0** změn původní teploty vůči `local_temperature_c`
  nad 0,01 °C (všechny nenulové hodnoty se v tomto datasetu shodují);
- všechny spárované produkční řádky mají `usUnits=16`.

To dokládá **konzistenci provenance a časových klíčů**.
Nedokládá to, že původní podezřele zamrzlé RH byly meteorologicky správné,
ani že starý návrhový algoritmus poskytuje správnou náhradní RH.

## Co bylo v původním stagingu

| Původní typ | Stav | Počet | Význam |
|---|---|---:|---|
| `frozen` | `estimate_ready` | 2 194 | starší odhad pro podezřele zamrzlé čidlo |
| `missing` | `estimate_ready` | 1 299 | starší odhad pro původní RH = NULL |
| `missing` | `missing_unresolved` | 156 | nebyl připraven odhad |
| `frozen` | `invalidate_frozen` | 85 | dříve navržené zneplatnění měření |

Celkem návrhů s existující nenulovou odhadnutou RH: **3 493**;
zbývajících **241** nemá odhad a již ve staré tabulce je označeno
jako nevyřešené nebo určené k prověření zneplatnění.

### Nezávislé výstražné příznaky

| Skupina | Rozdíl LuhaMet–WU nad 10 p. b. | Rozdíl nad 20 p. b. | Starý odhad víc než 10 p. b. mimo interval obou referencí |
|---|---:|---:|---:|
| `missing/estimate_ready` | **438 / 1 299** | 54 | 9 |
| `frozen/estimate_ready` | 157 / 2 194 | 36 | 50 |
| `missing/missing_unresolved` | 81 / 156 | 26 | — |
| `frozen/invalidate_frozen` | 22 / 85 | 1 | — |

Poslední dva řádky mají i chybějící referenční pozorování:
u `missing_unresolved` je 24/156 se scházejícími nebo
neplatnými dvěma referencemi, u `invalidate_frozen` 33/85.

**Pozor na sčítání:** výstražné příznaky se mohou překrývat.
Například rozdíl nad 20 p. b. je zároveň rozdílem nad 10 p. b.

### Výhradně screeningové, vzájemně se nevylučující další důvody vs. pracovní kategorie

Podle reprodukovatelného pořadí pravidel (všech **3 734** záznamů,
každý patří do **právě jedné** kategorie):

| Kategorie | Počet |
|---|---:|
| `frozen_sensor_requires_review` | 2 194 |
| `frozen_invalidation_requires_review` | 85 |
| `missing_unresolved` | 156 |
| `missing_reference_conflict_over_20pp` | 54 |
| `missing_reference_conflict_over_10pp` | 384 |
| `missing_proposal_outside_reference_band` | 9 |
| `missing_references_agree_unvalidated` | **852** |

**852 není počet schválených oprav!** Jde pouze o již existující
odhad pro `outHumidity=NULL`, kde obě reference souhlasí do
10 p. b. a odhad není vzdálen o více než 10 p. b. mimo jejich
vzájemné rozpětí. Zůstává **bez lokální nezávislé validace**.
Na tento podklad není možné zpětně převést status
`estimate_ready` na stav opravňující k zápisu.

## Diagnostika podezřelého čidla

U 2 279 `frozen` řádků bylo jen **9 odlišných původních RH**;
nejčastější 89 % (474×), 75 % (469×), 78 % (450×).
Přímá čtecí analýza po časově souvislých 5min slotech odhalila
následující nejdelší sekvence:

| RH | Slotů | Doba | Začátek UTC | Konec UTC |
|---:|---:|---:|---|---|
| 89 % | 474 | 39,50 h | 2022-04-05 18:35 | 2022-04-07 10:00 |
| 75 % | 469 | 39,08 h | 2022-04-22 16:10 | 2022-04-24 07:10 |
| 78 % | 450 | 37,50 h | 2022-04-09 17:30 | 2022-04-11 06:55 |
| 80 % | 234 | 19,50 h | 2022-04-20 22:40 | 2022-04-21 18:05 |

Tak dlouhé konstantní hodnoty jsou silně podezřelé, ale nejsou
důkazem správné „náhradní hodnoty“. Počet slotů znamená měření
po pěti minutách; souvislé období začíná prvním časem a končí
posledním časem (doba `sloty × 5 min` zahrnuje i poslední interval).

## UTC je podstatné

Staging pokrývá přesně **21 kalendářních dnů UTC** v dubnu,
ačkoliv bylo datum některých SQL souhrnů dříve interpretováno
pomocí `DATE(FROM_UNIXTIME(target_time))`. Funkce `FROM_UNIXTIME`
zohledňuje časové pásmo databázové session, takže například na
hraně dne může vracet **jiný kalendářní den než UTC**.

Nový reprodukovatelný dotaz používá
`FLOOR(target_time / 86400)` a denní souhrny nazývá výslovně
`utcDayIndex`. Je to důležité při párování originálního WeeWX
se zdroji LuhaMet a ILOUKA4.

## Navazující vývoj a bezpečnost

`api/scripts/qc-rh-april-stage-risk-lib.mjs` je **čistá funkce**,
která přijme kandidáta a odpovídající *originální* archivní řádek.
Fail-closed ověří čas, `usUnits=16`, datum, zdrojovou RH,
zdrojovou teplotu, kombinaci `defect_type` + `decision`,
stav starého odhadu a kvalitu referencí. Vrací jen
`riskCategory`, nezávislé `riskFlags`, typ problému
a `reviewState=needs_manual_review`,
`automaticWriteAllowed=false`, `replacementRhPct=null`.
**Nevystavuje ani nově nevypočítává náhradní číselnou RH**.

Dále `api/scripts/qc-rh-april-2022-stage-audit.sql`
obsahuje čtyři transparentní **SELECT-only** dotazy pro
kontrolu provenance, vzájemně výlučnou klasifikaci,
UTC denní přehled a hledání souvislých zamrzlých sekvencí.
Je přímo použitelný přes připojenou čtecí databázovou integraci.
Není nutné vyžadovat další SSH/LXC příkazy.

Doporučené pořadí další práce:
1. Odděleně vyhodnotit **852** předběžně souhlasných kandidátů RH NULL,
   ale bez schválení či doplnění.
2. Prozkoumat **438** návrhů s rozporuplnými referencemi,
   zvláště 54 extrémně rozporných (rozdíl nad 20 p. b.).
3. Staré `frozen` úseky nikdy nepoužívat jako ground truth
   pro trénování odchylky referenčních stanic.
4. U skutečných RH měření na stejných UTC slotech pokračovat
   výhradně v blokované validaci bez data leakage.

**Nedotčena:** produkční `pocasi-loucka.eu.archive`,
rekonstrukční `loucka_reconstruction.archive`,
pracovní staging tabulka ani jakékoliv schvalovací stavy
či veřejný web.
