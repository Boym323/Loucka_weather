# Audit modularity, rozšiřitelnosti a údržby nového frontendu Počasí Loučka

**Datum:** 1. 11. 2026 · **Stav:** návrh k zapracování před založením Astro frontendu (bez změn produkce).  
**Repozitář:** `Boym323/Loucka_weather`; ověřeno `main` (revize `fce89f70fa8a1367d043179e1df2dfc85ed7be9c`) a rozpracovaný PR #5 (`6574a081085668ff21be4124b5aedfe9cc872af8`).  
**Typ kontroly:** statická revize existujícího kódu a specifikací, nikoliv browser audit hotového nového frontendu: Astro projekt ještě neexistuje a nebyl změřen build/Lighthouse/RAM.

## 1. Krátký závěr

**Volbu Astro (statický build) + TypeScript + modulární ECharts + oddělený Fastify API zachovat.** Pro budoucí rozšiřování ale nestačí dělit UI pouze na Astro komponenty. Musíme oddělit (a) identitu meteorologické veličiny, (b) instanci fyzického senzoru, (c) časově platné mapování zdrojového sloupce, (d) datovou/kvalitativní logiku, (e) vizualizaci a (f) celé funkční moduly.

Zavést **feature-oriented modular monolith**, nikoli mikrofrontendy nebo dynamické nahrávání neschválených pluginů. Jednotný statický build, znovupoužitelné malé moduly, jeden typed klient pro `/api/v1`, jeden klientský hub SSE, verze katalogu měření a testovací hranice modulů. Nová funkce má být přidatelná primárně jako samostatný modul; nové čidlo stejného typu má být z velké části konfigurační/datová změna, nikoliv přepis komponent.

**Pozor:** současný kontrakt nepodporuje libovolně nové metriky bez aktualizace schémat. To není chyba Astro, ale otevřená architektonická práce v API a metadatové vrstvě.

## 2. Ověřené podklady a omezení

- `FRONTEND_SPEC.md` už popisuje mobilní rozložení, stránky, komponenty, stavy loading/live/stale/missing/suspect/reconstructed a WCAG 2.2 AA; jde o návrh.
- `docs/ARCHITECTURE_DECISION_2026-10-31.md` navrhuje Astro + ECharts + Fastify, statické HTML a izolovaný staging; frontendový benchmark zatím neproběhl.
- `docs/FRONTEND_FEATURES_CAMERA_AUDIT_2026-10-31.md` mapuje webkameru, radar, výstrahy, senzory, nejisté historické rekordy a zdroje dat.
- `openapi.yaml` definuje 11 endpointů; `schemas/metrics.json` má **80 položek**, z toho **45 public** a 35 nezveřejňovaných/ověřovaných. `soilMoist1` existuje v katalogu, ale má `public=false` (neověřená jednotka/sémantika).
- `schemas/weather.schema.json` má pro `CurrentResponse.readings` přesně 45 properties a **`additionalProperties=false`**; enum `HistoryResponse.metric` má rovněž 45 hodnot. Přidání veličiny není pouhý konfigurační přepínač.
- PR #5 (zatím draft, ne `main`) má `api/src/metrics.ts` generovaný jako kopii katalogu, `api/src/app.ts` s routami a doménovou logikou v jednom souboru a `api/src/db.ts` s dotazem pro `current` na všech 45 sloupců současně. Jeho syntetická CI databáze má všechny tyto sloupce; test **nedokazuje** dostupnost všech ve skutečném produkčním schématu.
- `/sensors` v PR #5 nyní vrací prázdný seznam a `/camera/status` poctivě `disabled`; žádné dynamické mapování skutečných senzorů dosud neexistuje.
- Ze staršího auditu konkrétní MariaDB: přítomné `soilMoist1`, nejasné hloubky `soilTemp1..6`, různé dostupnosti v čase, bez automatického potvrzení QC. Neodvozovat, že každý obsazený SQL sloupec je aktivní senzor.

**Nebylo ověřeno:** běžící Astro UI, reálná rychlost vytvořeného JS, live MQTT topics, skutečná identita/sloupcové mapování všech nynějších senzorů, výkon se skutečným snapshotem DB, pravidla publikování schválené rekonstrukce.

## 3. Rizika a prioritizace

| ID | Priorita | Nález a dopad | Navržené řešení |
|---|---|---|---|
| F-01 | **P0** | Přesně 45 vlastností `readings` a uzavřený enum `HistoryResponse.metric` znemožňují zveřejnit novou metriku pouhou konfigurací; starý klient může odmítnout neznámou vlastnost. | Zavést **verzovaný katalog schopností/metrik/senzorů** a evoluční politiku v1/v2; smluvní test zpětné kompatibility. |
| F-02 | **P0** | Stávající `/current` vybírá všech 45 sloupců najednou. Při chybějícím sloupci může spadnout celý dotaz místo degradace jedné metriky. | Kontrola `information_schema`/mapování při startu, ověřený allowlist dostupných sloupců, stav `unsupported/not_installed` pro jednotlivé metriky; žádné dynamické HTTP SQL identifikátory. |
| F-03 | **P0** | Veličina (`soilTemp`) se zaměňuje s jednou fyzickou sondou a časově proměnnou hloubkou; časové epochy nejsou publikované. | `MetricDefinition` oddělit od `SensorInstance`, `SensorBinding(validFrom/validTo)`, `QualityPolicy` a `Observation`; žádné hádání hloubek/kanálů. |
| F-04 | **P0** | Neexistuje implementovaná struktura Astro modulu ani jasná pravidla importů. Při rychlém vývoji hrozí obří homepage, univerzální store a kopírované fetch logiky. | Feature-first adresáře, tenké stránky, oddělené sdílené UI / doména / API, test hranic importů. |
| F-05 | **P0** | Současná specifikace neposkytuje jednu společnou orchestrace SSE pro více widgetů, revizí a fallbacků. | Jediný `LiveClient` na kartu, typed event bus, konzistentní `dataRevision` cache klíče; lokální subscription cleanup. |
| F-06 | **P1** | PR #5 centralizuje API routy `app.ts` + čtení dat; s přidáním statistik, live a QC poroste provázanost. | Rozdělit route/controller, use-case, repository/adapter, unit/QC a testy; bez framework závislostí v meteorologické doméně. |
| F-07 | **P1** | Chybí funkční modulární CI frontendu, bundle budget, screenshoty a accessibility regrese. | Typecheck, lint, unit/contract, Playwright E2E, WCAG automat + manuální, Lighthouse, bundle report a dependency scan. |
| F-08 | **P1** | Kamera/radar/ČHMÚ/předpověď jsou externí zdroje s rozdílnou licencí, cache a chybovými stavy. | Každý vlastní provider adaptér na serveru, feature flag, fallback; žádné interní URL/tokeny v JS. |
| F-09 | **P1** | Některé historické hodnoty jsou suspect; zdroj `original` vs `approved` a provenience se nesmí ztratit na úrovni grafu. | Jeden `Observation` model nese quality/source/provenance/dataset/revision; v UI explicitní stav a konzistentní export. |
| F-10 | **P2** | Příliš mnoho „pluginových“ abstrakcí by zbytečně zvýšilo údržbu malého webu. | Jeden repozitář a jeden Astro build, bez mikrofrontendů, runtime JS marketplace nebo předčasné monorepo infrastruktury. |

## 4. Cílová architektura: modulární monolit

```text
browser (Astro statické HTML + malé interaktivní islands)
  ├─ shared/ui                 : Button, MetricCard, StatusBadge, ErrorState
  ├─ shared/domain             : jednotky, typy, čas, kvalita, názvy metrik
  ├─ shared/api                : jediný typed /api/v1 klient, ETag, AbortSignal
  ├─ shared/live               : jeden EventSource hub, reconnect/reset
  ├─ shared/config             : validované capabilities + feature flags
  │
  ├─ features/current          : aktuální stav stanice a základní karty
  ├─ features/history          : grafy (ECharts) a selektory
  ├─ features/statistics       : přehledy a rekordy
  ├─ features/sensors          : registry, diagnostika, dostupnost
  ├─ features/camera           : snímek, freshness, privacy status
  ├─ features/radar            : externí mapová integrace a fallback
  ├─ features/alerts           : ČHMÚ CAP adapter a stav dostupnosti
  └─ features/forecast         : predikce z ověřeného externího zdroje
                |
                | same-origin HTTPS /api/v1/...
                v
Fastify API (samostatná služba, pouze SELECT pro produkční DB)
  ├─ http/routes               : autentizace/limity/validace/kontrakty
  ├─ application               : current/history/stats/live use-cases
  ├─ domain                    : Metering/QC/Unit/Calendar/Provenance
  ├─ ports                     : WeatherReader, SensorRegistry, LiveFeed
  ├─ adapters/db               : archive, archive_day_*, metadata
  └─ adapters/external         : MQTT, kamera, ČHMÚ, radar/forecast
                |
             WeeWX / MariaDB + ověřené externí zdroje
```

**Důležité:** přidání nového vizuálního modulu nevyžaduje změnu WeeWX. Přidání nového senzoru existujícího typu má využívat registry metadat, ale podléhá ověření jeho fyzického mapování. Nová *veličina* vyžaduje kontrolovaný dodatkový kontrakt a testy jednotek.

### Doporučená struktura frontendu

```text
frontend/
  astro.config.mjs
  src/
    pages/                       # tenké routy, pouze kompozice feature modulů
      index.astro
      aktualne.astro
      grafy.astro
      senzory.astro
      o-stanici.astro
    layouts/
      BaseLayout.astro
    features/
      current/
        CurrentPanel.astro
        CurrentController.ts
        current.test.ts
      history/
        HistoryPanel.astro
        ChartIsland.ts
        history-data.ts
        history.test.ts
      sensors/
        SensorList.astro
        SensorDetails.astro
        sensor-view-model.ts
      camera/
        CameraPanel.astro
        camera-source.ts
      statistics/
      radar/
      alerts/
      forecast/
    shared/
      ui/                        # bez SQL, fetch, SSE a Meteo heuristik
      api/
        api-client.ts
        generated.types.ts       # generovat z openapi.yaml; RUČNĚ NEMĚNIT
        cache.ts
      domain/
        metric.ts
        sensor.ts
        reading.ts
        units.ts
        time.ts
        quality.ts
      live/
        live-client.ts
        subscriptions.ts
      config/
        capabilities.ts
        feature-flags.ts
      test/
        fixtures/
    styles/
      tokens.css
      global.css
  tests/e2e/
```

**Nejde o povinnost mít každý uvedený soubor od prvního commitu.** Začít jen `current`, `history`, `sensors` a sdílenými službami; další složky přibývají s funkčností. Oddělit *volitelnou funkci* (kamera) od *univerzální komponenty* (karta). Grafy importovat pouze na stránkách, které je potřebují; `echarts/core` s registrovanými nezbytnými sériemi/renderery.

## 5. Kontrakt pro přidávání metrik a senzorů

Povinné oddělené pojmy:

1. **MetricDefinition** – stabilní strojový klíč (`outTemp`, nový `soilMoist1` jen po QC), jednotková skupina, normalizace, formátování, povolené agregace, název/popis, minimální technické meze nebo politika měření. Jeden typ veličiny může mít více senzorů.
2. **SensorInstance** – stabilní `sensorId` (např. `soil-probe-west-01`), typ zařízení, stav, instalace/výměna, hloubka/lokalita jen pokud ověřená, ne pouze číselný suffix sloupce.
3. **SensorBinding** – validovaný interní zdroj (`archive.soilTempN`, MQTT topic, případně derived), s intervalem platnosti UTC `validFrom`/`validTo`. Při výměně senzoru historické body zachovat pod původní proveniencí.
4. **Observation** – `metricId`, `sensorId`/zdroj, `observedAt` v UTC, `value|null`, `unit`, `quality`, `source`, `provenance`, `dataset`, `dataRevision`. `missing` ≠ `0`, `suspect` ≠ `measured`.
5. **FeatureDefinition** – `id`, dostupnost/capabilities, seznam stránek/panelů, import komponenty, závislost na endpointu, fallback a autorizační/externí podmínky. Registry se kompiluje z **lokálně schválených modulů**; z internetu se nespouští neověřený pluginový JS.

Navržené rozhraní (ilustrativní TypeScript, **není součástí API v1**, neoznačovat za existující implementaci):

```ts
type Quality = 'measured' | 'missing' | 'suspect' | 'derived' | 'reconstructed';
interface MetricDefinition {
  id: string; unitGroup: string; unit: string;
  allowedAggregations: readonly string[];
  publicationStatus: 'draft' | 'verified' | 'disabled';
}
interface SensorBinding {
  sensorId: string; metricId: string; sourceRef: string;
  validFrom: string; validTo: string | null;
  verified: boolean;
}
interface Observation {
  sensorId: string | null; metricId: string; observedAt: string;
  value: number | null; unit: string; quality: Quality;
  dataset: 'original' | 'approved';
  source: string; provenance: string | null; dataRevision: string;
}
```

### Nutné rozhodnutí o evoluci HTTP API

**Změny ve schématu neprovádět potichu.** Dnes je `CurrentResponse.readings` uzavřený přes 45 properties a `HistoryResponse.metric` pevný enum. Pro přidávání měření zavést zvláštní **verzovaný katalog metadat** (návrhový `GET /api/v1/catalog` nebo rozšíření stávajícího `/sensors`) a pro více fyzických zdrojů téže metriky **samostatné kolekční rozhraní observations**, aniž bychom rozbili současné `/current`.

- API v1 zachovat pro existující čtečky; žádné neověřené klíče nezveřejňovat.
- Jakmile schválíme novou metriku, buď zveřejnit **additivní kompatibilní rozšíření** (se správně aktualizovaným schématem, generovanými klienty a testy starších klientů), nebo `/api/v2`, pokud je nutná změna významu nebo kardinality.
- U stávajícího `current` ověřit v reálném stagingu *každý* výběr sloupců: při nedostupnosti jedné metriky nesmí spadnout celé počasí; dataset může uvést `available=false` bez pokusu o neexistující SQL sloupec.
- `soilMoist1` a fyzické hloubky sond zůstávají **neověřené**; nepovýšit `public=false` pouze kvůli pohodlí widgetu.
- Přidání dalšího *zařízení se stejnou veličinou* má jít přes `SensorInstance` a `Binding` bez nového grafového rendereru. Přidání *zcela nové veličiny* vyžaduje katalog, jednotky, QC, agregace, testy a případné rozšíření kontraktu.

## 6. Kontrakt jednoho samostatného UI modulu

Každá feature musí deklarovat:
- **Vstup:** veřejná datová DTO/typy generované z OpenAPI, feature flags a `AbortSignal`. Žádné přímé SQL, MQTT přihlašovací údaje či interní IP.
- **Výstup:** izolovaný panel nebo stránku se stavy loading/ready/stale/empty/error/suspect a přístupnou alternativou pro tabulky/grafy.
- **Závislosti:** pouze `shared/*`, vlastní `features/<id>/*` a explicitně schválené veřejné integrační rozhraní. Žádný import interních souborů jiné feature; žádné importy `api/src/db.ts` do klienta.
- **Životní cyklus:** `mount()` a `dispose()` nebo odpovídající `connectedCallback/disconnectedCallback`/cleanup frameworku; ukončit `EventSource` subscription, `ResizeObserver`, `AbortController` při odchodu ze stránky.
- **Bezpečný fallback:** nevypisovat „0“, pokud zdroj chybí; kamera off zůstává off; ČHMÚ nedostupné není „bez výstrah“.
- **Testy:** samostatný unit test, contract fixture, E2E pro cestu, empty/error, mobil, klávesnici a rozbitý provider.

### Stav a live stream

- Jeden browserový `ApiClient` pro `/api/v1`, centralizované TTL/ETag/`If-None-Match`, `AbortController` a klíče podle `metric/sensorId/dataset/units/resolution/range/dataRevision`.
- Jeden browserový `LiveClient` (`EventSource`) na kartu/web, ze kterého si jednotlivé feature odebírají `snapshot`, `observation`, `archive-updated`, `status`, `reset`. Žádné desítky spojení SSE na jednotlivých kartách.
- Při `archive-updated`: graf revaliduje dotčený interval; denní souhrny až při `summaryStatus=ready`. Po `reset` nejprve obnovit snapshot a viditelné dotazy. Živý MQTT nesmí být podmínkou existence archivního streamu.
- Kontrolovat současné požadavky, deduplikovat stejné query, rušit staré fetch při změně filtru, skrytému tabu snížit obnovování. Hodnoty kvality/datových revizí musí procházet až do tooltipů a CSV exportu.

## 7. Testovací a údržbová strategie

**CI gate pro frontendové PR:**
- TypeScript strict + Astro check; ESLint a formátování; žádné nevyužité veřejné importy.
- Kontrola konzistence `schemas/metrics.json` ↔ generovaných typů ↔ API metadata; `openapi.yaml` → generované client types (jediný zdroj pravdy).
- Jednotkové testy (Vitest) na formátování času/jednotek/kvality a senzorové epochy.
- Komponentové a prohlížečové testy Playwright: homepage, graf, filtr období, detail senzoru, kamera disabled; 390/768/1440 px; klávesnice, čtečka/ARIA kontrola; pro reálnou přístupnost také ruční validace.
- Golden screenshoty light/dark, chybějící zdroje, dlouhý český popisek, delší graf, 23/25h den CET/CEST, UTC intervaly `(start,end]`.
- Test výpadku API, MQTT, `EventSource` reconnect, `archive-updated`, ETag 304, nedostupná kamera.
- Nezávislý browser performance profil. Doporučené **počáteční rozpočty, ne naměřené hodnoty:** LCP <=2,5 s; CLS <=0,1; INP <=200 ms (p75 skutečných návštěv); výchozí JS na homepage se snažit udržet kolem <=150 kB *gzip* bez odložených grafů, měnit po prototypu. ECharts, radar, camera gallery jako lazy chunks. Automaticky kontrolovat odchylky v bundle size.
- Testy příkladového rozšíření: přidat další senzor ke stávající metrice bez úpravy `CurrentWeatherHero`; přidat nový `features/*` bez změny jiných modulů; odpojit libovolnou feature bez chyby homepage.

**Údržba:** jeden vlastník katalogu a změn API; ADR u zásadních rozhodnutí; Dependabot/renovační PR s testy; lockfile; CI release build; staging nasadit hotový `dist/`; jednoduchý rollback hotových artefaktů; dokumentovat podporované browsery a dobu retence záznamů kamery. Modul může mít vlastní `README` s účelem, závislostmi a limity; neveřejné přístupové údaje jen server-side.

## 8. Konkrétní implementační pořadí

| Fáze | Dílčí úkol | Hotovo znamená |
|---|---|---|
| **P0-A** | ADR modularity + `frontend/` Astro scaffold + společný `ApiClient` | `npm ci`, build, check, test, stránka `/` se skutečným disabled/missing stavem |
| **P0-B** | Stabilní `MetricDefinition/SensorInstance/Binding` a zdroj capabilities | Změna fyzického čidla nevyžaduje změnu rendereru, neověřený senzor není aktivní |
| **P0-C** | Audit kompatibility API pro nové metriky | Bezpečná odpověď při chybějícím sloupci; dokumentovaná cesta od `public=false` k publikování |
| **P0-D** | Feature current/history + společná SSE/caching vrstva | Dvě nezávislé feature bez duplicitních SSE a bez zbytečných SQL dotazů |
| **P1-A** | Komponenta ECharts, historie + WCAG/CSV | Zachovává `NULL`, provenance, min/max, časové hranice a režim stale |
| **P1-B** | Vzorový rozšiřovací test sensor + nové feature | Dva různé senzory stejné veličiny, nová feature přidaná bez refaktoru homepage |
| **P1-C** | CI budget, Playwright a izolovaný výkonový audit | Report velikosti JS, screenshoty, p95 API, testy na nízko-výkonném telefonu |
| **P2** | Kamera/radar/výstrahy/forecast podle schválených zdrojů | Odpojení modulu neovlivní další karty, všechny externí URL/credentials server-side |

**Doporučené rozdělení PR:** (1) dokumentovaný modulový kontrakt a Astro scaffold, (2) API schema+catalog/capabilities, (3) current/history widgety, (4) SSE/cache, (5) CI a rozšiřovací příklady. PR #5 dokončit souběžně bez předčasného merge do produkce.

## 9. Akceptační scénáře pro rozšiřitelnost

1. **Nová půdní sonda** dodá data do ověřeného interního bindingu, ale nepřepisují se stránky `/` ani `/grafy`. Metadata `depthCm` a `validFrom` zobrazit pouze z ověřené konfigurace.
2. **Výměna senzoru** se stejným SQL kanálem nemění starou historii na nový fyzický přístroj; graf explicitně rozdělí intervaly podle senzorové epochy.
3. **Nová veličina** nezpůsobí pád starého klienta; automaticky se nevydává jako validní, dokud neprojdou jednotky, schémata, QC, aggs a testy.
4. **Deaktivovaná kamera** nemá žádný request na privátní source a nebrání živé teplotě ani načtení grafu.
5. **Přerušené SSE** neopakuje každému widgetu vlastní DB polling; revalidace se centralizuje a po reconnect se vypne fallback.
6. **Historický rekord suspect** nesmí být prezentován jako ověřený nebo zaměněn za nulu; export obsahuje původ a jednotky.
7. **Rozbitý modul radar/forecast** neblokuje HTML úvodní stránky; zůstává navigačně a vizuálně funkční.
8. **Staging build** nesmí obsahovat databázové heslo, MQTT token ani interní adresy kamery.

## 10. Zdroje a další rozhodnutí

Interní: `FRONTEND_SPEC.md`, `docs/ARCHITECTURE_DECISION_2026-10-31.md`, `docs/FRONTEND_FEATURES_CAMERA_AUDIT_2026-10-31.md`, `docs/API_V1_PRODUCT_CONTRACT.md`, `docs/ARCHIVE_REFRESH_CONTRACT.md`, `schemas/{metrics,weather,features,aggregation-policy}.json`, PR #5. 

Oficiální: [Astro islands](https://docs.astro.build/en/concepts/islands/), [Astro TypeScript scripts](https://docs.astro.build/en/guides/client-side-scripts/), [Astro testing](https://docs.astro.build/en/guides/testing/), [ECharts modular imports](https://echarts.apache.org/handbook/en/basics/import/).

**Výsledek auditu:** výběr frameworku není nyní hlavní riziko. P0 je **kontrakt rozšiřitelnosti měření, senzorových epoch a izolace feature modulů**, které je nutné rozhodnout před větším vývojem Astro UI. Dokument je návrh, ne důkaz implementace ani provedený benchmark.