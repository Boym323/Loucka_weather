# Duben 2022 – rozhodovací filtr Magnus, nikoli další plošná rekonstrukce

**12. 11. 2026.** Navazuje na potvrzený celoroční technický audit RH a
[issue #107](https://github.com/Boym323/Loucka_weather/issues/107). Tento krok
zodpovídá konkrétní otázku: které dřívější dubnové návrhy vůbec stojí za
ruční posouzení? Nejde o schvalovací proces. Žádný nový odhad, zápis,
publikace ani další plošný roční sken nebyl proveden.

## Skutečné čtecí výsledky

Historický dubnový vzorec `dual_vapor_pressure_v1` byl již reprodukován
u všech 3 493 numerických návrhů: průměr dvou RH přenesených metodou
Magnus na původní lokální teplotu, omezení 1–100 % a zaokrouhlení
na dvě desetinná místa. Funkce g(T)=17,62 T/(243,12+T).
Každý přenos je RH_reference × exp(g(T_reference)−g(T_local)).

Červencová retrospektivní zkouška stejného vzorce dopadla hůře než
samotná WU (MAE 7,686 vs 6,112 p. b. na 7 481 společných vzorcích).
Metodu proto nepřenášet plošně mimo ověřované období.

### Přísný pracovní filtr

Zvolené konzervativní hranice nejsou předem odborně validované:
- surové RH obou referencí se liší nejvýše o 10 p. b.;
- uložený odhad leží nejvýše 10 p. b. mimo rozpětí surových RH;
- rozdíl obou teplotně přenesených RH nejvýše 5 p. b.;
- odchylka každé referenční teploty od lokální nejvýše 3 °C;
- výsledek bez ořezání do rozsahu 1–100 %; kontrola historické formule.

Stejný filtr byl retrospektivně vyhodnocen na původních naměřených RH
v šesti nepřekrývajících se pětidenních UTC oknech. Vyžaduje metrické
originální záznamy `usUnits=16`, RH 1–100, teploty −60 až 60 °C,
jedinečné referenční měření do ±30 s od pětiminutového slotu,
`quality_status=reference_only`. Ze všech kontrol byly vyloučeny známé
frozen sloty dubnového stagingu (nepoužívat zamrzlé čidlo jako truth).
Omezené read-only SQL je v `deploy/lxc/rh-april-magnus-review.sql`.

| Vzorek | N | Dny | MAE Magnus | RMSE Magnus | MAE WU | Chyby Magnus >15 p. b. |
|---|---:|---:|---:|---:|---:|---:|
| Všechny kontrolní trojice | 4 752 | 22 | 2,173 | 3,134 | 3,131 | 25 |
| Přísný filtr | 2 043 | 22 | 1,819 | 2,849 | 2,155 | 11 |

V přísné skupině je 114 chyb >5 p. b., 33 >10 p. b.,
11 >15 p. b., maximum 19,17 p. b. Bias −0,364 p. b.
Nižší MAE u vybrané skupiny není důkazem kauzálního zlepšení
ani intervalem spolehlivosti pro konkrétní chybějící záznam.
Výběr i porovnání jsou retrospektivní, bez nezávislého out-of-time
testu vůči původnímu modelu; kontrolní vzorky jsou časově závislé.

### Historické návrhy

Přímý SELECT nad existujícím stagingem (3 734 řádků) ukázal
následující vzájemně výlučné kategorie; starý staging a originál
již byly samostatně spárovány a ověřeny v
[QC_RH_APRIL_2022_STAGE_RISK.md](QC_RH_APRIL_2022_STAGE_RISK.md).
Všech 3 493 numerických odhadů odpovídá uložené formuli.

| Kategorie | Původní RH NULL | Původní frozen RH |
|---|---:|---:|
| Rozdíl surových referencí >10 p. b. | 438 | 157 |
| Mimo surové referenční pásmo o >10 p. b. | 9 | 50 |
| Rozdíl přenesených RH >5 p. b. | 564 | 806 |
| Teplotní vzdálenost >3 °C | 3 | 41 |
| Přísný pracovní filtr | **285** | **1 140** |
| Celkem numerických odhadů | 1 299 | 2 194 |

Dalších 156 missing unresolved a 85 frozen invalidací nemá
historický numerický odhad. Nejsou kandidáty pro tento model.

## Skutečný rozhodovací výsledek: nestačí ani shoda referencí

Nový modul `deploy/lxc/rh-april-magnus-review.mjs` doplňuje
původní risk classification, nemění ji. Vyžaduje nejméně 24
původních kontrolních vzorků ve stejném UTC dni a ve stejné
přísné skupině. Priorita ruční revize navíc vyžaduje denní
MAE Magnus ≤5 p. b. a přísně nižší MAE než samotná WU.
Jde o pracovní pořadí, nikoli statistický důkaz; 24 vzorků
po pěti minutách není 24 nezávislých pozorování.

Výsledky odvozené ze skutečných denních agregátů SQL a počtů
historických kandidátů:

| Po přísném filtru | Původní RH NULL | Frozen RH |
|---|---:|---:|
| Bez dostatečných stejnodenních kontrol | 281 | 574 |
| Stejnodenní model nesplňuje pracovní hranici | 4 | 302 |
| Prioritní ruční revize | **0** | **264** |
| Celkem | 285 | 1 140 |

Všech 281 nejlepších missing návrhů bez kontrol leží 26.–30. dubna.
Čtyři další jsou 25. dubna; tento den má 152 přísných kontrol,
MAE Magnus 5,314 vs WU 4,599 p. b. Proto ani tyto čtyři
nezískaly prioritu. Prioritních 264 frozen záznamů leží 7.,
9., 11. a 17. dubna (65, 124, 59, 16). Jejich původní RH je
podezřelá, nikoli validní ground truth; ruční revize musí posoudit
i průběh čidla, nikoli jen numerický odhad.

**Rozhodnutí:** Žádná nová missing RH se tímto postupem nedoplňuje.
Neopakovat obecný roční audit. V atlasu pracovat s původními daty
a transparentní dostupností; případné budoucí přijetí odhadu
řešit samostatně, s auditní stopou a výslovným souhlasem.

## Kód, použití a bezpečnost

Modul je čistá funkce využívající již existující
`api/scripts/qc-rh-april-stage-risk-lib.mjs`. Přebírá existující
staging řádek, originální archivní řádek a volitelný denní
agregát získaný výhradně druhým SELECT dotazem (jen skupina strict).
Vstup denního agregátu musí uvádět `utcDay`, `source:
original_archive_excluding_known_frozen`, `gate: strict`, `n`,
`sumAbsoluteError`, `sumWuAbsoluteError`. `utcDay` se odvodí
z UTC epoch day indexu (násobek 86400), ne z DB session time zone.
Dávková funkce `buildAprilMagnusReview` kontroluje duplicity,
počet záznamů a původ jednotlivých kandidátů, vrací jen metadata,
žádné náhradní číselné RH. Vstupní denní evidence musí pocházet
ze skutečného SELECT, její původ nelze prokázat pouhým názvem pole.

Testy: `node --test deploy/lxc/tests/rh-april-magnus-review.test.mjs`.
Samostatné CI bez DB a bez závislostí. Modul zatím není napojen
na runtime sidecar, žádný nový endpoint ani automatický timer.
Není nutné na LXC spouštět další audit. Produkční archive,
`loucka_reconstruction`, původní staging a privátní balíčky
zůstávají nedotčené.
