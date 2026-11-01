# Reálný offline výpočetní benchmark meteorologických statistik – 6 jazyků (31. 10. 2026)

## Provenience a rozsah

**Podklad:** úplný terminálový výpis uživatele z odděleného Debian 13 LXC `zl-dev-AuditMeteo`, spuštěno jako neprivilegovaný `meteo-bench` ze složky `benchmark/compute`. Číselné výsledky byly přepsány z poskytnutého stdout; originální `results/compute_*.json` **nebyly** pro tuto revizi nahrány. Reprodukovatelné podklady (lokální TSV fixture) a zdrojové implementace: [`benchmark/compute/`](compute/README.md).

Tři profily: `smoke` (**288 řádků**), `light` (**10 000**), `full` (**105 120 a 1 680 000**); každý se **3 pokusy** a šesti jazyky (Go, Rust, Python, Node.js, C++20, PHP CLI). To dává **72/72 jednotlivých pokusů PARITY PASS**: 18 smoke + 18 light + 36 full. Žádné SQL připojení ani zápis; dataset je **syntetický**, nikoliv skutečný výpis z produkční MariaDB.

Výpočet ověřuje shodné celkové, denní, měsíční a roční agregace: časově vážená teplota/vlhkost, suma intervalových úhrnů, vektorové průměry větru, extrémy a počty rekonstruovaných řádků. Parita je vůči referenční Python implementaci s tolerancí pro floaty. **PASS neznamená nezávislé vědecké ověření meteorologických algoritmů nebo pravdivosti rekonstrukcí.**

Měřená fáze je **parsing celého již načteného TSV + vlastní agregace a konstrukce struktury**. Načtení ze souboru a serializace JSON jsou mimo měřenou smyčku. RAM je vzorkovaná RSS celého procesu, zahrnuje vstup; CPU sekundy se měří za celý běh procesu. `light` má 2 interní iterace, ostatní po 1.

## Čas přepočtu – medián 3 pokusů

*Menší číslo je lepší. Všechna čísla jsou doba **jedné iterace** v milisekundách; poslední sloupec přepočítán z milisekund na sekundy.*

| Jazyk | 288 [ms] | 10 000 [ms] | 105 120 [ms] | 1 680 000 [s] |
|---|---:|---:|---:|---:|
| **Rust** | **0,66** | **19,31** | **263,92** | **4,10** |
| Go | 0,81 | 24,09 | 284,89 | 5,26 |
| C++ | 1,02 | 32,20 | 534,18 | 9,13 |
| Node.js | 30,85 | 109,82 | 1 124,36 | 15,36 |
| PHP CLI | 1,55 | 122,80 | 1 012,76 | 19,54 |
| Python | 3,20 | 208,29 | 3 146,99 | 37,82 |

**Rust je vítězem času všech čtyř velikostí datasetu**. U 1,68M řádků medián 4,10028 s oproti Go 5,25997 s: Rust o ~22,0 % kratší čas, Go o ~28,3 % delší čas než Rust. U malé fixture (288 řádků) absolutní rozdíly v milisekundách nejsou dost stabilní pro robustní tvrzení o overheadu jazyků.

## 1 680 000 řádků – jednotlivé pokusy [ms/iter]

| Jazyk | 1. pokus | 2. pokus | 3. pokus | Medián [ms] |
|---|---:|---:|---:|---:|
| Rust | 3 798,31 | 4 951,14 | 4 100,28 | **4 100,28** |
| Go | 5 259,97 | 4 751,49 | 5 842,77 | **5 259,97** |
| C++ | 9 128,68 | 10 030,49 | 8 685,50 | **9 128,68** |
| Node.js | 14 527,87 | 15 359,42 | 16 275,13 | **15 359,42** |
| PHP CLI | 19 331,04 | 19 652,10 | 19 538,03 | **19 538,03** |
| Python | 37 817,26 | 36 015,67 | 38 159,19 | **37 817,26** |

## 1 680 000 řádků – medián vzorkované RAM

| Jazyk | Medián RSS [MiB] | Nejvyšší RSS [MiB] |
|---|---:|---:|
| **Rust** | **107,23** | 107,41 |
| C++ | 112,32 | 115,98 |
| Node.js | 272,25 | 278,29 |
| PHP CLI | 304,59 | 304,63 |
| Python | 318,69 | 318,70 |
| Go | **422,54** | 422,59 |

Go v této konkrétní implementaci spotřebuje téměř **3,94×** více RSS než Rust. Neprokazuje to obecnou neefektivitu Go: současná implementace používá `strings.Split`, `map` a per-group `Stats`, při celkovém zpracování vytváří množství alokací; vhodný další test je změna interní reprezentace nebo streaming. RSS malého `smoke` může být podhodnocené vlivem krátkého trvání procesu a intervalu vzorkování, proto zde RAM porovnáváme především z 1,68M.

## Další metriky, interpretace a limity

- **CPU:** pro 1,68M se mediány procesu podle logu pohybovaly cca Rust 4,09 s, Go 5,14 s, C++ 9,36 s, Node.js 15,39 s, PHP 18,15 s, Python 34,86 s. Tato CPU metrika zahrnuje i mimočasované fáze; nejedná se o měření mikroarchitektonických cyklů.
- **Metodika:** pořadí jazyků se mezi pokusy rotuje, ale tři pokusy neposkytují spolehlivé intervaly spolehlivosti; hostitelské LXC se 2 dostupnými CPU může být ovlivněno sdílenou virtualizací.
- **Specifičnost:** porovnáváme nativní programy s konkrétními parsery a strukturami, nikoliv abstraktní „výkon jazyka“. Veškerá výstupní JSON serializace byla vyloučena z časování.
- **Meteorologie:** součet srážek je správně interpretovatelný jen při úplnosti, konzistentních intervalech a jednotkách. Časově vážený průměr předpokládá odpovídající délku archivačního intervalu. Syntetické výpadky a přechody CET/CEST jsou v testovacích datech, reálné anomálie v Loučce jimi nejsou definitivně ověřeny.
- **Samostatná volba stacku:** v HTTP testech dříve vedlo Go u historie 30 dní / c10, zde Rust při offline agregaci. To není rozpor – měří se různé operace. Samostatný Rust worker může být ekonomický, jen pokud přínos převýší složitost dvojího runtime a provozu.

## Doporučený další postup

1. **Pro API a grafy v1 ponechat Go jako předběžnou preferenci** na základě předchozích HTTP měření, nikoliv převést backend automaticky na Rust.
2. **Pro dávkové historické rekonstrukce zvážit Rust**, protože zde vede v rychlosti i RAM. Nejprve optimalizovat Go (stream/menší alokace) a opakovat tento benchmark, jinak nelze rozhodnout, zda druhý jazyk skutečně potřebujeme.
3. **Validovat výkon a numerickou shodu na reálném lokálním exportu ze staging kopie MariaDB**, ne na živé produkční DB, bez měnění originálního archivu.
4. Uchovat původní `compute_20261031T070708Z.json`, `compute_20261031T070730Z.json`, `compute_20261031T071410Z.json` pro možnost přesného forenzního opakování.

**Závěr:** Rust **4,10 s / 107 MiB** oproti Go **5,26 s / 423 MiB** u celohistorického offline přepočtu. Rozhodnutí pro celou aplikaci vyžaduje společné hodnocení API, výpočtů, databázových nákladů a údržby.
