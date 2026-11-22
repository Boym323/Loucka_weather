# Read-only API kvality původních měření (issue #25)

Implementace v `api/src/original-quality.ts` a `api/src/app.ts`.

## End-point

`GET /api/v1/quality/observations?metric=outTemp&from=2026-10-25T00:00:00Z&to=2026-10-25T03:00:00Z&units=metricwx`

- Pouze **původní (necertifikovaný) WeeWX archiv**. `dataset=approved` odpoví `503 DATASET_UNAVAILABLE`. Název staré DB nedokládá software, který původně měření zaznamenal; pre-WeeWX import z Cumulusu může být součástí řady.
- Přísně allowlisted metriky podle `schemas/metrics.json`, všechna SQL čtení přes stávající SELECT-only `ArchiveReader.history` s parametrizací. Žádná nová databázová role, DDL nebo INSERT/UPDATE/DELETE.
- Čas `(from,to]` pouze s RFC3339 časovým pásmem; interval nejvýše **48 hodin**, limit **1 až 2 000** jednotlivých archivních řádků (výchozí 750). Přetečení => `422`, nikoli potichu oříznutá řada.
- Pro každý skutečně existující interval API vrací `timestampUtc`, `endTime`, `localEndIso` s offsetem CET/CEST a `localFold` při opakované podzimní hodině, jednotku, původní `usUnits`, `measurementValue`, `displayValue` a **stav po konkrétní veličině**.
- `UNVERIFIED`: číslo v originálním archivu (včetně 0), ale bez prokázaného fyzického senzoru/driveru/epochy. `extremaEligible=false`, `approved=false`, `independentValidation=false`, `epochRef=null`, `changeRef=null`, `qcFlags=[ORIGINAL_NOT_INDEPENDENTLY_VALIDATED]`.
- `MISSING`: pole je `NULL` v existujícím archivním řádku; `measurementValue=null`, `displayValue=null`. Není totéž co `NOT_INSTALLED` ani nulové měření.
- `SENSOR_ERROR`: rozpoznané dosud chybné mapování `lightning_disturber_count` / `lightning_noise_count`; číselná hodnota v API **zadržena** (NULL), `qcFlags=[UNVERIFIED_FIELD_MAPPING]`, originální DB se nemění.
- `gaps` je pole skutečných chybějících časových segmentů s `displayValue=null` a `qcFlags=[NO_ARCHIVE_ROW]`; žádná náhrada nulou, spojnice ani interpolace přes dlouhý výpadek.
- `summary` uvádí počty podle jednotlivých stavů, `extremaPolicy=none_eligible_until_per_field_provenance`. Podle verze původních `archive_day_*` tento endpoint **nepočítá certifikované klimatologické rekordy**.

## Bezpečnostní hranice

API **nepřebírá** auditní DB `loucka_reconstruction` jako automaticky schválený dataset. Nelze zde fiktivně dosazovat `MEASURED`, `CORRECTED`, `ESTIMATED` ani `NOT_INSTALLED` podle pouhé přítomnosti hodnoty. Validace per-field původu z `reconstruction_changes` a fyzických `sensor_epoch` bude připojena samostatně s ověřenými odkazy. Skutečná quality/provenance DB migrace zatím není provedena (další acceptance kritérium #25). Případné budoucí schválení celého rekonstruovaného archivu musí být oddělená explicitní operace, nikoli vedlejší efekt tohoto API.

## Testy

`npm --prefix api test` (Fastify inject, hermetický DB mock, žádný živý MariaDB write) a CI staging. Testováno: nulové měření versus `NULL`, source error noise čítače, chybějící segmenty, podzimní CET/CEST fold, přesné UTC end intervals, nepovolené dataset/metric/časové intervaly, příliš dlouhé dotazy a tiché ořezání.
