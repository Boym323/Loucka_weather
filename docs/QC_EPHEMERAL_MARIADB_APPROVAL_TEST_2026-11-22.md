# Izolované integrační testy quality/provenance a schvalovacích transakcí (#25, #26)

## Ochrana před produkčním zápisem

Tento test **není** migrační ani nasazovací mechanismus. `api/src/qc-dev-schema.ts` generuje SQL DDL **jen** pro název `qc_ci_<numeric-run-id>`. Generátor není importován běžícím Fastify API. Test `api/test/qc-mariadb-integration.test.ts` provádí DDL/DML **jen pokud současně platí**: `CI=true`, `GITHUB_ACTIONS=true`, `WEATHER_TEST_LOCAL_FIXTURE=YES` a číselný `GITHUB_RUN_ID`. Používá *natvrdo* `127.0.0.1:3306` a syntetické CI přihlašovací údaje; ignoruje produkční `WEATHER_DB_HOST`, `WEATHER_DB_USER` i `WEATHER_DB_SCHEMA`. V ostatních prostředích se test automaticky přeskočí.

Github workflow `.github/workflows/api-staging.yml` již spouští samostatnou MariaDB 11.8 Docker service. Test je navázán na existující `npm test` job `isolated-mariadb`. Schéma je po testu zrušeno pouze uvnitř této ephemeral instance.

## Testované skutečné DB invariants

1. Vytvoření čtyř metadatových struktur: `sensor_epoch`, `observation_raw_ref`, `measurement_qc`, `reconstruction_manifest`; navíc izolovaná `archive_fixture` pro transakce.
2. Dvě různé QC pro jeden `target_time_utc`: originální číselná **0** v `UNVERIFIED` a současná `MISSING` s **NULL**. FK na originální pozorování, evidence sensor epoch a SHA256 reference.
3. DB CHECK odmítá `UNVERIFIED` s `approved=true` a `SENSOR_ERROR` s číselnou `display_value`.
4. `DRY_RUN` bez explicitního approval **nemůže** přejít do `APPROVED`.
5. NULL-safe compare-and-swap (`<=>`) a `ROLLBACK` vrací syntetické `rain` přesně na původní NULL; následný hash-pinned synthetic approved batch udělá jednu změnu, opakovaný apply starého old_value neprojde.
6. Samostatný compare-and-swap rollback podle postimage a mark `REVERTED` obnoví původní NULL.
7. Dvě oddělené SQL session: writer B s krátkým `innodb_lock_wait_timeout` nesmí obejít zámek writeru A; po commitu A má B starou CAS hodnotu a změna vrací `affectedRows=0`.

Testy **neprokazují** běh skutečného migračního runneru na celé `loucka_reconstruction`, úplnou zálohu s restore snapshotem, hash reálného migračního manifestu ani nezávislé meteorologické důkazy. Tyto podmínky v issues #25/#26 zůstávají otevřené; žádný produkční write/cutover tím není schválen.

## Poznámka k produkčnímu návrhu

Výsledné metadatové tabulky jsou první integračně otestovaný ERD **v izolovaném testovacím prostředí**, nikoliv schválený produkční migration SQL. Systém nebude automaticky klasifikovat všech 80 sloupců podle existence archive. Pro veřejnou verzi navazuje read-only `/api/v1/quality/observations`, který původní hodnoty označuje `UNVERIFIED`, ale nemění DB.
