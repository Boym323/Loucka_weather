# Loučka Weather – offline benchmark vlastních meteorologických statistik

Porovnává **šest samostatných, nativních implementací**: Go, Rust, Python, Node.js, C++20 a PHP 8.4. Nejde o HTTP/SQL benchmark. Záměrně **neobsahuje databázové připojení** – v žádném z benchmarkovaných jazyků ani v runneru. Vstupem je lokální kanonické TSV uložené na testovacím LXC. Počítá a porovnává *skutečné statistiky z původních intervalových záznamů*, nikoli předpočítané denní tabulky WeeWX.

## Bezpečné spuštění na Debian 13

Závislosti: Python 3.11+, Go 1.23+, Rust stable (Cargo), Node.js 20+, g++ s C++20, PHP CLI 8+, Linux `/proc` pro vzorkování RSS. Žádné externí Python knihovny, npm balíčky ani Rust crates.

```bash
cd loucka-stats-benchmark
python3 run.py smoke                 # 288 syntetických záznamů, 6 backendů, 3 pokusy
python3 run.py light                 # 10 000 záznamů, 3 pokusy / 2 iterace
python3 run.py full                  # 105 120 + 1 680 000 záznamů, 3 pokusy
# Vlastní existující lokální export, žádný SQL dotaz:
python3 run.py full --data /path/to/local_weather.tsv --trials 3 --iterations 2
```

V `full` se používá syntetický dataset dvou velikostí. Vytvoření velkého souboru zabere místo na disku a výkon; prováděj pouze na testovacím LXC. Nepouštěj více `full` procesů současně. Odhadovaná velikost velkého TSV ~100 MB a paměť může u některých jazyků násobně převýšit velikost souboru. Pro omezené prostředí zkus nejprve `light`.

### Příprava reálného lokálního exportu

Použij **existující CSV export ze samostatné lokální kopie** databáze WeeWX (ne produkční zátěžový export). Požadované sloupce včetně hlavičky: `dateTime,interval,usUnits,outTemp,rain,windSpeed,windDir,outHumidity`, volitelně `source` (O – originál, R – rekonstrukce, U – neznámý původ). Vstup může být CSV nebo TSV, chronologicky vzestupně.

```bash
python3 normalize_weewx_csv.py /path/to/snapshot_archive.csv data/real_canonical.tsv
python3 run.py full --data data/real_canonical.tsv --trials 3
```

Normalizátor **čte výhradně soubory**, nikdy se nepřipojí k MariaDB. Respektuje WeeWX `usUnits`: US (1, °F/in/mph), METRIC (16, °C/cm/km/h), METRICWX (17, °C/mm/m/s) a převádí do °C, mm a m/s. Neznámé jednotky odmítne. Null zůstává null, nikdy se tiše nenahrazuje nulou. Lokální den určuje podle `Europe/Prague` a **`dateTime - 1 sekunda`**, protože archivní hodnota představuje konec intervalu `(start, end]`. Vstupní `source` musí být pravdivě doložen datovou proveniencí; samotná hodnota v rekonstruovaném schématu nemusí dokazovat rekonstrukci. Nenutíme smísení různých zdrojů.

### Kanonický formát

UTF-8 TSV, řádek: `endTs intervalMin localDay tempC rainMm windMs windFromDeg humidityPct source`, odděleno tabulátorem. Chybějící veličina `-`, nikoli `0`. Řádky jsou řazené dle `endTs`, lokální kalendářní den je již normalizovaný. Test syntetických dat obsahuje výpadky, měnící se délky intervalů, vlajky rekonstruovaného původu a období včetně přechodů CET/CEST.

### Stejné výpočty v každém jazyce

- **Denní/měsíční/roční/celkové** agregace a počty datových bodů i intervalových minut.
- **Teplota:** časově vážený průměr (`sum(temp * intervalMin) / sum(valid intervalMin)`), min/max a `tempMinutes` jako indikátor úplnosti.
- **Srážky:** součet jednotlivých nezáporných intervalových úhrnů v mm, `rainN`, null pokud žádné platné měření; výsledek není výpočet z `rainRate` ani z kumulativního čítače.
- **Vítr:** rychlost a směr výsledného vektoru z průměrování `speed*sin(dir)` a `speed*cos(dir)`, váženého intervalovými minutami. `windVectorMs` je **velikost průměrného vektoru**, nikoli průměr absolutních rychlostí ani směrová konvence vektoru „kam fouká“; `windDir` je meteorologický směr **odkud** vítr vane.
- **Relativní vlhkost:** časově vážený průměr platných hodnot.
- **Provenience:** počet řádků označených `R` se uvádí zvlášť; průměr zahrnuje všechny vstupní řádky. Benchmark **neposuzuje pravdivost nebo kvalitu rekonstrukcí**.

### Co se měří a co ne

Program **nejprve přečte celý soubor do RAM**. V měřené části parsuje TSV z tohoto textu, přepočítává denní/měsíční/roční/celkové výsledky a sestavuje interní souhrnnou strukturu. Výstupní JSON serializace a čtení ze souborového systému jsou **mimo měřenou část**. Nejde o čistě numerické FLOPS ani o DB benchmark: parsování TSV a tvorba struktur jsou součástí výpočetního pipeline. Report ukládá čas v milisekundách/iteraci, CPU sekundy celého spuštěného procesu (včetně serializace), RSS procesu a parity.

`run.py` porovnává každý den, měsíc, rok i celkovou agregaci s referenční Python implementací; celočíselné veličiny přesně, plovoucí s tolerancí `rel_tol=1e-7`, `abs_tol=1e-6`. Jakákoliv odchylka je **FAIL**. Pořadí jazyků se mezi třemi pokusy rotuje, aby jedno pevné pořadí nemělo výhodu. Výsledné JSON/MD jsou v `results/` a obsahují SHA-256 datasetu pro reprodukovatelnost.

### Omezení

Výpočetní výkon syntetické řady neprokazuje meteorologickou správnost u všech reálných extrémů. Před ostrým nasazením je nutná samostatná validace jednotek, výpadků, změn senzorů, korekcí, časových hranic a správnosti denních agregací vůči ověřeným referencím. Délka intervalu v reálných datech musí reprezentovat skutečný úsek měření, nikoli jen fixních 5 minut. Pro `source=R` musí existovat evidovaná provenance. Bez ověření nepřipisuj algoritmu klimatologickou interpretaci (např. roční úhrn při mezerách).

**Běhy nezasahují do produkční databáze; nikdy nespouštěj další `full` HTTP/SQL benchmark na produkci.**
