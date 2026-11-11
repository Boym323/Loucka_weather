# RH 2022 — původ, stav a ověřitelnost již existujících rekonstrukčních změn

**Audit:** 11. listopadu 2026, přímé `SELECT` přes dostupnou integraci
MariaDB. V tomto auditu **nebyl** proveden žádný INSERT, UPDATE,
DELETE, korekční batch ani změna původního archivu.
Srovnává se výhradně původní
`pocasi-loucka.eu.archive` s
`loucka_reconstruction.archive` a
`loucka_reconstruction.reconstruction_changes`.

## Co je v rekonstrukční databázi už nyní

Za celé UTC období 2022-01-01 až 2023-01-01 má původní a
rekonstrukční archiv stejných **104 142 časových záznamů**.

| Stav | Původní archive | Rekonstrukční archive |
|---|---:|---:|
| `outHumidity IS NULL` | **44 516** | **41 727** |
| `outHumidity` v rozsahu 1–100 % | **59 626** | **62 415** |

Tento rozdíl lze přesně rozložit na už dříve **aplikované
změny jen v rekonstrukčním schématu**:

| UTC měsíc | Dříve NULL → odhadnutá RH | Původně nenulová → jiná RH | Původně nenulová → NULL |
|---|---:|---:|---:|
| Březen 2022 | 1 023 | 0 | 0 |
| Duben 2022 | 1 299 | 2 194 | 85 |
| Červenec 2022 | 552 | 0 | 0 |
| **Celkem** | **2 874** | **2 194** | **85** |

Kontrola aritmetiky: `44 516 - 2 874 + 85 = 41 727`
zbývajících RH NULL v rekonstrukční kopii.

U změn **březen a červenec (1 575)** jsem samostatně ověřil
`reconstruction_changes` proti oběma archivům:
- původní produkční RH měla `NULL` u všech 1 575 časových značek;
- 0 ztracených produkčních řádků, 0 ztracených
  rekonstrukčních řádků;
- 0 rozdílů mezi uloženým `new_value` v auditní změně
  a aktuální RH v `loucka_reconstruction.archive`;
- všech 1 575 má `state='applied'` a
  `source_database='loucka_reconstruction'`.
  To je **auditní označení odhadované hodnoty**, nikoliv
  potvrzení nezávislého měření z místního loggeru.

Duben (3 578 aplikovaných změn) má samostatnou úplnou evidenci
v `reconstruction_humidity_202204` a detailním auditu
`docs/QC_RH_APRIL_2022_STAGE_RISK.md`.

## Metodika deklarovaná v auditních důvodech

| Období | Počet | Zjištěný starší postup |
|---|---:|---|
| Březen | **1 023** | Texty `ESTIMATED_EXTERNAL` uvádějí přenos RH metodou Magnus / tlaku nasycené vodní páry a úpravu −2 procentní body |
| Červenec | **280** | Vážené `0,8 × WU ILOUKA4 + 0,2 × LuhaMet − 3,5` p. b. |
| Červenec | **271** | `moderate v1` se stejným deklarovaným váženým vzorcem, ale odlišnými pravidly výběru |
| Červenec | **1** | Dřívější text neumožňuje bez dalšího určit metodiku |
| Duben | **3 493 odhadů + 85 zneplatnění** | `dual_vapor_pressure_v1` plus oddělené `invalidate_frozen` |

Dřívější auditní texty pro březen odkazují na
`Mar22 holdout 182 MAE 1.95pp` a červencové záznamy
na přibližné intervaly chyby.
**Tyto historické výroky nejsou ekvivalentní novému
blokovanému celoročnímu holdout testu** (±3 dny vynechání,
alespoň 500 trénovacích a 24 testovacích trojic).
Ten pro březen neměl **žádný den splňující podmínky**;
tvrzení dřívějšího experimentu vyžaduje samostatnou
reprodukci, nelze je bez důkazu převzít jako ověřené.

Auditní `source_value` není automaticky skutečná lokální RH.
Při přenosu vlhkosti/vážené korekci se od `new_value`
může a obvykle má lišit, proto se tyto položky nesmějí
považovat za důkaz původního lokálního měření.

## Význam pro portál a meteorologický atlas

V roce 2022 musíme nejméně rozlišovat:
- **původní RH naměřená v originálním archive**, mimo samostatně
  označené podezřelé zamrzlé úseky;
- **historicky odhadnutá RH** v rekonstrukčním archive,
  s přesným odkazem na starší metodu a auditní změnu;
- **záměrně zneplatněná zamrzlá RH** — v originálu
  existuje nenulová hodnota, ale pracovní rekonstrukční
  kopie ji má `NULL`;
- **nadále chybějící RH** — i v rekonstrukčním archive
  jde o `NULL` (41 727 záznamů).

Souhlas dvou vzdálených referencí není nezávislým
potvrzením lokálního měření. Zvláště leden až červen
nemají pro hlavní výpadky dostatečnou validaci.
Hodnoty v `loucka_reconstruction.archive` je proto
**nesprávné předkládat jako původní naměřené RH bez označení**.

## Následující bezpečný postup

1. Neprovádět další změny `archive` bez samostatného
   souhlasu uživatele. Bez jeho souhlasu neprovádět ani
   nové zásahy do rekonstrukční kopie.
2. Vygenerovat **read-only provenienční přehled**:
   čas UTC, původní hodnota, rekonstrukční stav,
   existující `reconstruction_changes.batch_key`,
   kategorie (measured / estimated / invalidated / missing)
   a nejistota — nikoli uživatele odvádět k hledání
   neznámých záloh.
3. Nezávisle validovat starší březnový a červencový model
   pouze na pravdivých existujících měřeních a stejných UTC
   slotech, bez použití již rekonstruovaných hodnot jako
   `ground truth`.
4. U plánovaných grafů a ročenek udržet samostatné vrstvy
   naměřených, rekonstruovaných a nevyřešených údajů.

**Důležitý limit:** `reconstruction_changes` dokládá
provenienci existujících zásahů, ale neprokazuje
meteorologickou správnost hodnot, a status `applied`
znamená pouze aplikaci **v rekonstrukční databázi**.
