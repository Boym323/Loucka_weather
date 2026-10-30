# Srovnávací benchmark Go / Rust / Python nad MariaDB

Tento benchmark **není provedením auditu skutečného produkčního serveru**. Spouští tři reálné HTTP servery jeden po druhém na totožném GitHub Actions runneru a proti stejnému dočasnému MariaDB 11.8 servisu se syntetickými daty podobnými archivnímu rozložení WeeWX.

## Předpoklady
- Go 1.23+, Rust stable/Cargo, Python 3.12+, MariaDB 11.8 a dostupné balíčky z internetu.
- MariaDB databáze `weewx` s testovacím uživatelem `bench`, heslo `bench`, pouze v **izolovaném CI kontejneru**; na produkci nepoužívat.
- `fixture.py` vytváří `archive`, `archive_day_outTemp` a `archive_day_rain` ve zjednodušeném *testovacím* schématu, 200 dní × 288 pětiminutových řádků = **57 600 měření** a 200 denních agregátů.
- Tyto fixture tabulky nemají všechny atributy skutečné WeeWX databáze; benchmark ověřuje typický SELECT workload, nikoliv komplexní meteorologickou správnost historické instance.

## Endpointy ve všech třech jazycích
| Endpoint | SQL |
|---|---|
| `/current` | `ORDER BY dateTime DESC LIMIT 1` |
| `/history/24h` | časový index `dateTime`, 288 řádků |
| `/history/30d` | časový index `dateTime`, 8640 řádků |
| `/statistics/yearly` | čtení 200 `archive_day_*` řádků a časově vážený průměr + úhrn srážek |

Stejný connection pool maximálně 3, lokální HTTP loopback, průběžné porovnání skutečných JSON hodnot. Každý server se spouští samostatně, aby se vzájemně nepředbíhaly. Testuje se souběh 1/10/50 klientů a opakuje se sada dotazů. Měří se HTTP p50/p95/p99, requests/sec, CPU procesového času, resident memory a čas kompilace.

**Omezení:** Runner není dedikovaný laboratorní stroj a sdílí CPU s databázovým kontejnerem; jde o end-to-end aplikační benchmark, nikoliv oddělené měření samotného HTTP parseru/ovladače. Výsledky mohou kolísat; pro produkční rozhodnutí navázat benchmarkem na stagingu poblíž skutečné DB, s monitorováním vlivu na WeeWX writer. Rust/Go/Python mohou mít rozdílnou optimalizaci JSON; to je součást porovnávaného produkčního stacku. Vysoká koncurrency při pouze 3 DB spojeních simuluje frontu.

## Spuštění
Workflow: `.github/workflows/bench-backends.yml`. Spouští se po změnách v benchmark větvi. Po úspěšném běhu jsou výsledky v `benchmark/results.json` jako artefakt `benchmark-results`; časy buildů v logu workflow.

Pokud instalace závislostí, compile nebo validace odpovědí selže, benchmark se označí jako FAILED, nesmí se hlásit neexistující výkonové výsledky. Nepracuje s produkční MariaDB a neprovádí na ní žádnou změnu.
