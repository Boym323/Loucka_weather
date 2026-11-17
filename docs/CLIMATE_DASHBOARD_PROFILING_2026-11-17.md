# Výkon klimatologického přehledu – jednorázové profilování DEV API

Datum: 17. 11. 2026. Tato etapa **nemění zdrojovou databázi, WeeWX ani chování produkčního webu**.

## Výchozí zjištění

Po PR #119 spadl počet API fetchů při úplném průchodu `/klimatologie/` ze 69 na 10. Veřejné browser měření v GitHub Actions na dev prokázalo správné vykreslení včetně GW3000/failoveru, ale jediné změřené p95 požadavků nemůže oddělit SQL, síť, výpočty a další paralelní návštěvy. Souhrnné rozhraní `/api/v1/climate/dashboard` čte tři denní tabulky s kalendářním limitem max. 2600 dní.

## Optimalizace zpracování

Původní aplikace pro každý z šesti roků a dvanácti měsíců opakovaně procházela pole denních souhrnů a převáděla každý datumový okamžik na Europe/Prague. Nová implementace během **jediného průchodu každého pole** ověří kalendářní hranice a vytvoří roční a měsíční indexy `Map`. Přesné numerické agregace, NULL a reálné nuly, validace časových hranic a odpověď zůstávají nezměněné. Nevytváří se nový průměr z denních hodnot.

## Omezená provozní instrumentace

Jen pokud je pro proces Fastify **výslovně** nastaveno `WEATHER_API_PERF_LOG=YES`, po každém úspěšném novém načtení (cache miss) vypíše jednu JSON událost `climate_dashboard_refresh`:

- `durationMs` – celé zpracování od zahájení tří read volání po přípravu odpovědi a hash, **bez přenosu HTTP**;
- `queryWallMs` – společný čas tří paralelně zahájených DB read operací, včetně čekání na pool a mapování, nikoliv čistá DB SQL duration;
- `queryMs` – individuální doby vrácení každého `ArchiveReader.dailySummaries`, včetně možné fronty poolu;
- `processingMs` – rozdíl pro přepočet, řazení a hash, plus `rows` s počty zpracovaných záznamů;
- `rssMiB` a `heapUsedMiB` – orientační snapshot Node procesu.

Žádné IP adresy, SQL dotazy, DB credentials, interní hostname, skutečné naměřené hodnoty či raw weather payload. Cache hit a HTTP 304 **novou událost nevytvářejí**. Bez proměnné `YES` se události nevypisují. Jestli už je `WEATHER_API_PERF_LOG` na dev zapnuto, po provozu hledat v journald řádky `climate_dashboard_refresh`. Pro změnu prostředí není potřeba nic dělat automaticky z GitHub CI – povolení i zakázání je výhradně provozní krok.

## Ověření

- Stávající inject testy porovnávají souhrnný endpoint s původními `/statistics/yearly` a `/statistics/monthly`, včetně DST, jednotek, časového vážení, reálné nuly a chybějících hodnot.
- Nové testy ověřují jedinou strukturovanou událost při cache miss, žádnou při warm cache a žádný log při vypnutém profilu.
- Po PR merge: potvrdit veřejný dev smoke a porovnat `visitor-performance.json` před a po změně. Neoznačovat za zrychlení, dokud nebude několik srovnatelných měření. Neprovádět agresivní zátěžový test na sdílené MariaDB.

## Pořadí dalších kroků

Dále sledovat stabilitu SSE GW3000, poloviční stav archivních dat, případný růst RSS a 503. Zlepšit návštěvnický obsah. Přípravu obnovení záloh a návratu na původní WeeWX vést jako **samostatnou neinvazivní** pracovní větev. Oprávnění DB účtu a TLS necháváme podle aktuálního pokynu provozovatele stranou.
