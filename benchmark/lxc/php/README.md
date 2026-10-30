PHP CLI built-in server slouží POUZE pro řízené srovnání, NENÍ produkční HTTP stack. Na produkci použít PHP-FPM.
BENCH_DB_POOL_MAX=1 znamená jeden PHP worker. Na izolované DB při hodnotě 3 se spouští experimentální PHP_CLI_SERVER_WORKERS=3.
Jednotlivý PHP request vytváří neperzistentní PDO spojení, které na konci requestu zavře. Nejde o trvalý connection pool.
