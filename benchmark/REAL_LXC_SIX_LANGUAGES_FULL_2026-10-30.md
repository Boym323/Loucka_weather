# Skutečný šestijazyčný FULL benchmark – analýza originálního JSON (2026-10-30)

> **Záznam jednoho kompletního běhu**, nikoliv medián tří opakování. Zdroj: ZIP `loucka-full-6x3.zip` dodaný uživatelem, obsahuje pouze jediný JSON `benchmark_20261030T205008Z.json`. Tento report vznikl kontrolou jeho skutečného obsahu, ne pouhým opisem terminalového výpisu. Originální soubor je u uživatele v LXC/konverzaci, nikoliv pod GitHubem.

## Validace a provenance

- **72/72 jedinečných měřených scénářů**, Go/Rust/Python/Node.js/C++/PHP × čtyři endpointy × souběžnost 1/10/50, všechny `ok == requests`, **0 HTTP chyb**.
- Celkem **13 032 úspěšných HTTP požadavků**. Pro každou kombinaci backend × souběžnost bylo: `current=300`, `24h=150`, `30d=24`, `yearly=250`.
- Databáze `11.8.6-MariaDB-0+deb13u1`, schéma `pocasi-loucka.eu`, pevný časový řez `end_ts=1793392800`; 288 bodů za 24h, 8638 za 30d, 363 ročních souhrnů 2025.
- `environment.cpu_count=2` (záznam Pythonu, nikoli audit CPU quota) a **`pool_max="3"`**.
- **Kritický rozpor:** `db.isolated_copy=true`, ale uživatel výslovně potvrdil, že šlo o **živou produkční DB**. Proto test klasifikujeme jako **produkční**, přestože metadata byla označena jako izolovaná kopie. Příznak `BENCH_ISOLATED_DB=YES` není skutečná kontrola izolovanosti.
- Jde pouze o **1 celý běh**; archiv neobsahuje druhý a třetí JSON. **Nejsou k dispozici tříběhové mediány, směrodatné odchylky ani intervaly spolehlivosti.**

## Kompletní propustnost (RPS, více je lépe)

| Endpoint | c | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 1 | 31.38 | 23.52 | 51.12 | 51.24 | 55.60 | 13.00 |
| current | 10 | 103.94 | 23.63 | 165.18 | 158.24 | 195.34 | 55.38 |
| current | 50 | 100.99 | 23.35 | 94.00 | 117.97 | 156.83 | 55.60 |
| 24h | 1 | 26.15 | 22.89 | 36.01 | 42.49 | 45.29 | 12.67 |
| 24h | 10 | 98.28 | 22.89 | 65.71 | 131.41 | 180.43 | 53.77 |
| 24h | 50 | 95.91 | 21.61 | 67.80 | 125.62 | 92.47 | 53.13 |
| 30d | 1 | 13.67 | 17.74 | 4.28 | 15.21 | 14.43 | 6.15 |
| 30d | 10 | 24.89 | 16.03 | 6.05 | 16.29 | 21.36 | 22.65 |
| 30d | 50 | 26.24 | 15.36 | 5.19 | 37.31 | 21.23 | 20.30 |
| yearly | 1 | 29.86 | 23.18 | 46.74 | 42.16 | 49.62 | 12.95 |
| yearly | 10 | 97.91 | 23.44 | 175.64 | 162.06 | 200.84 | 55.00 |
| yearly | 50 | 81.96 | 23.36 | 92.82 | 98.89 | 120.05 | 54.28 |


## Kompletní latence p95 (ms, méně je lépe)

| Endpoint | c | Go | Rust | Python | Node.js | C++ | PHP CLI |
|---|---:|---:|---:|---:|---:|---:|---:|
| current | 1 | 35.91 | 47.08 | 26.19 | 26.09 | 23.00 | 86.29 |
| current | 10 | 209.83 | 435.31 | 119.27 | 106.77 | 75.61 | 196.48 |
| current | 50 | 1325.67 | 2157.69 | 1439.29 | 1154.23 | 687.29 | 988.28 |
| 24h | 1 | 47.41 | 49.63 | 41.09 | 34.24 | 30.96 | 90.75 |
| 24h | 10 | 214.10 | 461.48 | 258.70 | 127.97 | 78.78 | 196.62 |
| 24h | 50 | 1270.24 | 2396.99 | 1535.49 | 922.17 | 990.12 | 947.68 |
| 30d | 1 | 98.21 | 62.64 | 310.81 | 103.85 | 94.95 | 177.57 |
| 30d | 10 | 501.28 | 657.32 | 2040.13 | 619.19 | 552.91 | 647.27 |
| 30d | 50 | 878.14 | 1456.53 | 4606.76 | 614.32 | 1077.36 | 1038.08 |
| yearly | 1 | 39.52 | 47.85 | 29.93 | 32.20 | 27.43 | 84.74 |
| yearly | 10 | 229.67 | 436.42 | 90.29 | 115.65 | 55.50 | 202.24 |
| yearly | 50 | 1372.52 | 2142.39 | 1499.43 | 1374.54 | 1064.94 | 1292.41 |


## Celkově nejvyšší vzorkovaná RSS za 12 scénářů/backend

| Server | Max RSS (MiB) |
|---|---:|
| Rust | 7.70 |
| Go | 14.47 |
| Python | 49.59 |
| PHP CLI | 81.28 |
| C++ | 94.04 |
| Node.js | 114.23 |

Vzorkování RSS cca 25 ms zahrnuje server a potomky. CPU sekundy se měří jen u rodičovského procesu, takže zvlášť pro PHP se třemi CLI workery nejsou CPU časy napříč jazyky přímo srovnatelné.

## Metodická omezení, která mění interpretaci

1. **`30d c=50` není 50 aktivních HTTP požadavků**: posílá se pouze **24 requestů celkem**, tedy v jednom okamžiku nanejvýš 24. Pole `concurrency=50` pouze nastavuje horní limit. **Node.js 37,31 RPS při `30d c=50` je reálně výsledek se souběžností nejvýše 24, ne ověření 50 klientů.**
2. U každého `30d` scénáře je jen **24 požadavků**, což je málo pro kvalitní p95/p99 a spolehlivé kapacitní závěry. Pro `current` je jich 300, `24h` 150 a `yearly` 250.
3. Jazyky jsou spuštěny vždy ve **fixním pořadí Go → Rust → Python → Node.js → C++ → PHP**. DB buffer pool, warmup, host CPU/IO a okolní produkční provoz mohou zkreslit výsledky.
4. **Pool=3 proti produkci** je vyšší než v předchozím full testu s pool=1; výsledky nelze průměrovat nebo bezpodmínečně porovnávat. Účet `loucka_audit` má dle předchozí diagnostiky limit `max_user_connections=4`.
5. **Neznáme DB CPU, diskové I/O, ani latenci WeeWX writeru** během testu; read-only zaručuje absenci SQL mutací, ale ne nulový vliv na běžící produkci.
6. **PHP CLI server není Nginx+PHP-FPM**; závěr nelze přenášet na produkční PHP architekturu. C++ RSS při zátěži nelze bez dalšího profilování pokládat za memory leak.
7. Šest backendů používá své implementace DB ovladačů, serializace a HTTP. Benchmark měří konkrétní stack, nikoli obecnou rychlost jazyka.

## Praktické závěry

- U `current c10`: **C++ 195,34 RPS** (p95 75,61 ms), Python 165,18, Node 158,24, Go 103,94, PHP 55,38, Rust 23,63.
- U `24h c10`: **C++ 180,43 RPS** (p95 78,78 ms), Node 131,41, Go 98,28, Python 65,71, PHP 53,77, Rust 22,89.
- U `30d c10`: **Go 24,89 RPS** (p95 501,28 ms), PHP 22,65, C++ 21,36, Node 16,29, Rust 16,03, Python 6,05.
- U `yearly c10`: **C++ 200,84 RPS** (p95 55,50 ms), Python 175,64, Node 162,06, Go 97,91, PHP 55,00, Rust 23,44.
- U `30d c1`: **Rust 17,74 RPS**, následován Node 15,21, C++ 14,43 a Go 13,67.
- U `30d c50` (max. 24 skutečně současných požadavků): **Node.js 37,31 RPS** a p95 614,32 ms, Go 26,24 a p95 878,14 ms; důkaz jen o tomto jediném testovacím vzorku.
- **Rust je paměťově nejúspornější** (max RSS 7,70 MiB), Go má max 14,47 MiB; přitom C++ a Node mohou mít vysoké RSS při zátěži (94,04 a 114,23 MiB).

**Rozhodnutí pro Loučka Weather v1:** Go ponechat jako předběžně preferovanou implementaci kvůli poměru výkon / nízká paměť / údržba; C++ výrazně zaujalo u malých odpovědí, Node.js u velké historie s vyšší (ale ne skutečně 50) souběžností, Rust extrémně nízkou RAM. **Není podklad pro definitivní výběr** z jediného běhu s chybně nastavenou klasifikací produkční DB.

**Další postup:** žádný další `full` na živé MariaDB. Na samostatné staging kopii zvýšit počty měřených `30d` požadavků nad 50, standardizovat DB pool a podmínky, střídat pořadí jazyků, provést ≥3 plné běhy a měřit DB CPU/IO. Příznak `isolated_copy` nikdy nepovažovat za důkaz fyzické izolace.
