# QC RH 2022 – sekundární třídění z 365 ověřených denních reportů

## Účel

Po úplném SELECT-only RH screeningu roku 2022 lze vyhodnotit 365 již
existujících soukromých JSON reportů a vytvořit pracovní frontu období pro
**ruční prověření**, aniž bychom znovu četli MariaDB. Odlišit: (a) vlastní
ne-NULL RH, (b) původní slot s RH NULL, (c) zcela chybějící archivní slot,
(d) chybějící RH se dvěma současnými referencemi. Výstup není rekonstrukcí.

## Kategorizace denních podkladů

- `shodne_reference_neoverena_kalibrace`: alespoň 144 NULL RH, obě
  reference jsou dostupné u alespoň 90 % NULL, shodují se do 10
  procentních bodů alespoň u 90 % společně dostupných NULL slotů, mezi
  referencemi alespoň 144 párů a celodenní MAE nejvýše 4 p. b.
  **Neznamená spolehlivost ani schválení náhradní vlhkosti!**
- `rozpor_referenci`: nejméně 96 společných referenčních slotů u chybějící
  RH a zároveň shoda pod 65 % nebo denní MAE mezi referencemi nad 10 p. b.
- `nedostatecne_reference`: pro NULL RH je dostupnost obou referencí pod 50 %.
- `smisene_podklady`: další dny se smíšeným srovnáním.
- `kratky_vypadek`: méně než 24 slotů RH NULL.
- `bez_null_rh`: den bez NULL RH (může mít jiné problémy, například chybějící
  celé záznamy).

Pravidla **neobsahují** ani jednotky odpovídající odhadované nové RH;
pracují pouze s počty, překryvem, shodou a chybou referenčních stanic.
Vše zůstává `reviewState=needs_manual_review`,
`automaticWriteAllowed=false`, `replacementRhPct=null`.

## Roční/měsíční konzistence

Generátor povinně zvaliduje všech 365 existujících soukromých denních
`qc-rh-2022-YYYY-MM-DD.json`. Jestliže se nějaký nedochoval, nelze jej
úmyslně přeskočit a zůstat „kompletní“. Také odmítá nesouhlasící rozklad
`RH NULL = obě reference + jedna reference + žádná reference`.

Pro každý měsíc vytvoří podíly dostupnosti a shody, měsíční vážený
`MAE` LuhaMet vs ILOUKA4, a samostatné `MAE` Loučka-vůči-referenci
**jen v době, kdy vlastní RH skutečně existuje**. Nulový překryv
znamená „nelze kalibrovat“, nikoli perfektní přesnost.

## Bezpečné spuštění na LXC (z root shellu)

Po aktualizaci projektu z `main`:

```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-triage.mjs \
  --reports-dir /var/lib/loucka-qc
```

Tento proces **vůbec nepoužívá síť ani přístupové údaje k databázi**,
nepotřebuje `qc.env`, nespouští žádné SQL. Nemění původní denní
důkazy, 932 historických QC reportů ani původní databázi.
V soukromé složce 0700 vytvoří odvozené soubory 0600:

- `qc-rh-2022-triage.json`: kompletní měsíční a denní třídy a
  vážené srovnání referencí.
- `qc-rh-2022-triage.csv`: 365 dnů, referenční shoda, vlastní RH,
  průměrné odchylky, bezpečnostní atributy. Pro Excel použij kódování UTF-8.

Kontrola:

```bash
stat -c '%U:%G %a %s %n' \
  /var/lib/loucka-qc/qc-rh-2022-triage.json \
  /var/lib/loucka-qc/qc-rh-2022-triage.csv
```

Pro Mac:

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-rh-2022-triage.csv ~/Downloads/
```

## Krok po ruční kontrole tříd

Zaměřit se hlavně na březen 2022, kdy jsou mezi LuhaMet a ILOUKA4
výrazné rozdíly; samostatně analyzovat duben–srpen jako období s vlastní
RH (pokud měřila). Při budoucím návrhu rekonstrukce je nutná **nezávislá
validace** pomocí existujících původních období a sezonní kalibrace;
souhlas dvou vzdálených stanic sám o sobě není zárukou lokální RH.

Nikdy nezapisovat do `pocasi-loucka.eu.archive` nebo do
`loucka_reconstruction` bez explicitního schválení.
