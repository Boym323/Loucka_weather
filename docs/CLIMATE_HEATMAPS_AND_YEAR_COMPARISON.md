# Historické heatmapy a porovnání dvou let

## Umístění a zdroj
- Stránka `/klimatologie/#srovnani-let`, odkazy i z `/grafy/` a úvodního přehledu.
- Jde o **originální denní souhrny WeeWX**, `dataset=original`, `metricwx`, z existujícího veřejného API `/api/v1/history`.
- Požadavek pro každý rok: `resolution=daily`, hranice od místní půlnoci 1. ledna do půlnoci 1. ledna dalšího roku. Obě hranice se převádějí zvlášť pomocí `pragueMidnightIso()`, takže CET/CEST nezpůsobuje denní posuny.
- Na jednu kombinaci veličiny a rok probíhá jeden API dotaz do 1000 denních bodů. Načtení začíná až při vstupu sekce do viewportu. Neprovádí se 12 × 18 jednotlivých dotazů na měsíce.
- Cache je pouze v životnosti otevřené stránky a platí pro dokončené roky; aktuální rok se znovu načítá.

## Význam barev a výpočtů
- Stejná hodnota stejné veličiny má vždy stejný barevný interval napříč všemi roky. Pevná pravidla viz `comparisonMetrics`.
- Nulový součet srážek z platného denního souhrnu je platná nula. NULL, `missing`, `suspect`, chybějící datum a dosud nenaměřený den mají šrafovaný nebo prázdný vzhled, nikdy číslo 0.
- Neexistující data (např. 29. 2. 2025) vůbec nemají kalendářní buňku. Skutečný 29. únor zůstává samostatný mezi 28. 2. a 1. 3. v obouletém overlay grafu.
- Souhrn srovnání **pouze dnů společně dostupných v obou letech**:
  - pro `rain` součet jejich denních úhrnů;
  - ostatní veličiny aritmetický průměr denních agregátů za tyto společné dny (není to časově vážený roční průměr);
  - rozdíl = druhý minus první rok.
- Pokrytí vedle hodnot znamená počet denních záznamů s platnou hodnotou / počet kalendářních dní v roce. Není to potvrzení úplnosti časového pokrytí jednotlivých dnů ani kvality srážek.
- Srovnání celých roků s probíhajícím rokem je omezeno přirozeně na kalendářní dny, pro které existují hodnoty v obou letech.

## Limity a QC
- **Nikdy** nepovažovat souhrny `original` za auditované rekordy. Historické srážky a další senzory obsahují nevyhodnocené chyby; současné API denních souhrnů je zdroj, nikoli schválený rekonstruovaný dataset.
- Když denní API nedostupné, zobrazit prázdnou heatmapu a varování, ne ilustrativní měření.
- Nevykreslovat čáru přes chybějící dny (`connectNulls:false`).
- Zdrojová evidence bude možné v budoucnu přepnout na `dataset=approved` až po veřejném schválení rekonstrukce a publikaci tohoto datasetu v API; teď nepřepínat.
- Teploty jsou denní průměry, nikoli minutová minima/maxima. Srážky jsou denní úhrny, ne rainRate.

## Kontroly
- `frontend/tests/year-comparison.test.mjs`: pravidla kalendáře, CET/CEST, 29. únor, nulové srážky, missing/suspect, společné dny, pevné barvy.
- `frontend/scripts/year-comparison-browser-check.mjs`: izolovaná mock data v lokálním Chromiu na 390 a 1440 px, zátěž pro null/0/leap, ověření grafu, změny veličiny a tmavého motivu.
- `frontend/scripts/preview-visual-check.mjs`: ověří přítomnost rozhraní ve veřejném nasazení. Dělí se od mock browser testu a nenahrazuje kontrolu reálných dat.

## Klávesnice
V kalendáři Tab vstoupí na vybraný den, šipky vlevo/vpravo jdou mezi dny a šipky nahoru/dolů na odpovídající den sousedního měsíce (u kratšího měsíce se posunou na jeho poslední den). Home/End skáčou na začátek/konec roku. Každý rok má samostatný dosažitelný bod i při výběru 29. února v nepřestupném roce.
