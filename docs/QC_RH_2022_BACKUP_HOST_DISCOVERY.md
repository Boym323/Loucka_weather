# RH 2022 – uzavření LXC inventury a hledání zdrojových záloh na hostiteli

## Ověřený výsledek z LXC (11. 11. 2026)

Na `zl-dev-frontendPocasi` byla provedena metadata-only inventura a následná
kontrola nejvýše 512 prvních bajtů všech **6/6** kandidátů.
`databaseWrites=0`, `sourceFileWrites=0`; žádný archiv nebyl rozbalen.

| Soubor | Zjištěný formát | Interpretace |
|---|---|---|
| `/home/loucka/Loucka_weather-api/schemas/weather.schema.json` | JSON-like, 284887 B | Schéma aplikace |
| `/home/loucka/Loucka_weather-api/tests/fixtures/archive-updated.json` | JSON-like, 453 B | Testovací fixture |
| `/home/loucka/Loucka_weather-api/tests/fixtures/history.json` | JSON-like, 992 B | Testovací fixture |
| `/home/loucka/Loucka_weather-api/tests/fixtures/sensors.json` | JSON-like, 511 B | Testovací fixture |
| `/home/loucka/Loucka_weather-api/tests/fixtures/station.json` | JSON-like, 596 B | Testovací fixture |
| `/var/backups/alternatives.tar.0` | TAR, 40960 B | Podle cesty a názvu pravděpodobně systémová záloha Debian update-alternatives; obsah TAR nebyl prohlížen |

V této skupině **0 věrohodných nezávislých historických RH archivů**.
Tvrzení **není** ekvivalentní „RH zálohy neexistují“. Soukromý
`qc-rh-2022-backup-header-probe.json` obsahuje formátové důkazy, ne
obsah databází. Předchozí `partial_header_probe` vychází z toho, že
původní inventura měla neexistující kořeny `/var/lib/weewx` a
`/etc/weewx`; všech šest kandidátů jinak bylo zpracováno.

### Oprava přesnosti metadatového skeneru

Aktualizovaný `qc-rh-backup-inventory.mjs` záměrně vynechává
adresáře `tests`, `test`, `fixtures` a `schemas`
a známé systémové názvy `alternatives.tar.N`,
`dpkg.status.N` a `apt.extended_states.N`. Nemá jít o nové
archivní důkazy; jejich výskyt je jen falešně pozitivní shoda názvu.
Tyto složky jsou záměrně vynechané, **takže skutečnou zálohu v nich
lze najít až při jiném explicitním čtení**. Scanner neotevírá
obsah žádného souboru a neprochází symlinky.

Není potřeba znovu procházet stejná čtyři LXC kořenová umístění.

## Správná další oblast: Proxmox hostitel a zálohovací úložiště

Zálohy LXC uložené hostitelem Proxmox VE, Proxmox Backup Serverem
(PBS), nebo Synology/NAS **nemusejí být viditelné uvnitř LXC**.
Opakovaný scan `/home/loucka` tedy nenahradí inventuru
Proxmoxu a NAS.

### Co spustit na Proxmox hostiteli (nikoli v LXC)

Pouze metadata, bez obnovy:

```bash
pct list
pvesm status --content backup
```

Identifikuj VMID **původního** kontejneru, který sbíral data počasí
v roce 2022 (nemusí to být nynější vývojový frontend!), a ID
storage s backupy. Pak:

```bash
pvesm list STORAGE_ID --content backup --vmid VMID
```

Oficiální syntaxe nástroje `pvesm list STORAGE_ID --vmid VMID`
je podle dokumentace Proxmox. Pro automatický **read-only přehled
max. 80 řádků na storage** je v repozitáři
`api/scripts/qc-rh-pve-backups.sh`, který je určen pouze k
vědomému spuštění na Proxmox VE hostiteli:
```bash
bash qc-rh-pve-backups.sh
bash qc-rh-pve-backups.sh --vmid 123
```

Číslo `123` je pouze ukázkové; žádné skutečné VMID nebylo
zjistěno. Skript používá výhradně `pct list`,
`pvesm status --content backup` a
`pvesm list ... --content backup`, s časovým a výstupním limitem.
**Nevykonává `pct restore`, `vzdump`, `pvesm free`,
`pvesm prune-backups`, `mount` ani rozbalování**.

Pošli jen relevantní výpis názvů záloh (volid, typ, čas, VMID).
Nevypisuj ani neposílej konfigurace s hesly, tokeny nebo přístupovými
údaji ke vzdáleným storage.

Pokud `pvesm status` žádné relevantní zálohy neukáže,
zkontroluj další Proxmox uzel, PBS a příslušnou složku na Synology.
Nevytvářej a neobnovuj kontejner jen pro tento audit.

### Proč záloha po roce 2022 stále může pomoci

I snapshot vytvořený později může obsahovat starou databázi
původního loggeru a její historická měření. Názvové vyhledávání
jen podle roku **2022** nestačí. Naopak seznam záloh s názvem
2022 sám o sobě nezaručuje, že obsahují vlhkost z výpadku.

## Po nalezení vhodné zálohy

Další etapa bude samostatný **read-only seznam souborů uvnitř
konkrétní ověřené zálohy**, s limitem velikosti a zabezpečením
proti traversal/symlink útokům. Tím zjistíme, zda záloha obsahuje
původní WeeWX datové adresáře, MariaDB dumpy či raw logy
ze senzorů roku 2022. Žádnou zálohu neobnovovat do produkčního
LXC ani do existujících archivů.

Pokud neexistuje nezávislý původní zdroj, historie RH v měsících
leden–březen a květen–červen 2022 zůstává `blocked_no_local_validation`
a žádné automatické přepsání RH není přijatelné.
