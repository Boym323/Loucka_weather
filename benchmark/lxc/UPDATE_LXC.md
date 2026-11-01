# Aktualizace existujícího LXC benchmarku (3 → 6 jazyků)

1. Na testovacím LXC jako `meteo-bench` ulož nový ZIP do `/home/meteo-bench/` (ne do projektu).
2. V terminálu spusť:

```bash
cd ~/loucka-lxc-benchmark
cp benchmark.py benchmark.py.pre-six.bak
cp run.sh run.sh.pre-six.bak
unzip -o ~/loucka-benchmark-six.zip -d ~/loucka-lxc-benchmark
chmod +x run.sh create-local-snapshot.sh
```

3. **Jen pro instalaci nových systémových závislostí** jednou spusť jako root `sudo ./run.sh install`. Aplikaci a benchmark potom spouštěj už pouze jako `meteo-bench`:

```bash
./run.sh probe
./run.sh smoke
./run.sh light
```

Pokud se u C++ objeví chyba kompilace, zašli výpis `g++`. Pokud Node.js hlásí verzi nižší než 20, nainstaluj kompatibilní Node.js 22 nebo 24.

**Stávající `config.env` se nerozbaluje ani nepřepisuje.** `BENCH_DB_POOL_MAX` je na neizolované DB vynucen na 1, bez ohledu na obsah config.env. `full` zůstává blokovaný pro neizolovanou databázi. Testy c=10/50 a pool>1 pouze proti ověřené izolované kopii DB.

Příklad ověření jen nových jazyků, přitom Go je reference:

```bash
BENCH_LANGUAGES=go,node,cpp,php ./run.sh smoke
```

**Poznámka k metodice:** PHP používá experimentální CLI web server, nikoliv PHP-FPM. Výsledky slouží k technickému srovnání této konkrétní implementace, ne k obecnému hodnocení PHP v produkci.
