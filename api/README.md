# Loučka Weather API – Fastify/TypeScript staging

**Stav: částečná staging implementace; změny v této pracovní větvi nejsou nasazené.**

Implementované čtecí trasy:

| Endpoint | Stav |
|---|---|
| `GET /api/v1/healthz` | Liveness bez dotazu na DB |
| `GET /api/v1/readyz` | Dostupnost databáze, sanitizované chyby |
| `GET /api/v1/station` | Metadata, nezveřejňuje neověřenou polohu |
| `GET /api/v1/sensors` | Vrací prázdný seznam, dokud není ověřeno mapování senzorů |
| `GET /api/v1/camera/status` | Pravdivý stav `disabled` bez soukromých URL |
| `GET /api/v1/current` | Poslední záznam archivu včetně všech 45 veřejných metrik a tří systémů jednotek |
| `GET /api/v1/history` | `raw` (31 dnů), `hourly` (2 roky) a `daily` po místních dnech; `auto` volí rozlišení, limit 10 000 bodů, žádné tiché zkrácení |
| `GET /api/v1/statistics/daily` | Výpočet z WeeWX `archive_day_*`; lokální den Europe/Prague a politika agregací |
| `GET /api/v1/statistics/monthly` | Rollup denních WeeWX souhrnů; vážený průměr přes `wsum/sumtime` |
| `GET /api/v1/statistics/yearly` | Rollup denních WeeWX souhrnů; nepoužívá nevážený průměr denních průměrů |
| `GET /api/v1/live` | SSE snapshot archivního fallbacku a změny archivu; LOOP/MQTT není připojeno |

`resolution=auto` zkouší raw, hodinové a denní rozlišení při zachování limitu a hranic lokálního dne. Statistiky čtou pouze read-only WeeWX denní souhrny a povolené dvojice metric/aggregation. Jednotkový systém souhrnů se odvodí z `usUnits` prvního archivního záznamu, jak jej definuje [WeeWX](https://www.weewx.com/docs/5.2/devnotes/#daily-summaries); při neznámém nebo nepodporovaném kódu dotaz bezpečně selže `503`. U denních minimum/maximum statistik zůstává `extremaSource=unknown`, protože souhrn může zachycovat LOOP extrém. Vektorový směr se počítá z `archive_day_wind.xsum/ysum`; směr při maximu poryvu se použije pouze tehdy, když čas a hodnota denního maxima souhlasí s odpovídajícím řádkem v `archive`. WeeWX uvádí `archive_day_wind.max_dir` jako směr maxima větru, proto se nepoužívá jako náhrada za směr poryvu.

Archivní observer běží jako jediný read-only poller procesu: načte dvouhodinové překryvné okno po 15 s, dohání nové řádky stránkami a deduplikuje změny podle hashe všech publikovaných polí. SSE podporuje `Last-Event-ID`, omezený replay, reset při ztrátě historie, heartbeat po 15 s a odpojení pomalých klientů. Dokud není ověřena čerstvost `archive_day_*`, události mají `summaryStatus=unknown`; automaticky se nikdy neoznačí `ready`. Hodinové grafy používají UTC hodiny a denní rozlišení místní půlnoci `Europe/Prague`; auto přejde na denní rozlišení, když se hodinové nevejde do limitu a denní hranice jsou zarovnané. Skutečný LOOP/MQTT feed, kamera a katalog senzorů zůstávají vypnuté/neověřené.

Proces při `SIGINT`/`SIGTERM` zavře Fastify, zastaví archivní observer a uzavře MariaDB pool; chyba při startu spustí stejný úklid.

Zdrojový katalog metrik a jednotek: `../schemas/metrics.json`; `src/metrics.ts` je z něj generovaná kopie. Jednotky se interpretují **u každého řádku** podle původního `usUnits`; `NULL` zůstává `null` a neznámé usUnits se odmítne. Odpovědi `current` a `history` mají ETag / 304, `dataset=approved` je bez schválení nepřístupný (503).

## Audit výkonu a paměti (2026-11-02)

Výchozí měření na testovacím LXC: `GET /api/v1/climate/records` měl studenou
odezvu ~4,8 s a další požadavky ~1–4 ms; proces měl RSS přibližně 570 MiB,
z toho ~534 MiB anonymní paměti. **Samotná RSS nerozlišuje V8 heap od nativních
alokací a nedokazuje memory leak.** Endpoint čte pouze původní `archive_day_*`
a vrací `status: preliminary`; oprava nemění historická měření ani stav QC.

Změny:
- Sdílené `Intl.DateTimeFormat` pro klimatické rekordy a lokální kalendář,
  omezená (8 000 dní) cache přepočtů půlnoci `Europe/Prague`.
- 20minutová fresh cache a max. 60minutová stáří záložní odpovědi **jen v rámci
  stejného lokálního dne**; přepnutí kalendářního dne vynutí nové načtení.
- Současní klienti sdílejí stejný in-flight výpočet. Po selhání načtení cache
  nepublikuje nový výsledek a další požadavek může načtení zopakovat.
- Volitelné logování etap (souhrnná doba paralelních SQL dotazů, doby jednotlivých
  čtení, zpracování) a Node paměti; nikdy se nevypisují SQL credentials ani data
  okolních stanic.
- Fastify `preClose` ukončí aktivní SSE streamy dříve než `server.close()`;
  `onClose` dále uvolní MariaDB pool a observéry.

Pro měření v testovacím LXC lze **dočasně** nastavit do
`/etc/loucka-weather/api.env` hodnotu `WEATHER_API_PERF_LOG=YES` a restartovat
pouze `loucka-weather-api` v plánovaném okně. Záznam `climate_records_refresh`
pak obsahuje `queryMs`, `queryWallMs`, `processingMs`, `rssMiB`,
`heapUsedMiB`, `heapTotalMiB`, `externalMiB` a `arrayBuffersMiB`.
Jde o read-only diagnostiku; po ověření je vhodné ji vypnout.

Po nasazení je nutný porovnávací benchmark studených i zahřátých požadavků
a dlouhodobé RSS; žádné konkrétní zrychlení či odstranění úniku paměti se
nepovažuje za prokázané jen na základě úpravy zdrojového kódu.

## Pokračování výkonového auditu – Issue #36 (5. 11. 2026)

V pracovní větvi je doplněno bezpečné čekání na právě běžící SELECT archivního observeru před uzavřením MariaDB poolu. Testy jsou rozšířeny o souběžné GET, klimatické ETag/304, expiraci stale odpovědí, dokončení SELECT při stopu a uvolnění SSE při chybě onClose. Neprokazuje to opravu historického SIGKILL v systemd.

Šetrné profilování testovacího LXC: `python3 deploy/lxc/preview-performance-check.py` spuštěné z kořene repozitáře (skript kontaktuje jen localhost:3100). Vypíše p50/p95, první pozorovaný a další GET, ETag/304 rekordů i senzorů a oddělenou procesní RSS / RssAnon / RssFile, pokud je dostupný systemd/procfs. **První pozorovaný požadavek nemusí být cold.** Historické výsledky 2. 11. nejsou výsledkem tohoto PR. Podrobné podmínky, způsob opakovaného měření, bezpečné EXPLAIN a omezení důkazů: [docs/API_PERFORMANCE_AUDIT_2026-11-05.md](../docs/API_PERFORMANCE_AUDIT_2026-11-05.md).

### Ověřený staging baseline 5. 11. 2026

Na LXC s evidovaným aktivovaným API commitem `dd816c5` (tedy stále před PR #54) proběhla nová read-only sonda v `14:02:22 UTC`: **32/32 GET 200**, `/climate/records` p50 **1,48 ms** a p95=max **4,21 ms** (8 vzorků); `/readyz` 31,45/50,72 ms, `/live/current` 1,40/3,11 ms, `/sensors/channels` 1,49/30,66 ms. Oba podmíněné GET (senzory i rekordy) vrátily `304`. Procesní RSS před/po: **104,12/104,13 MiB**, RssAnon 67,87/67,88 MiB, RssFile 36,25/36,25 MiB, 11 vláken, bez swapu a `NRestarts=0`. To jsou **krátká sekvenční pozorování se zahřátou cache**; nepovažovat je za cold-start výsledek, důkaz absence memory leaku nebo ověření nového shutdown kódu PR #54. Podrobná tabulka a další kroky: [audit 5. 11. 2026](../docs/API_PERFORMANCE_AUDIT_2026-11-05.md).

### Výsledek nasazení PR #54 – 5. 11. 2026

Staging LXC potvrdilo aktivovaný squash commit `49ec8eea`, health `ok`, readiness `true`. SELECT-only EXPLAIN u `archive_day_outTemp`, `archive_day_rain`, `archive_day_windGust` ukázal všude `PRIMARY` na `dateTime`, `type=range` bez filesortu. Systemd restart bez SIGKILL, návratový kód 0, trval 80 ms jako čas příkazu. Po restartu 32/32 GET bez chyby, klimatické rekordy první pozorovaný 2010,60 ms, další medián 3,20 ms; obě ETag 304. RSS 65,11 → 87,44 MiB v jednom krátkém zahřívacím okně; bez důkazu leaku nebo dlouhodobé stability. Plné měření cold SQL/heap trend a prokazatelně otevřeného SSE při shutdownu je v [Issue #55](https://github.com/Boym323/Loucka_weather/issues/55). Detailní důkazy: [audit](../docs/API_PERFORMANCE_AUDIT_2026-11-05.md).

## Ověření
Node 24 používá uložený `api/package-lock.json` a CI instaluje přes `npm ci`, nikoli přepočítávání závislostí při každém běhu.

```bash
cd api
npm ci
npm test
```
Jednotkové testy používají injektovaný fake reader; vedle nich CI vytváří **samostatnou syntetickou MariaDB 11.8** a ověřuje skutečné SQL dotazy i SELECT-only přístup. Neprobíhá žádný přístup na produkční databázi. Spustit `npm test` neznamená spustit live test na produkci.

## Pouze autorizovaný staging
```bash
# Na testovací LXC s odděleným MariaDB účtem pouze SELECT:
cd api
WEATHER_STAGING_ENABLED=YES WEATHER_DB_HOST=... WEATHER_DB_SCHEMA=... \
WEATHER_DB_USER=... WEATHER_DB_PASSWORD=... npm start
```

Doporučeno `systemd EnvironmentFile` s oprávněním 0600 mimo Git. Chybějící `WEATHER_STAGING_ENABLED=YES` zabrání startu DB adapteru. HTTP backend naslouchá standardně pouze na `127.0.0.1:3100`, přístup přes důvěryhodný Nginx Proxy Manager same-origin. DB adapter používá parametrizované SELECT, pevně vymezené identifikátory metrik a max. dvě databázová spojení.

**Nenahrazuje bezpečnostní schválení produkce:** náhledový Nginx má pouze základní limit 5 požadavků/s s burstem 12; chybí API limit na klienta a sdílená cache. Zbývá také ověřené QC senzorů/rekonstrukcí, bezpečnostní audit, validace SQL proti cílovému WeeWX schématu a zátěžové testy výhradně na izolovaném snapshotu. MQTT observation, ověřený katalog senzorů a fyzická telemetrie kamery nejsou dostupné; tyto výstupy zůstávají poctivě vypnuté nebo prázdné.

## Konsolidované roční pohledy (read-only)

GET /api/v1/climate/annual-matrix?metric=outTemp&units=metricwx&dataset=original vrací roky od 2009 se stavem QC, časovým pokrytím a metodikou vážených průměrů. Podrobnosti: docs/ANNUAL_CONSOLIDATION_2026-11-03.md. Zdrojové archive a rekonstrukce se nemění.

## Historický QC screening – pouze on-demand / read-only

Opakovatelný CLI report `npm run qc:report -- --from 2026-10-10T00:00:00Z --to 2026-10-11T00:00:00Z`
pro původní měření a LuhaMet / ILOUKA4. Čte pouze přes zvláštní MariaDB účet s
oprávněním SELECT, vyžaduje `WEATHER_QC_READ_ONLY=YES` a `WEATHER_STAGING_ENABLED=YES`,
max. 7 dní na jeden běh. Není to HTTP endpoint a neprovádí korekce.

Výstup je JSON: kontrola čidel, časových překryvů a konstantních hodnot,
bias/MAE/RMSE a orientační spolehlivost spárovaných časů, návrhy pouze
k ruční kontrole (`needs_manual_review`, nikdy `approved`).

Vhodný je i stávající vývojový účet `loucka_web_ro`, pokud má
pouze SELECT na původní schéma `pocasi-loucka.eu` a dodatečný SELECT
přesně na `loucka_reconstruction.reference_observations`. QC kontrola
grantů povolí tuto jednu výjimku pro původní schéma; globální SELECT
nebo zápisová práva nadále odmítá. Heslo se přebírá na LXC ze
soukromého `api.env` do `qc.env`, bez vypisování či uložení do Git.

Úplný bezpečný postup s odděleným účtem, omezeními a příkazy:
[docs/QC_READ_ONLY_2026-11-10.md](../docs/QC_READ_ONLY_2026-11-10.md).
Zavedení účtu a případné periodické spouštění na stagingu vyžaduje
samostatné schválení a ověřený první provozní výstup.

### Postupné zpracování historie 2009–současnost

`npm run qc:batch -- --from 2009-01-01T00:00:00Z --to 2026-11-10T00:00:00Z --output-dir /var/lib/loucka-qc`
provádí nejvýše jeden sedmidenní QC úsek na jedno spuštění (povoleno
max. čtyři pomocí `--max-windows 4`). Soukromý JSON report se uloží
atomicky s právy 0600; existující validovaný úsek je možné bezpečně přeskočit.
Volby `--dry-run` a `--summary` nepotřebují připojení k MariaDB.
Dokončené QC úseky nejsou schválenými opravami a v databázi nic nemění.
Návod a model hrozeb: `docs/QC_READ_ONLY_2026-11-10.md`.

### Volitelný stagingový systemd timer QC

Po ověření dvou skutečných staging reportů (2017-05-13 až 20,
2026-10-10 až 11) je připravená volitelná dvojice `deploy/lxc/loucka-qc-batch.service`
a `deploy/lxc/loucka-qc-batch.timer`. Jeden běh znamená právě jeden nový
sedmidenní UTC úsek, timer má interval 15 minut a nízké limity zdrojů.
Jednotky jsou **pouze ve zdrojovém repozitáři**, žádný proces či timer
se jejich mergem na LXC automaticky nezapne. Ruční instalace a kontrola
v `docs/QC_READ_ONLY_2026-11-10.md`. Screening nemění původní měření,
QC schválení ani denní souhrny, pouze privátní JSON reporty.

### Jednorázový zrychlený audit (bez 15minutového timeru)

Po ověřených staging testech lze použít `qc-batch.mjs --catch-up`.
Při jednom spuštění přečte zbývající historii sekvenčně po 7denních
oknech (výchozí prodleva 2 s, nejméně 1 s), zachová již validované
0600 JSON reporty a při chybě skončí, aniž by měnil databázi.
Standardní `qc-batch` pro timer zůstává bez `--catch-up` nezměněný:
nejvýše čtyři nová okna na samostatný běh.

Před jednorázovým auditem **vypnout** `loucka-qc-batch.timer`, jinak
by pravidelná služba soutěžila o stejný zámek a zatěžovala DB.
Spuštění přes izolovaný transient `systemd-run` s 256 MiB RAM,
50 % CPU a nejvýše 4 hodinami, logy a postup zastavení:
`docs/QC_READ_ONLY_2026-11-10.md`.

### Soukromý analytický přehled kvality (2009–2026)

`npm run qc:quality -- --reports-dir /var/lib/loucka-qc` vytvoří bezpečný
standalone HTML report `/var/lib/loucka-qc/qc-quality-overview.html` (0600),
včetně 215 měsíců dostupnosti dat ze SELECT-only původní MariaDB, QC příznaků,
překryvu referencí a 58 týdnů se zkrácenými seznamy návrhů.
Měsíční SQL počítá pokrytí teploty a vlhkosti **zvlášť** oproti očekávaným
5min slotům, QC výsledky původního sedmidenního screeningu přiřazuje
podle začátku QC týdne (jasně popsané omezení). Nezakládá endpoint ani
nezveřejňuje interní reporty na webu. Návod a stažení lokálního HTML:
`docs/QC_PRIVATE_QUALITY_OVERVIEW_2026-11-11.md`.


### Úplné obnovení QC návrhů z omezených historických reportů

58 týdenních QC reportů obsahuje pouze prvních 100 návrhů; 2 519 položek
zatím nebylo individuálně uloženo. `npm run qc:recover -- --reports-dir
/var/lib/loucka-qc --dry-run` bez SQL změn zobrazí očekávaný počet.
Po výslovném bezpečném spuštění `--recover` pod staging read-only
účtem se znovu přečtou **pouze** zkrácená okna a doplní se nový
nepřepisovaný privátní sidecar, ověřený proti SHA256 historických JSON
reportů a jejich prvním 100 kandidátům.

Aktualizovaný `qc:quality` poté vytváří i soukromý kompletní CSV export
všech kandidátů a zpřesní jejich kalendářní zařazení podle UTC počátku.
Odmítnuté QC řádky a reference jsou stále agregované po původních týdnech
(připsané měsíci jejich začátku). Úplný bezpečný postup:
`docs/QC_CANDIDATE_RECOVERY_2026-11-11.md`.

### RH 2022: soukromý čtecí audit po jednotlivých dnech

`npm run qc:rh-2022 -- --reports-dir /var/lib/loucka-qc --dry-run`
pouze zobrazí zbývající dny. Opt-in `--run --max-days 365 --delay-ms 200`
čte původní RH 2022 a reference LuhaMet + WU ILOUKA4 po jednotlivých UTC
dnech, kontroluje RH NULL, zcela chybějící sloty, nulu a duplicity,
časový drift ±30 s, dvojitou referenční shodu (pouze heuristická,
ne schválená data) a vzájemný bias/MAE zdrojů.

Denní JSON (0600) se **nikdy nepřepisují**. Nové odvozené
`qc-rh-2022-summary.json` a `qc-rh-2022-overview.html` zůstávají
v soukromé složce 0700. Výsledky nelze zaměňovat s již dokončeným
teplotním QC, žádná změna původního `archive`, žádný HTTP endpoint.
Návod: `docs/QC_RH_2022_READONLY.md`.
