# Dev Počasí Loučka — verzovaný náhled rekonstruovaných RH 2022

Stav: **implementovaná pouze fáze A (read-only balíček rozdílů)**.
**Neproveden** přenos do žádné databáze dev, změna API ani nasazení
na `dev.pocasi-loucka.eu`. Veškeré historické odhady zůstávají
experimentální. Produkční `pocasi-loucka.eu.archive` se nesmí měnit.

## Proč nestačí přepnout DATABASE_SCHEMA

Dev Fastify `api/src/db.ts` čte *jedno* schéma z
`WEATHER_DB_SCHEMA`, standardní dokumentovaný zdroj
`pocasi-loucka.eu`. Při požadavku na `dataset=approved`
současné API vrací 503; metadata uvádějí pouze
`availableDatasets:['original']`. Skutečná provozní
hodnota `WEATHER_DB_SCHEMA` uložená v
`/etc/loucka-weather/api.env` **nebyla přímo ověřena**.
Nikdy nekopírovat její hesla do repozitáře ani do chatu.

Produkční archiv a rekonstruovaná kopie mají v průběžném
snapshotu 11. 11. 2026:
- původní 1 683 541 řádků, `archive_day_*` 79 tabulek;
- `loucka_reconstruction.archive` 1 679 809 řádků a
  žádné `archive_day_*` tabulky;
- rekonstrukční kopie končí o cca 13 dní dříve než originál.

**Přímé přepnutí** API na `loucka_reconstruction` by vedlo ke
ztrátě nejnovějších měření a k problémům s denní statistikou.

## Oprava prvního LXC exportu — 11. 11. 2026

První skutečný export skončil exit=1 po úspěšném fs-only
`--dry-run`. Původní exportér omylem očekával údaje
`WEATHER_DB_HOST/USER/PASSWORD` z provozního API, přestože
QC systemd jednotka předává `/etc/loucka-weather/qc.env`
s oddělenými `WEATHER_QC_DB_HOST/USER/PASSWORD`.
Chybová hláška navíc potlačovala, v jaké fázi export skončil.

Opravený exportér používá stávající QC sadu (včetně
`WEATHER_QC_DB_PORT`), a volitelně **oddělenou exportní
čtecí sadu** `WEATHER_RH_EXPORT_DB_HOST/USER/PASSWORD/PORT`,
je-li explicitně zadána. Nikdy nemíchá identitu uživatelů
z obou sad a nikdy nepoužívá produkční `WEATHER_DB_*`
tajemství.

### Bezpečný preflight: `--check`

`--dry-run` dál ověřuje pouze přístup k soukromému adresáři,
nikoli připojení k DB. `--check` následně provede:
1. Ověření opt-in `WEATHER_QC_READ_ONLY=YES` a
   `WEATHER_STAGING_ENABLED=YES`.
2. Připojení právě jedné čtecí identitou.
3. Kontrolu `SHOW GRANTS`: **zakázat jakékoli zápisové,
   globální nebo neznámé grants**.
4. Vyžadovat `SELECT` na všech třech tabulkách:
   `pocasi-loucka.eu.archive`,
   `loucka_reconstruction.reconstruction_changes`,
   `loucka_reconstruction.archive`.
5. Tři omezené `SELECT 1 ... LIMIT 1`, bez čtení
   obsahu RH a bez zápisu do souboru.

Příkaz pro **diagnostiku bez exportu** na LXC:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict \
  -p ProtectHome=read-only \
  -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=60s \
  /usr/bin/node scripts/qc-rh-dev-preview-export.mjs \
  --reports-dir /var/lib/loucka-qc --check
```

Úspěch je `status=ready_for_read_only_export`. Při selhání
vypíše pouze JSON s bezpečným kódem, např.
`DB_CONFIG_MISSING`, `DB_CONNECTION_UNAVAILABLE`,
`SELECT_SCOPE_MISSING`, `WRITE_CAPABLE_OR_UNSUPPORTED_GRANTS`,
`READ_PERMISSION_OR_QUERY_FAILED`. **Nikdy nevypíše
heslo, hostitele, databázového uživatele, SHOW GRANTS ani
původní SQL výjimku.**

Dřívější QC čtecí účet může mít jen oprávnění pro původní
archiv a referenční pozorování. V tom případě
`SELECT_SCOPE_MISSING` není důvod k rozšíření účtu
pro všechny jiné QC nástroje: ty mají vlastní
striktní kontrolu grantů a rozšířená role by ji mohla
porušit.

### Volitelný vyhrazený exportní účet — pouze pokud chybí SELECT

Správce MariaDB může **vědomě** vytvořit samostatnou
identitu s minimálními SELECT oprávněními na třech
konkrétních tabulkách. Je nutné upravit host adresu
na konkrétní síťový zdroj LXC, nepoužívat wildcard
`%` bez síťového omezení a bezpečně vygenerovat nové heslo.
Následuje pouze vzor pro ruční posouzení — **nikde
se automaticky nespouští**:

```sql
CREATE USER 'loucka_rh_export'@'LXC_CLIENT_HOST'
  IDENTIFIED BY 'NAHODNE_SILNE_UNIKATNI_HESLO';
GRANT SELECT ON `pocasi-loucka.eu`.`archive`
  TO 'loucka_rh_export'@'LXC_CLIENT_HOST';
GRANT SELECT ON `loucka_reconstruction`.`archive`
  TO 'loucka_rh_export'@'LXC_CLIENT_HOST';
GRANT SELECT ON `loucka_reconstruction`.`reconstruction_changes`
  TO 'loucka_rh_export'@'LXC_CLIENT_HOST';
```

Konfigurace `WEATHER_RH_EXPORT_DB_*` se vkládá
výhradně do soukromého souboru s právy správce,
nikdy do GitHubu nebo chatu. **Neuděluj
INSERT/UPDATE/DELETE ani globální SELECT**.
Toto je oddělená identity pro export, nikoli pro
produkční API. Žádné existující tabulky ani měřená
data se těmito SELECT právy neupravují.

Po `--check` se používá původní `--export` příkaz,
který navíc provede READ ONLY snapshot a kontrolu
5 153 historických řádků. Stále nic nezapisuje
do DB a nepublikuje na dev.

---

## Fáze A — privatizovaný balíček existujících RH změn

`api/scripts/qc-rh-dev-preview-export.mjs` vytváří obsahově
adresovaný **neměnný JSON** z již historicky aplikovaných
změn v `loucka_reconstruction.reconstruction_changes`.

Čte pouze:
- `reconstruction_changes` se stavem `applied`;
- **originální** `pocasi-loucka.eu.archive`;
- **rekonstruované** `loucka_reconstruction.archive`.

Před exportem ověří přesné překrytí časových řádků,
původních a nynějších RH, 5min UTC klíče, chybějící/nenulové
stavy, jednotnou metrickou veličinu `outHumidity`,
zdrojový `batch_key` a úplné auditní počty:

| Starší typ změny | Záznamy |
|---|---:|
| NULL RH → experimentální hodnota RH | 2 874 |
| Původně nenulová podezřelá RH → jiná experimentální RH | 2 194 |
| Původně nenulová RH → NULL v rekonstrukční kopii | 85 |
| **Celkem** | **5 153** |

Ověřeno rovněž přes read-only MariaDB, že v současnosti existuje
**5 153 unikátních časů a 35 auditních batchů**, a že všech
5 153 starších `old_value` a `new_value` odpovídá
současnému originálu a pracovní rekonstruované kopii.

**Žádný automatický souhlas:** každá položka obsahuje
`approved:false`, `accuracyValidated:false` a
`evaluation:'historically_applied_to_reconstruction_copy_only'`.
Kategorie `historical_invalidation` zachová informaci, že
původní pozorování je v experimentální vrstvě záměrně
zneplatněno, a tedy nemá být vykresleno jako nula.

Export obsahuje skutečné *stávající* historické hodnoty
pouze v **soukromém 0600 souboru**, nikdy přímo v GitHubu.
Součástí je SHA256 obsahu řádků i celého balíčku; jeho
název odvozený z hashe se **nikdy nepřepisuje**.
Opětovný identický export proto skončí bezpečně s informací
o již existujícím balíčku.

### Vykonání pouze na soukromém LXC (bez nasazení)

Samotný `--dry-run` nepotřebuje přihlášení k DB, neprovádí SQL:
```bash
runuser -u loucka -- node \
  /home/loucka/Loucka_weather/api/scripts/qc-rh-dev-preview-export.mjs \
  --reports-dir /var/lib/loucka-qc --dry-run
```

Skutečný read-only export po kontrole nasazené verze a
**QC nebo samostatné exportní SELECT-only role s přístupem
ke třem výše uvedeným tabulkám**:

```bash
systemd-run --wait --pipe --collect \
  -p User=loucka -p Group=loucka \
  -p WorkingDirectory=/home/loucka/Loucka_weather/api \
  -p EnvironmentFile=/etc/loucka-weather/qc.env \
  -p NoNewPrivileges=yes -p ProtectSystem=strict \
  -p ProtectHome=read-only -p ReadWritePaths=/var/lib/loucka-qc \
  -p PrivateTmp=yes -p PrivateDevices=yes \
  -p RestrictAddressFamilies='AF_UNIX AF_INET AF_INET6' \
  -p MemoryMax=256M -p CPUQuota=50% \
  -p TimeoutStartSec=300s \
  /usr/bin/node scripts/qc-rh-dev-preview-export.mjs \
  --reports-dir /var/lib/loucka-qc --export
```

Script vyžaduje `WEATHER_QC_READ_ONLY=YES`,
`WEATHER_STAGING_ENABLED=YES`, SHOW GRANTS
**bez zápisových oprávnění**, časově konzistentní čtecí
transakci a pevný limit 5154 výsledných řádků (záměrně
o jeden nad očekávaných 5153). Při změně dat nebo počtu
balíček nevznikne. Nikdo nesmí provozovat tento skript pod
DB účtem s `INSERT`, `UPDATE` ani `DELETE`.

Balíček je privátní:
`/var/lib/loucka-qc/qc-rh-2022-dev-preview-<hash>.json`.
Jestliže MariaDB QC účet nemá SELECT na `reconstruction_changes`
nebo obě schémata, export **fail-closed** skončí chybou;
nepřiděluj zápisová práva.

## Fáze B — publish na dev (není součástí tohoto PR)

Bezpečné pořadí (nepřeskakovat):
1. Read-only provozní diagnostika **skutečné** dev konfigurace
   `WEATHER_DB_SCHEMA` bez logování tajemství a kontrola, zda
   se jakýkoliv dev zápis může dotknout produkce.
2. Samostatná **verzovaná vývojová** tabulka overlay
   `preview_batches` / `preview_outHumidity_changes`,
   nikdy ne `pocasi-loucka.eu.archive`.
   Minimalistické schéma obsahuje UTC epoch, původní hodnotu,
   experimentální hodnotu, typ změny, auditní dávku, stav
   `unapproved` a SHA256 exportu.
3. Import do těchto nových tabulek pomocí přísně oddělené
   role a **pouze do potvrzené vývojové DB**, s kontrolou
   `old_value` proti originálu v okamžiku publikování,
   a transakčním rollbackem při nesouladu. Aktivní verze
   se přepne až po uzavření kompletního importu a testů.
4. Dev API: volitelný explicitní dataset
   `preview_unapproved` pro RH 2022 pouze za chráněným
   vývojovým přístupem, výchozí `original` zůstává
   nedotčené. V grafu musí být viditelné odlišení hodnot,
   jejich stav a provenience.
5. Agregovat RH z **kombinované** časové řady a nikoli z
   původních `archive_day_outHumidity`, které neodpovídají
   navrženým opravám. Ostatní statistiky zůstanou na originálu.
6. Rollback = návrat konfigurace aktivní vývojové verze,
   případně neaktivovat overlay; **žádné zpětné přepisování
   produkčního archive**.

**Fáze A je implementace předpokladu pro fázi B**.
Samotný PR a merge nesmějí zapnout preview, měnit
systemd `api.env`, provádět import, nebo veřejně
publikovat experimentální hodnoty.

Výchozí bezpečnostní stav je explicitní:
`databaseWrites=0`, `automaticApprovals=false`,
`liveDevPublishing=false`.

## Fáze B1 – připravený, ale standardně VYPNUTÝ privátní API náhled

Nová součást `api/src/dev-rh-preview.ts` ověřuje před otevřením
experimentálních hodnot:
- spouštěcí flag `WEATHER_DEV_PREVIEW_ENABLED=YES` a zvlášť
  `WEATHER_DEV_PREVIEW_MODE=isolated_dev_only`;
- absolutní kanonický soubor uložený **přímo** pod
  `/var/lib/loucka-qc`, vlastní 0600, rodič 0700;
- očekávaný **SHA256 celého exportu** a SHA256 všech řádků;
- přesně 5 153 změn se správnými kategoriemi, UTC epoch,
  auditními identitami, dávkami a `approved:false`;
- nenávratné přístupové heslo v samostatném `api.env`, délka
  alespoň 32 znaků, předává se výhradně HTTP
  `Authorization: Bearer …` hlavičkou, ne v query stringu;
- experimentální hodnoty se nesmějí zaměňovat za původní RH.

Je-li `WEATHER_DEV_PREVIEW_ENABLED` nenastaveno či jinak než
`YES`, endpoint se **vůbec neregistruje (404)**.
Při nesplnění kterékoli podmínky explicitně zapnutého náhledu
start API **selže bezpečně**, namísto nechtěného používání
neověřeného balíčku.

Nový endpoint výhradně pro chráněný dev:
```text
GET /api/v1/dev/preview/rh-history
?from=2022-04-25T23:55:00Z&to=2022-04-26T00:00:00Z
Authorization: Bearer <SOUKROMY_TOKEN>
```

Vrací zvlášť `original.value/status` a
`preview.value/status`, včetně původního auditního batch
pro každý změněný bod. U nezměněného bodu je v obou vrstvách
původní RH; u historicky zneplatněné RH je `preview.value=null`.
**Žádný nový RH odhad se nepočítá.** Endpoint ověří, že
původní archivní RH se od exportu nezměnila, a že každý
publikovaný experimentální bod má stále skutečný archivní
původní řádek. Při nesouladu vrátí 503.

Omezení: jen RH, jen UTC čas roku 2022, nejvýše sedm dní
na jeden dotaz, nejvýše 2 000 bodů, raw rozlišení bez
závislosti na potenciálně zastaralých `archive_day_*`.
HTTP odpovědi vždy `Cache-Control: no-store`, neindexovat,
oddělené od původního `/api/v1/history`. Běžné API, roční
statistiky, LIVE a `dataset=approved` se nezměnily.

### Provozní nastavení – nepoužívat, dokud není potvrzena izolace dev

Následující **jen příklad názvů** prostředí; žádné tajemství
nepatří do GitHubu ani veřejné dokumentace:

```dotenv
WEATHER_DEV_PREVIEW_ENABLED=YES
WEATHER_DEV_PREVIEW_MODE=isolated_dev_only
WEATHER_DEV_PREVIEW_PACKAGE=/var/lib/loucka-qc/qc-rh-2022-dev-preview-<SHA16>.json
WEATHER_DEV_PREVIEW_PACKAGE_SHA256=<SHA256_CELEHO_BALICKU>
WEATHER_DEV_PREVIEW_TOKEN=<TAJNY_NAHODNY_TOKEN_32_PLUS_ZNAKU>
```

**Před případným zapnutím nutno ověřit:** skutečnou konfiguraci
`/etc/loucka-weather/api.env`, dostupnost souboru pro
službu `loucka`, oddělenou autentizaci přístupů, nginx
necacheování a bezpečné omezení endpointu výhradně pro vývoj.
Součástí tohoto PR **není aktualizace `api.env` ani
restart/deployment**. Nenastavujte zobrazení bez přístupové
kontroly na veřejném Astro frontendu (token nesmí být vložen
přímo do veřejného JavaScriptu).

Při rollbacku stačí vypnout příznak
`WEATHER_DEV_PREVIEW_ENABLED` a kontrolovaně restartovat
**výhradně dev API**. Tím endpoint přestane existovat; v
původním archivu ani pracovním `loucka_reconstruction`
nejsou žádné nové DB změny.

Fáze B2 (zatím nerealizováno): uživatelské porovnání ve
vývojovém UI za autentizovaným proxy/administrátorským
rozhraním, případně izolovaný dev-only overlay SQL publish
s verzovaným přepínáním. Experimentální data nesmějí získat
nepravdivé označení `approved`.
