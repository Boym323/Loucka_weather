# Dev Počasí Loučka: verzovaný přenos experimentální RH z roku 2022

**Stav 11. 11. 2026:** Implementace a CI testy v repozitáři.
**Na skutečném dev MariaDB ani v LXC nic automaticky nespouští.**
Publikaci neprovádět před ověřením skutečného runtime
`WEATHER_DB_SCHEMA`, oddělených přístupů a schválením operátorem.

## Proč nepřepínat API rovnou na `loucka_reconstruction`

Z přímých read-only SQL kontrol vyplývá:
- původní `pocasi-loucka.eu.archive` má 1 683 541 řádků
  (aktuálně do 11. 11. 2026);
- `loucka_reconstruction.archive` má 1 679 809 řádků,
  její poslední záznam končí o zhruba 13 dní dříve;
- produkční WeeWX schéma má 79 `archive_day_*` tabulek
  a pracovní rekonstrukční schéma žádnou.

Přímé přepnutí by ztratilo čerstvá data a rozbilo denní statistiky.
Navíc 2022 audit prokázal pouze **5 153 původně aplikovaných
změn RH**: 2 874 původně NULL → odhadnutá RH;
2 194 původně nenulová podezřelá RH → upravená;
85 podezřele zamrzlých RH → NULL. Tyto změny mají
35 auditních batchů; každá změna má unikátní UTC epoch.
Porovnání všech 5 153 `reconstruction_changes.old_value`
s originálem a `new_value` s pracovní kopii
`loucka_reconstruction.archive` skončilo **0 rozpory**.

Takto vzniklé odhady jsou však **experimentální**.
Pouhý status `state='applied'` ve starém pracovním
archivu není meteorologickým schválením.

## Navržený tok dat

```text
pocasi-loucka.eu.archive (zdroj original, jen SELECT) ────┐
loucka_reconstruction.archive + reconstruction_changes ──┤
                                                           ▼
                           qc-rh-preview-rh2022-<SHA>.json
                        soukromý 0600, neměnný, 5153 řádků
                                                           │
                                      výslovný operátorský import
                                      jen INSERT / SELECT, transakce
                                                           ▼
                  loucka_dev_preview.rh_preview_versions
                  loucka_dev_preview.rh_preview_points
                              jedna neměnná verze
                                                           │
                              read-only API, feature flag
                                                           ▼
              /api/v1/dev/rh-preview (jen RH 2022 a 7 dní)
                                                           │
                                /rekonstrukce-rh/ na dev
```

Je to **sidecar** se změnami (nikoli kopie 1,68 milionu
záznamů), takže dev API může současně dál číst
původní kompletní `archive` a jeho denní souhrny.
Cílová databáze je **separátní dev-only SQL schéma**,
nikoli veřejný hostname. Doména `dev.pocasi-loucka.eu`
sama o sobě žádnou DB neidentifikuje.

## Fáze 0 — provozní preflight (bez hesel ve výstupu)

Na LXC zjistit **pouze název** databázového schématu
z aktivní root-owned `/etc/loucka-weather/api.env`:

```bash
sudo awk -F= '/^WEATHER_DB_SCHEMA=/ {print "API source schema: " $2}' \
  /etc/loucka-weather/api.env
```

Nekopírovat hesla, neveřejné IP či celé env do issue.
Ověřit, zda API nadále používá jen účet s `SELECT`
a zda je pro `loucka_dev_preview` vytvořen
oddělený uživatel s INSERT pouze do tohoto schématu.
Nepoužívat root/admin MariaDB pro import.

Před vytvořením dev tabulek je nutná výslovná provozní
kontrola a případné schválení, že existuje či smí vzniknout
samostatná dev-only databáze. SQL v
`api/scripts/rh-preview-dev-migration.sql` je **připravené
DDL, které se samo nikdy nespouští**.
Cílový název je v migraci
`loucka_dev_preview`; lze vytvořit prázdné schéma
pouze na odděleném dev SQL serveru (nebo bezpečně
oddělené dev SQL schéma na jiném povoleném serveru).

## Fáze 1 — pouze SELECT export 2022

CLI `api/scripts/rh-preview-export.mjs`:
- vyžaduje současně `WEATHER_STAGING_ENABLED=YES`
  a `WEATHER_QC_READ_ONLY=YES`;
- přistupuje pod účtem, jehož `SHOW GRANTS` obsahují
  pouze SELECT; s účtem s INSERT/ALTER/DROP/FILE apod. odmítne běh;
- SELECT spojuje přesně 5 153 historických `applied`
  změn RH s `pocasi-loucka.eu.archive` a
  `loucka_reconstruction.archive` na stejném UTC čase;
- fail-closed ověří původní RH, výslednou RH, teplotu, jednotky,
  počet řádků (2 874/2 194/85), duplicity a 5min čas;
- generuje stabilní `versionId=rh2022-<24 znaků SHA256>`;
- uloží soukromý `0600` manifest pod
  `/var/lib/loucka-qc/qc-rh-preview-<versionId>.json`
  v adresáři `0700`, nikdy jej tiše nepřepíše.

Samotný proces exportu nesmí zapisovat do žádné SQL tabulky.

## Fáze 2 — import do odděleného dev-only schématu

`api/scripts/rh-preview-import.mjs` má tři režimy:

- `--dry-run --manifest /var/lib/loucka-qc/qc-rh-preview-rh2022-....json`
  prověří SHA256 a metadata bez SQL spojení;
- `--verify-target --manifest ...` ověří existenci
  migrovaných tabulek a oprávnění na dev-only
  `loucka_dev_*`, bez zápisů;
- `--import --manifest ... --ack-unapproved-dev-only`
  **provádí zápis** do předem připraveného samostatného
  dev-only schématu, výhradně pod výslovným
  `WEATHER_PREVIEW_IMPORT_ENABLED=YES` a s odděleným
  účtem `WEATHER_PREVIEW_WRITER_*`.

Import pracuje pouze s `INSERT` a `SELECT`:
transakčně vytvoří novou neměnnou verzi a 5 153 bodů.
Konfliktní, částečně existující nebo checksumově odlišnou
verzi odmítne. Nic nepřepisuje, nemaže a verzi automaticky
**neaktivuje** na API. Při chybě transakci vrátí zpět.

**Bezpečnost:** minimální oprávnění zapisovací identity
`SELECT, INSERT` v `loucka_dev_preview` a nikde jinde.
V kódu není žádné `CREATE DATABASE`, `UPDATE`,
`DELETE` ani `DROP` pro import. Nespouštěj jej
proti `pocasi-loucka.eu` nebo
`loucka_reconstruction`.

## Fáze 3 — explicitní čtecí aktivace pro dev API

Pro dev **až po ručním schválení testovacího importu**:

```ini
WEATHER_RH_PREVIEW_ENABLED=YES
WEATHER_RH_PREVIEW_INSTANCE=DEV_ONLY
WEATHER_RH_PREVIEW_SCHEMA=loucka_dev_preview
WEATHER_RH_PREVIEW_VERSION=rh2022-<24hex>
```

Zápisový importní účet **nikdy** nepatří do API env.
`WEATHER_DB_USER` musí mít pouze `SELECT` na
původní `archive` a read-only `SELECT` na
`loucka_dev_preview.rh_preview_versions/points`.
Když tyto flagy chybějí, nový endpoint vrací 503 a
ostatní API zůstává v dosavadním `dataset=original`.
`dataset=approved` zůstává 503.

HTTP endpoint:
`GET /api/v1/dev/rh-preview?from=2022-04-26T00:00:00Z&to=2022-04-27T00:00:00Z`

Vrací současně `originalRh`, `previewRh`, kategorii
(`measured`, `missing`, `estimated`,
`frozen_adjusted`, `invalidated`), starou
metodu, `sourceBatch`, `reviewState`, `approved=false`,
SHA256 verze. Omezeno výhradně na 2022, max. 7 dní,
max. 3000 archivních řádků a na původní existující
časové značky. Kontroluje, že se RH v originálu
nezměnila proti manifestu; při změně nesmí míchat data.
Denní statistik `archive_day_*` ani dalších veličin
se preview **nedotýká**.

Stránka `/rekonstrukce-rh/` na Astro webu nabídne
porovnání grafů po dnech, výrazné označení
experimentálních bodů a informaci o verzi.
Pokud není preview explicitně povoleno, ukáže
uživateli, že není aktivní – nikoli smyšlená data.
Pozor: dev je dostupný přes HTTPS, **zabezpeč
omezení přístupu na úrovni Nginx Proxy Manageru**,
pokud experimentální data nemají být veřejně viditelná.

## Rollback a validace

- **Okamžitý funkční rollback:** vypnout
  `WEATHER_RH_PREVIEW_ENABLED` nebo vrátit
  `WEATHER_RH_PREVIEW_VERSION` na předchozí
  neměnnou verzi a řízeně restartovat dev API.
- Vypnutí preview nesmí změnit `/api/v1/history`
  ani denní souhrny a živou GW3000 vrstvu.
- Zachovat importovaný manifest a auditní stopu
  bez mazání; případné fyzické odstranění musí být
  samostatně schváleno.
- Ověřit rovnost 5 153 bodů, SHA256, 2 874 estimated,
  2 194 frozen_adjusted a 85 invalidated, časovou
  UTC provenienci, grafy, ETag/304, výpadky, DST,
  7denní limity a reakci při změně originálu.
- Po testech teprve rozhodnout, zda dávat preview
  na veřejně přístupný dev frontend.

## Co tato implementace **nedělá**

Neodhadne ani jednu **novou** RH, pouze publikuje
historicky existující a auditované pracovní zásahy
jako *experimentální náhled*. Nenahrazuje originální
WeeWX logger, původní či rekonstruovaný `archive`,
neprovádí backfill chybějících celých časových řádků,
nevytváří denní souhrny pro odhadnutou RH,
nezpřístupňuje experimentální RH jako `approved`
a neprovádí produkční ani automatické dev nasazení
nebo DB migraci.

`main` tohoto repozitáře může být samočinně synchronizován
na LXC. Proto **všechny nové datové funkce mají bezpečný
výchozí stav vypnuto**.
