# Loučka Weather – návrh vyměnitelného API a migrační strategie (31. 10. 2026)

**Stav: NÁVRH, nikoliv implementace ani schválený produkční standard.** Tento dokument doplňuje [ADR 001](ARCHITECTURE_DECISION_2026-10-31.md), nikoliv jej nahrazuje. Pracovní preference v1 je Node.js + Fastify; Go je alternativou a Rust možným samostatným dávkovým workerem, pokud měření prokáže potřebu. **Nový portál ani API zatím nejsou nasazené.**

## 1. Rozhodnutí na úrovni architektonického záměru

Cíl: **frontend nesmí být závislý na Fastify ani na implementačním jazyku API**. Výměna Fastify -> Go (případně Rust) má být změnou backendové služby, nikoliv přepisem Astro stránek nebo WeeWX.

- **WeeWX a původní Belchertown zůstávají samostatným funkčním systémem pro sběr a publikování měření.** Nové API neumisťovat do WeeWX procesu a nezavádět závislost běhu WeeWX na novém webu.
- **Nový Astro frontend a API budou logicky dvě služby**; v MVP mohou běžet ve stejném *novém* LXC jako samostatné procesy/systemd služby, nezávisle na LXC s WeeWX. Oddělená LXC lze zavést později bez změny veřejného kontraktu.
- Nginx Proxy Manager poskytuje jednu veřejnou doménu: stránky směruje na Astro, `/api/v1/*` na API. Při migraci se mění pouze upstream pro API, nikoli veřejná URL (pokud se zachová kontrakt).
- Záznamy se čtou ze stávající MariaDB pod **samostatným read-only účtem**. Originální `pocasi-loucka.eu.archive` ani souhrny `archive_day_*` nové API neupravuje. Rekonstrukce dat probíhá odděleně v `loucka_reconstruction` podle auditovaných pravidel.
- Pro aktuální měření preferovat sdílený datový zdroj existujícího WeeWX toku / MQTT; **neotvírat pro každého návštěvníka samostatný SQL polling**. Živý WebSocket/MQTT tok a jeho zprostředkování je samostatná hranice kontraktu.

### Logické schéma (návrh)

```text
Ecowitt GW3000 -> WeeWX (stávající systém) -> MariaDB originálních měření
                         |                         |
                         +-- stávající live feed --+--> [adaptér API / cache]
                                                       |
návštěvník -> Nginx Proxy Manager -> Astro frontend --+--> /api/v1/* (Fastify/Go)
                                        (samostatné služby v novém LXC)
```

Schéma neznamená, že MariaDB sama poskytuje live feed, ani že WeeWX musí volat nové API.

## 2. Stabilní veřejný kontrakt – nejdřív specifikace, potom jazyk

**Navržené cesty**, nikoliv již existující endpointy:

| Cesta | Účel |
|---|---|
| `GET /api/v1/current` | Poslední známé hodnoty s časem, jednotkami a kvalitou |
| `GET /api/v1/history?metric=outTemp&from=...&to=...&resolution=auto` | Validovaná časová řada, omezené body |
| `GET /api/v1/statistics?period=year&year=2026&metric=outTemp` | Denní souhrny / statistiky ze zdrojových agregátů |
| `GET /api/v1/healthz` | Zdraví samotného API, bez interních tajných údajů |
| `/api/v1/live` | **Volitelné** sjednocené live rozhraní; transport a verzi eventů nutno teprve rozhodnout |

Staré benchmarkové cesty `/current`, `/history/24h`, `/history/30d`, `/statistics/yearly` jsou **testovací**, ne schválený veřejný kontrakt. Před implementací připravit **OpenAPI 3.1** (schémata, limity, typy, příklady, chyby) jako jazykově neutrální zdroj pravdy; klientské TypeScript typy generovat ze specifikace, ne z interních Fastify handlerů.

Kontrakt musí explicitně definovat:

1. **Čas:** přenos časových okamžiků v UTC (ISO 8601 s `Z`, případně epoch v jasně označených jednotkách). Pro kalendářní den/statistiky použít `Europe/Prague` a zdokumentovat DST; WeeWX `dateTime` představuje **konec intervalu (start, end]**, včetně přiřazení půlnoci.
2. **Jednotky:** explicitní SI/meteorologické jednotky v každé odpovědi či schématu; konverze z `usUnits` (US/METRIC/METRICWX) na jednom normalizačním místě, bez implicitního hádání.
3. **Chybějící hodnoty:** `null` není `0`; neplatné a chybějící hodnoty se nesmějí maskovat. Neposílat `NaN` nebo `Infinity` jako JSON.
4. **Původ a kvalita:** rozlišit originální / rekonstruovaná / odvozená data, stav kontroly kvality a případně úplnost historického období. Neprohlašovat automaticky každou položku v rekonstrukční DB za validní opravu.
5. **Determinismus:** stabilní názvy, tvar JSON, řazení, status kódy, chyba/empty-series, zaokrouhlování, počet bodů, downsampling a jeho význam.
6. **Omezení:** allowlist `metric`, validace období, timeout, maximum bodů a odpovědi, bezpečné rate limity, parametrizované SQL, oprávnění pouze SELECT pro produkční data.
7. **Cache:** definovat čerstvost/TTL a invalidaci při nových nebo schválených rekonstruovaných datech; klient nesmí spoléhat na specifickou interní cache Fastify.
8. **Live:** pokud veřejné API poskytne stream, verzovat i payload událostí, reconnect, pořadí, heartbeat, stale stav a backpressure; nerozšiřovat interní MQTT credentials do prohlížeče.

**Příklad pouze orientačního tvaru, ne závazné schéma:**

```json
{
  "observedAt": "2026-10-31T19:00:00Z",
  "values": {
    "outTemp": { "value": 12.4, "unit": "degC", "quality": "measured" },
    "outHumidity": { "value": null, "unit": "percent", "quality": "missing" }
  },
  "stale": false
}
```

## 3. Hranice modulů

- **Frontend (Astro/ECharts):** používá pouze verzované HTTP/live rozhraní a generované DTO typy; žádný import Fastify modulů, žádný přímý SQL, žádné konkrétní interní MQTT konfigurace, žádný přímý přístup ke kamerovým credentials.
- **Transport (Fastify nebo Go):** HTTP routing, validace, odpovědi, rate limiting, telemetry; bez meteorologických vzorců uvnitř rout.
- **Aplikační/datová vrstva:** rozhraní pro `CurrentWeatherProvider`, `HistoryRepository`, `StatisticsService`, `LiveFeedAdapter`. Koncepční rozhraní, nikoli povinnost zavést sdílenou knihovnu v konkrétním jazyce.
- **Meteorologická normalizace:** verzovaná pravidla pro jednotky, čas, úplnost, provenance a kvalitativní příznaky; referenční fixture a parity testy musí fungovat nezávisle na jazyku.
- **Cache/agregace:** oddělené od HTTP frameworku; preferovat stávající denní souhrny WeeWX, nevytvářet duplicitní writer bez prokázané potřeby.
- **Výpočty:** Rust nebo Go worker lze doplnit za interní rozhraní později, aniž by se změnilo veřejné API.

## 4. Postup případné výměny Fastify -> Go/Rust

1. **Zamknout kompatibilní API v1**: OpenAPI, význam každého pole, fixture z reálných anonymizovaných dat a kontraktové testy. Důležité je vědecky ověřit interpretaci dat; samotná shoda dvou implementací nestačí.
2. **Implementovat druhý backend vedle prvního** na samostatné interní adrese/portu ve stagingu. Oba čtou tentýž **izolovaný** snapshot, ne živou MariaDB při zátěžovém testu.
3. **Spustit stejné testy** na obou API: statusy, JSON Schema/OpenAPI, rozsahy, `null`, konverze jednotek, CET/CEST, půlnoc, pětiminutové i jiné intervaly, duplicity, mezerovité řady, rekonstruované hodnoty, rounding/tolerance, statistiky, validace a chybové stavy.
4. **Porovnat chování a metriky**: p50/p95/p99 odezvy, DB query/fetch time, pool wait, CPU, RSS, využití cache, MQTT reconnect a backpressure; zátěž jen na izolované DB. Ošetřit rozdíly, dokud kontraktové testy neprojdou.
5. **Staged cutover:** přesměrovat pouze interní API upstream přes NPM/reverse proxy (popř. canary), sledovat telemetry a chyby. Starý backend ponechat po přechodnou dobu jako rychlý rollback.
6. **Rollback:** mít původní image/binárku a konfiguraci, bez migrace/změny původní WeeWX DB; při regresi vrátit upstream a zkontrolovat funkčnost grafů, historie, live režimu.
7. **Breaking changes:** pokud nelze zachovat datovou sémantiku, zavést `/api/v2` a samostatnou migraci klienta; `v1` neměnit tiše.

## 5. Přibližná náročnost (nikoliv projektový odhad)

Výměna **malého čtecího API** může znamenat jednotky pracovních dnů; u komplexní historické normalizace, cache, live streamů, výstrah a statistického enginu spíše týdny. Stabilní veřejný kontrakt **nezabrání nutnosti přepsat backendovou logiku**, ale omezuje dopad na frontend, WeeWX a URL. Reálná pracnost bude známa až podle implementovaných funkcí a testů.

## 6. Pořadí nejbližších kroků

1. Přijmout *princip oddělení komponent* (API mimo WeeWX, oddělený proces vedle frontendové služby); **nepovažovat zatím za definitivní schválení Fastify vs Go**.
2. Založit `openapi.yaml` pro v1 a referenční odpovědi pro current, history, statistics + error, včetně kvality a původu dat.
3. Vytvořit společné fixture a automatické kontraktové/paritní testy, nejprve bez přístupu k produkční databázi.
4. Nasadit minimální API + Astro na **oddělený staging**, zkontrolovat NPM routing a read-only účet.
5. Teprve podle výkonových a provozních měření rozhodnout, zda Fastify ponechat, nebo API nahradit Go.

## 7. Související dokumenty

- [Kontext projektu](PROJECT_CONTEXT.md)
- [ADR 001 – pracovní rozhodnutí o technologiích](ARCHITECTURE_DECISION_2026-10-31.md)
- [Benchmarky a jejich metodická omezení](BENCHMARK_SYNTHESIS_2026-10-31.md)
- [Audity návštěvnosti a HTTP provozu](TRAFFIC_AUDIT_2026-10-31.md)
- [Pokyny AI/Codex](../AGENTS.md)

**Bez změn produkční DB, WeeWX, konfigurace NPM a běžícího webu. Tento dokument popisuje návrhové hranice a plán, ne hotový API server.**


## Důležitá součást verzovaného kontraktu: vstupní a výstupní jednotky

API musí číst skutečné `usUnits` ze zdrojového řádku (US=1, METRIC=16, METRICWX=17); jednotlivé pozorování nesmí předpokládat METRIC jen proto, že současná produkční databáze používá 16. Výstup lze přepnout pomocí `?units=us|metric|metricwx` (výchozí metricwx) bez změny zdrojové DB. V odpovědi musí být `units` i `unit` jednotlivých veličin. Konkrétní mapování a referenční vektory jsou v [auditu API kontraktu](API_CONTRACT_AUDIT_2026-10-31.md), `schemas/metrics.json`, `contracts/unit_conversion.py`, `tests/test_unit_conversion.py`. Tato reference nedokazuje reálné backendové implementace Fastify/Go/Rust.
