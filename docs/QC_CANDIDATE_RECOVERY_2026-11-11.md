# Doplnění zkrácených QC návrhů – soukromý screening

## Důvod

Historické QC pokrylo všech 932 týdenních UTC oken (2009-01-01 až
2026-11-10 00:00 UTC), ale 58 starších JSON reportů záměrně uložilo
jen prvních 100 návrhů. Ze 22 694 spočítaných návrhů je tak
20 175 individuálně doložených v původních JSON a **2 519** skrytých
za limitem zobrazení.

## Bezpečnostní princip

Nový `qc-recover-candidates.mjs` **nepřepisuje** žádný z 932 originálních
QC reportů. Po explicitním opt-in ještě jednou přečte pouze těch 58
sedmidenních intervalů přes existující SELECT-only nástroj
`qc-report.mjs --full-candidates`. Každý výsledek je ověřen oproti
historickému JSON: totožné zdrojové souhrny a porovnání, stejný celkový
počet a naprosto shodných prvních 100 položek včetně ID a detailů.
Při rozdílu se ihned zastaví bez vytvoření výsledného doplňku.

Při úspěchu vznikne **nový**, nikdy automaticky nepřepisovaný
`/var/lib/loucka-qc/qc-candidate-overflow.json` (0600). Doplňuje jen
2 519 historicky skrytých položek, včetně SHA256 původního QC reportu.
Následné spuštění existujícího `qc-quality-overview.mjs` ověří tento hash
a vygeneruje:
- `qc-quality-overview.html`: úplné počty návrhů v měsíci **podle UTC
  času začátku události**, zvlášť od QC odmítnutých řádků a referenčního
  skóre stále připsaných podle začátku týdenního okna.
- `qc-candidates-complete.csv` (0600): **všech 22 694 návrhů**
  z původních i obnovených důkazů, včetně zdroje, typu, přesného času
  začátku/konce, důvodu, detailů a stavu `needs_manual_review`.
  Nejde o unikátní počet chybných měření ani automaticky schválených oprav.

Skripty nemají HTTP endpoint, nezveřejňují soukromá data na frontend
a nikdy nezapisují do DB. Pracují pod účtem `loucka`, pouze do
`/var/lib/loucka-qc` (0700) a s přísnými systemd limity prostředků.

## Manuální postup na staging LXC

Před spuštěním musí být bezpečně synchronizovaná nová verze `main`.
Původní historický timer i `catch-up` musí být dokončené/vypnuté.
Jako root spusť nejprve bezpečný dry-run:

```bash
runuser -u loucka -- node   /home/loucka/Loucka_weather/api/scripts/qc-recover-candidates.mjs   --reports-dir /var/lib/loucka-qc --dry-run
```

Očekáváme `truncatedWindows=58` a
`expectedRecoveredCandidates=2519`. Nic nenačítá z DB.

**Teprve při souhlasu s dry-runem** spusť opakované SELECT-only
srovnání pod sandboxem (bez blokování jiných služeb; tento příkaz čeká
na konec bezpečně omezeného běhu):

```bash
systemd-run --wait --pipe --collect   -p User=loucka -p Group=loucka   -p WorkingDirectory=/home/loucka/Loucka_weather/api   -p EnvironmentFile=/etc/loucka-weather/qc.env   -p NoNewPrivileges=yes   -p ProtectSystem=strict -p ProtectHome=read-only   -p ReadWritePaths=/var/lib/loucka-qc   -p PrivateTmp=yes -p PrivateDevices=yes   -p RestrictAddressFamilies="AF_UNIX AF_INET AF_INET6"   -p MemoryMax=256M -p CPUQuota=50%   -p TimeoutStartSec=900s   /usr/bin/node /home/loucka/Loucka_weather/api/scripts/qc-recover-candidates.mjs   --reports-dir /var/lib/loucka-qc --recover
```

Pokud se nezměnila původní data, očekáváme
`mode=recovered`, `truncatedWindows=58`, `recoveredCandidates=2519`,
`databaseWrites=0`. Pokud se historická data změnila, skript bezpečně
skončí chybou – **nepoužívej žádné přepsání nebo násilné pokračování**.

Poté znovu vygeneruj soukromé HTML stejným příkazem, který fungoval
při PR #86 (`qc-quality-overview.mjs --reports-dir /var/lib/loucka-qc`,
sandboxovaný `systemd-run`). Nový výstup přidá
`candidateDetailsComplete=true`, `recoveredCandidates=2519`
a soukromé CSV s úplným seznamem.

Ověř obsah a přístupová práva:

```bash
stat -c '%U:%G %a %s %n'   /var/lib/loucka-qc/qc-candidate-overflow.json   /var/lib/loucka-qc/qc-candidates-complete.csv   /var/lib/loucka-qc/qc-quality-overview.html
```

Otevření na Macu přes SSH (LXC firewall zůstává beze změny):

```bash
scp root@192.168.0.131:/var/lib/loucka-qc/qc-quality-overview.html ~/Downloads/
scp root@192.168.0.131:/var/lib/loucka-qc/qc-candidates-complete.csv ~/Downloads/
open ~/Downloads/qc-quality-overview.html
```

## Metodická poznámka

Tento krok zpřesňuje měsíční **počty návrhů podle začátku události**,
ale zatím nepřepočítává odmítnuté QC řádky a reliability stanice přes
kalendářní hranice. Jejich týdenní agregace zůstávají v reportu
zřetelně označené jako přiřazené podle začátku týdne.
Souvislý výpadek bez originálu i referencí nadále může mít 0 návrhů
– absence referencí neznamená bezchybnost.

Referenční měření LuhaMet ani ILOUKA4 se nestávají původními
pozorováními Loučky. Každý návrh zůstává `needs_manual_review`
s `automaticWriteAllowed=false`.
