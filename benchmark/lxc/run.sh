#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
MODE="${1:-help}"
usage(){ cat <<'END'
Pouziti (DEBIAN 13 / SAMOSTATNE TESTOVACI LXC):
  ./run.sh install  # apt instalace Go, Rust, Python a kompilacnich balicku
  cp config.example.env config.env && chmod 600 config.env
  nano config.env # DB ucet musi mit VYHRADNE SELECT
  ./run.sh probe    # jen par read-only SQL dotazu, NENI load test
  ./run.sh smoke    # sestavi 6 serveru a overi totozne odpovedi
  ./run.sh light    # nizka zatez, pouze 1 soubezny klient; i pro produkcni DB
  ./run.sh full     # 1/10/50 klientu, POUZE IZOlOVANA KOPIE DB
  BENCH_CONFIG=config.snapshot.env ./run.sh full  # izolovana staging DB
END
}
if [[ "$MODE" == help || "$MODE" == --help ]]; then usage; exit 0; fi
if [[ "$MODE" == install ]]; then
  if [[ "$EUID" -ne 0 ]]; then echo 'Instalaci apt proved jako root: sudo ./run.sh install' >&2; exit 1; fi
  export DEBIAN_FRONTEND=noninteractive
  apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip git ca-certificates curl build-essential pkg-config libssl-dev \
      golang-go cargo rustc nodejs npm php-cli php-mysql \
      libmariadb-dev libmicrohttpd-dev nlohmann-json3-dev
  echo 'Instalace hotova; pro samotny benchmark pouzij bezneho neprivilegovaneho uzivatele.'
  exit 0
fi
if [[ "$MODE" != probe && "$MODE" != smoke && "$MODE" != light && "$MODE" != full ]]; then usage; exit 2; fi
CONFIG="${BENCH_CONFIG:-config.env}"
[[ -f "$CONFIG" ]] || { echo "Chybi $CONFIG: cp config.example.env config.env" >&2;exit 2; }
if [[ "$EUID" -eq 0 ]]; then echo 'Benchmark nespoustej jako root. Pouzij bezneho uzivatele.' >&2;exit 2;fi
# Env soubor ve formatu shell je duveryhodny lokalni soubor; nespoustet od ciziho uzivatele.
# Soubory nesmi byt sdilene se skupinou/ostatnimi.
mode=$(stat -c '%a' "$CONFIG")
if (( (8#$mode & 8#077) != 0 )); then echo "Nastav prava: chmod 600 $CONFIG" >&2;exit 2;fi
set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a
for v in BENCH_DB_HOST BENCH_DB_PORT BENCH_DB_NAME BENCH_DB_USER BENCH_DB_PASSWORD;do
 [[ -n "${!v:-}" ]] || { echo "Chybi $v" >&2;exit 2; }
done
if [[ "$MODE" == full && "${BENCH_ISOLATED_DB:-NO}" != YES ]]; then
 echo 'FULL je blokovan pro produkci. Pouzij oddelenou testovaci kopii a BENCH_ISOLATED_DB=YES.' >&2;exit 2
fi
# Neinstalujeme nic na produkcni DB; vsechny zavislosti a kompilace zustavaji v testovacim LXC.
if [[ ! -x .venv/bin/python ]]; then python3 -m venv .venv; fi
.venv/bin/python -m pip -q install -r python/requirements.txt
if [[ "$MODE" != probe ]];then
  command -v go >/dev/null || { echo 'Chybi Go: ./run.sh install' >&2; exit 1; }
  command -v cargo >/dev/null || { echo 'Chybi Rust/Cargo: ./run.sh install' >&2; exit 1; }
  command -v node >/dev/null || { echo 'Chybi node (Node.js >=20)' >&2;exit 1; }
  command -v npm >/dev/null || { echo 'Chybi npm' >&2;exit 1; }
  command -v php >/dev/null || { echo 'Chybi PHP' >&2;exit 1; }
  php -m | grep -qi '^pdo_mysql$' || { echo 'Chybi php-mysql / PDO MySQL' >&2;exit 1; }
  command -v g++ >/dev/null || { echo 'Chybi g++' >&2;exit 1; }
  pkg-config --exists libmariadb libmicrohttpd || { echo 'Chybi libmariadb-dev/libmicrohttpd-dev' >&2;exit 1; }
  [[ -f /usr/include/nlohmann/json.hpp ]] || { echo 'Chybi nlohmann-json3-dev' >&2;exit 1; }
  node -e 'if (+process.versions.node.split(".")[0]<20) process.exit(1)' || { echo 'Node.js musi byt >=20' >&2;exit 1; }
  if [[ "${BENCH_ISOLATED_DB:-NO}" == YES ]];then
    export BENCH_DB_POOL_MAX="${BENCH_DB_POOL_MAX:-3}"
  else
    export BENCH_DB_POOL_MAX=1
  fi
  if (( BENCH_DB_POOL_MAX < 1 || BENCH_DB_POOL_MAX > 4 ));then echo 'DB pool musi byt 1..4' >&2;exit 1;fi
  echo 'Instaluji node deps lokalne (ne do DB)...'
  if [[ ! -d node/node_modules/mariadb || ! -d node/node_modules/fastify ]];then
    (cd node && npm install --no-audit --no-fund --omit=dev --silent)
  fi
  echo 'Kompiluji C++ (jen na testovacim LXC)...'
  g++ -std=c++20 -O2 -pthread cpp/main.cpp -o cpp/loucka-bench-cpp $(pkg-config --cflags --libs libmariadb libmicrohttpd)
  echo 'Kompiluji Go (jen na testovacim LXC)...'
  (cd go && go mod tidy && GOMAXPROCS=2 go build -o loucka-bench-go .)
  echo 'Kompiluji Rust (jen na testovacim LXC, snizena paralelizace)...'
  (cd rust && CARGO_BUILD_JOBS=2 CARGO_INCREMENTAL=0 cargo build --release --jobs 2)
fi
mkdir -p results
if [[ "${BENCH_ISOLATED_DB:-NO}" == YES ]];then
  export BENCH_DB_POOL_MAX="${BENCH_DB_POOL_MAX:-3}"
else
  export BENCH_DB_POOL_MAX=1
fi
.venv/bin/python benchmark.py "$MODE"
