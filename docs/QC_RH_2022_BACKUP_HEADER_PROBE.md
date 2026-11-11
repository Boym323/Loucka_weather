# RH 2022 – bezpečné rozpoznání formátu nalezených lokálních záloh

## Dosavadní výsledek

Inventura na LXC prohlédla 39 adresářů a 176 položek,
našla **6 kandidátních souborů**, `readErrors=0`,
`skippedSymlinks=0`, `skippedMounts=0`, `databaseWrites=0`.
Stav `partial_metadata_inventory` není chybou: dva zadané kořeny
`/var/lib/weewx` a `/etc/weewx` na serveru neexistují.
Žádný z názvů šesti souborů výslovně neobsahuje `2022`.
To **neprokazuje**, že jejich obsah nemůže být z roku 2022.

Soukromý originální seznam:
`/var/lib/loucka-qc/qc-rh-2022-local-backup-inventory.json`
(vlastník `loucka`, práva `0600`). Dosud neproběhlo čtení obsahu
žádného ze šesti kandidátů a jejich skutečná časová pokrytí jsou neznámá.

## Další etapa: bezpečné magic-byte rozpoznání formátu

Nový `api/scripts/qc-rh-backup-probe.mjs` pracuje **výhradně**
se soukromým seznamem existujících kandidátů. Neprochází další
adresáře, neimportuje MariaDB ani soubory do SQL, nemá síťovou
komunikaci, neprovádí nic se soubory meteorologických záloh.

Před každým případným otevřením souboru:
- vyžaduje, aby cesta byla jednou z již inventarizovaných cest
  pod přístupným kořenem;
- kontroluje symlinky v celé cestě a změny mountpointů (device);
- ověřuje původní velikost a čas modifikace vůči inventuře;
- soubor otevře jen jako `O_RDONLY | O_NOFOLLOW | O_NONBLOCK`,
  porovná `fstat` se zkontrolovaným souborem;
- čte nejvýše **512 prvních bajtů**, které **nezobrazuje**
  ani nikam nekopíruje.

Výsledkem je pouze obecná indikace: SQLite 3, SQL text, gzip,
zstd, xz, ZIP, TAR, 7z, JSON-like nebo neznámý formát. Komprimované
archivy se **nerozbalují** a nepočítá se žádný obsahový hash.
Ani SQLite signatura nepotvrzuje meteorologická měření;
**časové pokrytí, přítomnost RH, provenience či identita senzoru
zůstávají neověřené**. Metadata změněného, nenalezeného nebo
nebezpečného souboru se vyřadí (fail-closed).

Výstup je výhradně soukromý `0600` JSON
`qc-rh-2022-backup-header-probe.json`, který obsahuje cestu,
velikost, očekávaný podpis, počet přečtených bajtů a důvody
případného vyřazení, nikoliv obsah souboru.

## Postup na LXC

Po synchronizaci příslušného commitu `main` spustí root
příkaz, který přepne samotný proces na `loucka`:

```bash
REPO=/home/loucka/Loucka_weather
runuser -u loucka -- node "$REPO/api/scripts/qc-rh-backup-probe.mjs" \
  --reports-dir /var/lib/loucka-qc --dry-run

runuser -u loucka -- node "$REPO/api/scripts/qc-rh-backup-probe.mjs" \
  --reports-dir /var/lib/loucka-qc --probe --max-candidates 10

stat -c '%U:%G %a %s %n' \
  /var/lib/loucka-qc/qc-rh-2022-backup-header-probe.json
```

`--dry-run` neotvírá žádný kandidátní soubor. Explicitní `--probe`
projde jen už uvedených 6 cest (limit 10) a přečte nejvýše 512 B na
soubor. Výstup lze bezpečně zkontrolovat v terminálu a poslat k
analýze; **neposílej surové zálohy ani hesla, pokud to není nutné**.

## Další navazující rozhodnutí

Podle identifikovaných formátů:
- skutečný SQLite soubor: lze připravit samostatnou
  transakčně bezpečnou read-only kontrolu schématu a pokrytí
  roku 2022 bez importu nebo změn původního souboru;
- SQL dump: nejprve cíleně prohlédnout anonymizované
  hlavičky a případné tabulky – nevykonávat dump;
- archiv: nejdříve inventura názvů *vnitřních souborů*
  v sandboxu, s limity, bez extrakce nebo spuštění;
- neznámý formát: ruční ověření a výběr bezpečné čtečky.

Vždy v prvé řadě hledáme **nezávislé původní RH**
z ledna–června 2022, protože vzdálené reference nelze pro
dané měsíce dostatečně lokálně validovat. Nepoužívat současný
`loucka_reconstruction.archive` jako originální tréninková data.

Žádné SQL zápisy, schvalování, přepisy historického `archive`,
doplnění RH, automatický import ani produkční nasazení.
