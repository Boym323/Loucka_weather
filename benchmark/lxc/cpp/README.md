C++20 benchmark server: GNU libmicrohttpd (loopback-only HTTP), MariaDB Connector/C, nlohmann/json.
Debian 13 závislosti: build-essential pkg-config libmariadb-dev libmicrohttpd-dev nlohmann-json3-dev.
Sestavení: g++ -std=c++20 -O2 -pthread cpp/main.cpp -o cpp/loucka-bench-cpp $(pkg-config --cflags --libs libmariadb libmicrohttpd)
SQL obsahuje jen SELECT; hodnoty časových hranic jsou parsed striktně jako celé číslo a nikdy nejsou převzaty z HTTP požadavku.
