# RH 2022 – inventura alternativních databází a nezávislých lokálních záloh

**Datum ověření:** 11. 11. 2026 (jen SELECT, bez databázových zápisů).
**Rozsah:** 2022-01-01T00:00:00Z až 2023-01-01T00:00:00Z.
**Základ:** původní neměnný `pocasi-loucka.eu.archive`, nikoli
`loucka_reconstruction.archive`.

## Proč tento krok

Dříve dokončená read-only RH evidence:
- 44 516 originálních řádků `outHumidity=NULL`, 978 úplně chybějících
  pětiminutových slotů;
- dvě referenční stanice u 42 710 NULL RH slotů, ve 33 388 se shodnou
  do 10 procentních bodů;
- při blokované retrospektivní validaci známých RH vyhodnoceno 204 dní
  / 57 112 trojic;
- **leden, únor, březen, květen a červen 2022 nemají dostatek
  vlastních RH pro nezávislou validaci korekcí**. Záznamy ze vzdálené
  stanice nejsou místními originálními pozorováními.

Následovalo čtecí ověření alternativních databází a souhrnů starých
rekonstrukčních zásahů.

## Skutečně ověřené tabulky a překryvy

| Zdroj `archive` | Řádků v roce 2022 | Historická interpretace |
|---|---:|---|
| `pocasi-loucka.eu` (původní) | 104 142 | RH nenulová v 59 626 |
| `pocasi-loucka.eu_GW1000` | 104 142 | 104 142 přesně překrytých časů, **0 nové RH** při NULL v originálu, **0** rozdílů RH na platném překryvu |
| `pocasi-loucka.eu_old` | 104 252 | 104 129 překrytých časů; **7** platných RH tam, kde produkční RH je NULL; **123** záznamů bez produkčního řádku |
| `old_weewx` | 0 | Rok 2022 chybí |
| `weewx_WH1080` | 0 | Rok 2022 chybí |
| `loucka_reconstruction` | 104 142 | 2 874 původně NULL RH je nyní nenulových **v rekonstrukci**, nikoli v produkci |

Pro `pocasi-loucka.eu_old.archive` je dalších 6 168 případů, kde
produkční RH byla původně platná, ale stará kopie má RH NULL;
a 29 138 případů rozdílné nenulové RH v překryvu. Pro všechny
překryté záznamy platí `usUnits=16`, průměrný absolutní rozdíl
překrytých `outTemp` je cca 0,209 °C. To dokazuje, že kopie není
bitově identická; **nedokazuje**, že je zdroj originální či přesnější.

### Sedm RH hodnot pouze ve staré kopii

V přesných UTC slotech:
- 2022-09-03 16:55
- 2022-09-08 07:45
- 2022-10-26 16:40, 16:45, 22:45, 22:50, 22:55

Všech sedm má `outHumidity=NULL` v produkci a nenulové RH
v `pocasi-loucka.eu_old`. Ale leží **až v září a říjnu**,
tedy **neřeší** hlavní výpadek RH v lednu–červnu. Původ a způsob
vzniku vysokopřesných desetinných hodnot zatím nejsou doložené.

### 123 dodatečných časových řádků ve staré kopii

Všechny obsahují nenulovou RH a leží v přesných pětiminutových slotech:
- 2022-08: **69** (z toho 67 za den 27. 8.);
- 2022-09: **21**;
- 2022-10: **33**.

Nejsou ani v původním produkčním archivu, ani v
`loucka_reconstruction.archive`. Je nutné nejprve **doložit jejich
provenienci** (originální logger/WeeWX vs pozdější interpolace/import),
ne přidávat je automaticky.

### Existující rekonstrukční databáze – není nezávislá reference

`loucka_reconstruction.archive` proti původnímu `archive`:
- březen: 1 023 původně NULL RH → nenulová;
- duben: 1 299 původně NULL RH → nenulová, dále 2 194
  **změněných platných** RH a 85 platných RH nyní NULL;
- červenec: 552 původně NULL RH → nenulová.
Celkem **2 874** původně NULL → nenulová, **2 194**
změněných platných RH a **85** nyní nulových RH.

Navíc `loucka_reconstruction.reconstruction_humidity_202204`
obsahuje 3 734 pracovních řádků se stavy:
- `estimate_ready` / `dual_vapor_pressure_v1`:
  2 194 `frozen` a 1 299 `missing`;
- `missing_unresolved`: 156;
- `invalidate_frozen`: 85.

Jde o **dřívější rekonstrukční návrhy/zpracování**, nikoliv
originální nezávislé měření. Nesmí se používat k trénování
či nezávislé validaci nových RH odhadů.

## Další etapa – hledání skutečných lokálních souborových záloh

Nový skript `api/scripts/qc-rh-backup-inventory.mjs` je výhradně
**metadata-only**. Nevyužívá MariaDB, nezapisuje do žádné
zdrojové databáze, neotevírá souborový obsah, neprovádí hash
obsahu, kopírování ani automatické opravy. Prohledává **pouze**
výslovně zadané absolutní adresáře:
- explicitní `--scan` nebo `--dry-run`;
- maximálně 8 kořenových adresářů, výchozí hloubka 5 a limit
  30 000 záznamů adresáře;
- žádné následování symlinků, žádné přechody na jiný filesystém
  během prohledávání, přeskočí `.git`, `node_modules`, build
  a běžné projektové výstupy;
- hledá názvy souborů s příponami záloh, WeeWX databází,
  textových exportů a meteostaničních archivů;
- případné nepřístupné, neexistující nebo nedokončené kořeny
  označí jako **částečný průzkum**, nikoliv za důkaz, že záloha neexistuje.

Výsledkem je výhradně soukromý
`/var/lib/loucka-qc/qc-rh-2022-local-backup-inventory.json`
(`0600` v adresáři `0700`) s cestami, velikostí,
časem změny, kategorií názvu a `provenanceVerified=false`.
**Přítomnost souboru nedokazuje, že obsahuje skutečná historická RH.**

### Bezpečné spuštění na LXC

Nejdříve aktualizovat kód `main` na LXC a ověřit požadovaný commit.
Kořeny v příkazu jsou jen typická místa a nemusí existovat;
chybějící adresář se výslovně označí v reportu:

```bash
REPO=/home/loucka/Loucka_weather
runuser -u loucka -- node "$REPO/api/scripts/qc-rh-backup-inventory.mjs" \
  --reports-dir /var/lib/loucka-qc --dry-run \
  --root /var/backups --root /var/lib/weewx \
  --root /etc/weewx --root /home/loucka

runuser -u loucka -- node "$REPO/api/scripts/qc-rh-backup-inventory.mjs" \
  --reports-dir /var/lib/loucka-qc --scan \
  --root /var/backups --root /var/lib/weewx \
  --root /etc/weewx --root /home/loucka \
  --max-depth 5 --max-entries 30000
```

Pokud má uživatel zálohy na Synology/NAS, musí nejprve
**sám** určit existující lokálně připojenou cestu a přidat ji jako
další `--root`. Nesmí se automaticky připojovat NAS ani
používat neznámé přístupové údaje. Zablokované cesty nebo
chybějící práva se neobcházejí.

Po dokončení se ručně prověří jen názvově nadějné soubory:
časové pokrytí 2022, vazba na skutečné lokální čidlo,
formát/časové pásmo, způsob exportu a neměnnost.
Samotný obsah souboru a RH se v této fázi nečte.

## Bezpečnostní závěr

Neexistuje doložená nová **nezávislá originální** RH série pro
hlavní výpadky leden–červen 2022. Bez ní nelze bezpečně
schválit automatické převzetí LuhaMetu, WU ani již
vypočtených hodnot z `loucka_reconstruction`.
Původní archiv, existující pracovní rekonstrukce, všechna
starší QC evidence a veřejný web zůstávají beze změny.
