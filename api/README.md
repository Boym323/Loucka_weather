# Loučka Weather API – Fastify staging vertical slice (DRAFT)

**Nejde o produkční backend ani kompletní OpenAPI implementaci.** První skutečné HTTP endpointy: `/api/v1/healthz`, `/readyz`, `/station` a `/current` (prozatím outTemp/rain/windSpeed/barometer). Ostatní endpointy a SSE jsou stále kontrakt k implementaci; `station.capabilities` proto uvádí jen `current`.

Kontrakt: [root openapi.yaml](../openapi.yaml), [meteorologická pravidla](../docs/API_V1_PRODUCT_CONTRACT.md). První verze používá Fastify v5, Node 24 a MariaDB Connector/Node.js. Testy používají injektovaný fake reader a nikde se nepřipojují k produkci.

## Spuštění – pouze autorizovaný staging
```bash
cd api
npm install
npm test
# Pouze na stagingu a jen se zvláštním uživatelem MariaDB s právem SELECT:
WEATHER_STAGING_ENABLED=YES WEATHER_DB_HOST=... WEATHER_DB_SCHEMA=... \
WEATHER_DB_USER=... WEATHER_DB_PASSWORD=... npm start
```

Použij systémové `EnvironmentFile` s právy 0600 mimo repozitář, nikdy neukládej hesla do GitHubu. Konfigurace bez explicitního `WEATHER_STAGING_ENABLED=YES` skončí chybou; default host je pouze `127.0.0.1` pro HTTP server. API musí být dostupné jen přes same-origin Nginx Proxy Manager, ne veřejně na novém portu.

**Bezpečnost:** SQL pouze SELECT (parametr `asOf` vázaný), uživatelský vstup nesmí ovlivnit název tabulky. DB schéma je pouze konfigurace procesu, ne HTTP parametr. Pro produkci je nutné doplnit rate limiting, vědecké QC, cache a invalidaci `dataRevision` při opravách, plné CI paritní testy a nezávislý snapshot. Toto PR takové nasazení neschvaluje.

**Před označením ready:** vytvořit a commitnout `package-lock.json`, v CI přejít na `npm ci`, rozšířit golden testy všech 45 veličin, real DB staging a 11 endpointů, otestovat přechody DST a obnovu archivu. Produkční WeeWX, databázi ani LXC tento PR nemění.
