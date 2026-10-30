# Ověření benchmarku na skutečné databázi Počasí Loučka

**Stav:** plán bezpečného staging ověření; není ještě vykonaný end-to-end benchmark proti skutečné MariaDB. Úvodní read-only SQL kontrola provedena 2026-10-30 přes Weather MCP.

## Co už bylo ověřeno
- Produkční **MariaDB 11.8.6** se schématem `pocasi-loucka.eu`, `archive` 1 680 135 záznamů při posledním čtení a 6090 řádků `archive_day_outTemp`.
- `SELECT ... ORDER BY dateTime DESC LIMIT 1` vrací živý archivní řádek, `usUnits=16`, `interval=5` u poslední hodnoty.
- `archive_day_outTemp` a `archive_day_rain` lze spojovat přes `dateTime`; jedna roční kontrola pro 2025 vrátila 363 denních řádků.
- Omezený 30denní dotaz měl v jednom čase 8638 pětiminutových záznamů. Reálný objem se liší podle aktuálního timestamp a výpadků.
- Tato kontrola ověřuje SQL a schéma, **ne** rychlost serverů. Doba volání MCP zahrnuje transport, autorizaci, síť a serializaci.

## Proč CI s fixture není definitivní
- Runner v GitHub Actions obsluhuje izolovaný MariaDB 11.8 kontejner s 57 600 syntetickými řádky, ne produkčních 1,68 milionu.
- Produkční WeeWX tabulky mají mnoho NULL, různě dlouhé intervaly, `usUnits`, desítky polí a historii oprav; testovací fixture je redukovaná.
- Porovnávané servery mají různé strategie tvorby JSON: Rust `Vec<serde_json::Value>`, Python `dict` přes FastAPI a Go typované struct. To měří konkrétní implementace, nikoliv izolovanou rychlost jazyka.
- GitHub runner není stejné CPU, IO a síťové prostředí jako plánovaný třetí LXC. Benchmark bude potřeba zopakovat na shodném hostiteli.

## Bezpečný skutečný staging test

1. **Získat nezměněný konzistentní snapshot** stávající `pocasi-loucka.eu` (archive + všechny souhrny potřebné pro test) a importovat jej na izolovanou staging MariaDB. Export dělat z produkce pouze SELECT/single-transaction a v době nízké zátěže; neprovádět test s desítkami klientů proti WeeWX writer DB.
2. Vytvořit pouze pro tuto *kopii* read-only `SELECT` účet; credentials ponechat v lokálním env mimo GitHub a logy. Nikdy neotevírat privátní MariaDB hostovaný ve veřejném CI.
3. Na samostatném staging LXC spustit přesně tři buildy Go/Rust/Python proti stejnému hostiteli DB a stejné snapshot verzi; vždy pouze jeden API server v čase.
4. Přizpůsobit benchmark skutečnému schématu: názvy DB s pomlčkou a tečkou, `archive.dateTime`, `interval`, `usUnits`, null hodnoty, `archive_day_*`. Nechat stejné hranice dnů v `Europe/Prague` a stejnou definici průměrů/srážek.
5. Společný endpointový kontrakt: `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly`, `/climate/records` a náročná větrná růžice. Není-li hodnota, vracet null, nikoliv falešnou nulu. Shoda všech JSON hodnot před výkonovým měřením.
6. Nastavit stejný max pool (např. 3), stejný timeout a parametry HTTP keep-alive. Otestovat uncached i warm TTL cache a zvlášť gzip/br HTTP kompresi. Limitovat max bodů a max dobu historického query.
7. Zajistit **srovnatelnou serializaci** (Go typované struct, Rust typované struct/Serde namísto Value, Python s optimalizovaným JSON například orjson jako samostatná varianta). Porovnávat stejný JSON obsah a čísla.
8. Každý test zopakovat min. 5×, randomizovat pořadí jazyků, zahřát DB cache. Souběžnost 1,10,50; p50/p95/p99 a RPS + CPU/RSS API, CPU/IO MariaDB, počet současných spojení a CI build čas. Po testu porovnat odchylky a intervaly spolehlivosti.
9. Nezatěžovat produkční WeeWX. Ověřit, že velké grafy používají `dateTime` range a denní statistiky `archive_day_*`; u velmi dlouhých období použít agregace.
10. Z výsledků připravit finální ADR Go vs Rust vs Python a změřený release budget LXC 3.

## Blokující fakta před provedením
- Nový staging LXC a hostitel pro benchmark zatím nejsou v tomto repozitáři potvrzené jako dostupné.
- ChatGPT nemá potvrzený spouštěcí přístup ke staging LXC ani databázovému snapshotu; Weather MCP zprostředkuje jen jednotlivé read-only SQL dotazy.
- Pro veřejně hostovaný GitHub runner není doložen bezpečný síťový přístup k lokální MariaDB.
- Zde se nezapisují žádná hesla ani interní adresy.

**Závěr:** Koncepční a funkční ověření lze udělat nyní read-only. Definitivní výkonové porovnání na reálné MariaDB bude možné po připravení izolovaného snapshotu a běhového prostředí. Nepovažovat GitHub fixture výsledky za produkční latenci.
