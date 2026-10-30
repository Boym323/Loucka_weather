# Light benchmark tří HTTP serverů nad skutečnou WeeWX MariaDB – LXC

**Datum:** 2026-10-30  
**Hostitel dle dodaného terminálového výpisu:** `zl-dev-AuditMeteo`, uživatel `meteo-bench`.  
**Původ důkazů:** výstup `./run.sh light` dodaný uživatelem v chatu; tento zápis není nezávislým vzdáleným čtením souborů LXC.  
**Databáze:** MariaDB `11.8.6-MariaDB-0+deb13u1`, schéma `pocasi-loucka.eu`; backendový přístup pouze SELECT.  
**Režim:** `light`, 1 současný HTTP klient; nejedná se o zátěžové měření ani srovnání s izolovaným DB snapshotem.

## Provedení a validace

```text
MariaDB=11.8.6-MariaDB-0+deb13u1 from Debian;
schema=pocasi-loucka.eu;
posledni epoch=1793389200; 24h=288, 30d=8638,
rok 2025: 363 souhrnu
DB prava: kontrolovana, SELECT-only. Zadny SQL zapis.
go: 4/4 API odpovedi se shoduji
rust: 4/4 API odpovedi se shoduji
python: 4/4 API odpovedi se shoduji
PASS: vsechny 3 servery konzistentni; zadne SQL mutace.
```

## Naměřená HTTP data

**Každá buňka ukazuje RPS / p95 ms / RSS_peak MiB; pro všechny scénáře err=0.**

| Jazyk | current | 24h | 30d | yearly |
|---|---|---|---|---|
| Go | 32.16 / 32.56 / 7.04 | 31.34 / 32.42 / 7.59 | 18.47 / 59.48 / 10.43 | 31.49 / 32.83 / 10.23 |
| Rust | 28.04 / 39.79 / 5.33 | 26.68 / 43.74 / 5.48 | 15.05 / 73.23 / 6.73 | 29.19 / 36.39 / 6.58 |
| Python | 49.56 / 24.83 / 44.57 | 32.08 / 43.26 / 44.58 | 8.14 / 132.51 / 48.62 | 32.05 / 37.28 / 48.62 |

U 30denního endpointu: Go 18.47 RPS; Rust 15.05 RPS; Python 8.14 RPS. Go vůči Rust cca 1.227× a vůči Pythonu cca 2.269× v tomto jediném scénáři. Rust měl u tohoto endpointu cca 35.5% nižší zaznamenané RSS než Go. Python byl rychlejší u `/current`, takže žádný jazyk nevyhrál všechny testy.

### Co data potvrzují
- Všechny tři reálné servery umí přes HTTP získat stejné hodnoty ze skutečné existující MariaDB WeeWX.
- Implementace při čtyřech testovacích endpointech nezpůsobily SQL zápis ani viditelné HTTP chyby.
- V tomto vzorku je Go nejrychlejší u 30denního grafu, Rust má nejnižší zaznamenanou RAM, Python je nejrychlejší u `current`.
- Toto měření kvalitativně podporuje předchozí syntetický GitHub Actions benchmark, nelze však přenést absolutní časy (jiná databáze, hostitel, síť, klient).

### Co data **nepotvrzují**
- Nejde o opakované nezávislé měření rozptylu: `light` jeden běh a concurrency=1.
- Bez telemetrie DB nelze přisoudit cca 20–40ms baseline síťovému RTT, SQL ani jiným částem.
- Nejde o zatížení 10/50 současnými klienty; to proti živému WeeWX writeru **neprovádět**.
- Údaje RSS jsou podle lokálního měřicího skriptu, nikoliv ověřený paměťový budget produkční služby.
- Z terminálového výpisu neznáme CPU čas, hardware limity LXC ani latenci samotného SQL a nedokazujeme skutečnou kapacitu pro 100+ uživatelů.

## Doporučené další ověření
1. **Nejprve zopakovat `./run.sh light` 3–5×** se stejným nastavením pro orientační rozptyl, pokud reálný writer nemá provozní problémy; bez `full`.
2. Vyhodnotit stávající JSON/MD v `/home/meteo-bench/loucka-lxc-benchmark/results/` včetně procesorového času, velikostí odpovědí a konfigurace.
3. Pro concurrency 10/50 zprovoznit samostatný izolovaný **snapshot** skutečné databáze s read-only uživatelem; nepoužít produkční MariaDB pro hromadný benchmark.
4. Porovnávat dlouhé časové řady s downsamplingem na stejné rozlišení a stejné počty bodů. Kromě výkonu měřit využití DB CPU/IO.
5. Pro Go API v1 rozhodovat na základě více nezávislých opakování a skutečného cílového HW/latence, ne na základě jednoho light běhu.

## Záznamy na LXC

- JSON: `/home/meteo-bench/loucka-lxc-benchmark/results/benchmark_20261030T194213Z.json`
- Markdown: `/home/meteo-bench/loucka-lxc-benchmark/results/benchmark_20261030T194213Z.md`

Tyto cesty jsou **na uživatelském LXC**, nikoliv dostupné v GitHubu nebo v tomto chatu. Výše uvedený report byl sestaven z terminálového výpisu, nikoliv z těchto souborů.

**Verdikt:** předběžně zvolit Go pro API v1. Rust výborný z hlediska RAM; Python je u velkých serializovaných časových řad v tomto provedení nejpomalejší. Dříve než definitivně uzavřeme kapacitní rozhodnutí, doporučuje se snapshot/izolovaný zátěžový test.
