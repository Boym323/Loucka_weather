# Loučka Weather API – Fastify/TypeScript staging (PR #5)

**Stav: implementace části API v1, zatím pouze v draft PR; nic není nasazené.**

Implementované čtecí trasy:

| Endpoint | Stav |
|---|---|
| `GET /api/v1/healthz` | Liveness bez dotazu na DB |
| `GET /api/v1/readyz` | Dostupnost databáze, sanitizované chyby |
| `GET /api/v1/station` | Metadata, nezveřejňuje neověřenou polohu |
| `GET /api/v1/sensors` | Vrací prázdný seznam, dokud není ověřeno mapování senzorů |
| `GET /api/v1/camera/status` | Pravdivý stav `disabled` bez soukromých URL |
| `GET /api/v1/current` | Poslední záznam archivu včetně všech 45 veřejných metrik a tří systémů jednotek |
| `GET /api/v1/history` | Pouze `raw`, bounded (31 dnů; max 10 000 bodů včetně mezer), žádné tiché zkrácení |

`resolution=auto` použije `raw` jen pokud se vejde do mezí. `hourly` a `daily` zatím vrací kontrolovanou chybu `422`, nikoli neověřenou meteorologickou agregaci. Složité statistiky, streaming `/live`, archivní observer a reálná kamera jsou **nehotové**.

Zdrojový katalog metrik a jednotek: `../schemas/metrics.json`; `src/metrics.ts` je z něj generovaná kopie. Jednotky se interpretují **u každého řádku** podle původního `usUnits`; `NULL` zůstává `null` a neznámé usUnits se odmítne. Odpovědi `current` a `history` mají ETag / 304, `dataset=approved` je bez schválení nepřístupný (503).

## Ověření
```bash
cd api
npm install
npm test
```
Jednotkové testy používají injektovaný fake reader; vedle nich CI vytváří **samostatnou syntetickou MariaDB 11.8** a ověřuje skutečné SQL dotazy i SELECT-only přístup. Neprobíhá žádný přístup na produkční databázi. Spustit `npm test` neznamená spustit live test na produkci.

## Pouze autorizovaný staging
```bash
# Na testovací LXC s odděleným MariaDB účtem pouze SELECT:
cd api
WEATHER_STAGING_ENABLED=YES WEATHER_DB_HOST=... WEATHER_DB_SCHEMA=... \
WEATHER_DB_USER=... WEATHER_DB_PASSWORD=... npm start
```

Doporučeno `systemd EnvironmentFile` s oprávněním 0600 mimo Git. Chybějící `WEATHER_STAGING_ENABLED=YES` zabrání startu DB adapteru. HTTP backend naslouchá standardně pouze na `127.0.0.1:3100`, přístup přes důvěryhodný Nginx Proxy Manager same-origin. DB adapter používá parametrizované SELECT, pevně vymezené identifikátory metrik a max. dvě databázová spojení.

**Nenahrazuje bezpečnostní schválení produkce:** nutné přidat rate limiting, produkční cache a její invalidaci, ověřené QC senzory/rekonstrukce, autentizaci administrativních částí (pokud vzniknou), bezpečnostní audit, plných 11 endpointů, reálné srovnání s WeeWX `archive_day_*`, SSE/MQTT a zátěžové testy výhradně na izolovaném snapshotu. Dokumentovaný kontrakt v `../openapi.yaml` je širší než tato částečná implementace.
