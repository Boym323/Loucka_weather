# Opakování light benchmarku na LXC: přechodné chyby Rust API

Datum: 2026-10-30. Zdroj: uživatelem vložený výstup terminálu `meteo-bench@zl-dev-AuditMeteo`; jde o záznam předaných měření, nikoli o přímý přístup ke vzdálenému LXC nebo čtení jeho JSON/logů.

## Zjištění

Tři nová `./run.sh light` proti read-only MariaDB `11.8.6-MariaDB-0+deb13u1`, schéma `pocasi-loucka.eu`, `BENCH_YEAR=2025`, pevný `end_ts=1793389200`.

| Čas JSON souboru | Go | Rust | Python |
|---|---|---|---|
| `194417Z` | PASS 4 endpointy; 0 chyb | FAIL: 1 HTTP chyba u `current` | Nespustil se |
| `194424Z` | PASS 4 endpointy; 0 chyb | FAIL: 1 HTTP chyba u `current` | Nespustil se |
| `194433Z` | PASS 4 endpointy; 0 chyb | FAIL: 1 HTTP chyba u `yearly` | Nespustil se |

V každém pokusu před měřením všechny 4 odpovědi Rustu souhlasily s Go. Chyby se objevily až během měřené sekvence, nikoliv při prvotní kontrole správnosti JSON.

Naměřená latence 30denní historie **pouze Go**:

| Běh | Go RPS | Go p95 | RSS_peak |
|---|---:|---:|---:|
| 194417Z | 20.28 | 51.20 ms | 10.11 MiB |
| 194424Z | 13.03 | 80.22 ms | 10.44 MiB |
| 194433Z | 12.34 | 97.39 ms | 10.81 MiB |

Důležité: light režim měří 30denní historii pouze **3 požadavky**, takže p95 je prakticky maximum z velmi malého vzorku. Rozdíly mezi běhy mohou být způsobeny variabilitou SQL, sítí, hostitele nebo plánovače procesů. Nejsou dostatečným důkazem změny výkonu jazyka.

## Diagnostická slabina benchmark skriptu

V LXC balíčku `benchmark.py` je v `run_one` každá výjimka správně uložena do `measurements[].errors` ve výsledném JSON; do terminálu se však vypisuje pouze `error_count`. Soubor `results/rust.log` se při každém dalším testu přepisuje, takže pozdější runy zahodí starší logy. Warmup požadavky také nekontrolují HTTP status.

Bez výpisu `measurements[].errors` nelze určit, zda jde o HTTP 503 z `sqlx`, přerušené TCP spojení, HTTP timeout nebo jiný problém. Tyto různé příčiny vyžadují jiné řešení. **Není podložené automaticky přisoudit chybu Rustu nebo MariaDB.**

## Bezpečný postup

1. Z již existujících výsledků vypsat pole `measurements[].errors` z `results/benchmark_20261030T194417Z.json`, `...424Z.json`, `...433Z.json`. Neprovádí žádné SQL.
2. Pro poslední běh ověřit obsah `results/rust.log` (může být přepsán dalšími pokusy). Pokud se objeví `SQL failed`, jedná se o chybu z databázového ovladače; v opačném případě řešit stav HTTP transportu.
3. Diagnostická verze LXC skriptu by měla tisknout HTTP status, typ výjimky a ukládat logy jako `results/rust_<timestamp>.log`. Neměnit testovací SQL a nepřidávat retry, které by chyby maskovaly.
4. Po opravě konkrétní příčiny nejprve `smoke` a `light` na produkční read-only DB; `full` jen proti izolované kopii.

## Stav

**Ověření stability je nyní FAIL / BLOCKED_BY_UNDIAGNOSED_HTTP_ERRORS.** Původní jednorázový úspěšný běh stále platí, ale nedokazuje dlouhodobou spolehlivost. Doporučení Go jako nejvhodnějšího API je předběžné, nikoliv finální provozní rozhodnutí.
