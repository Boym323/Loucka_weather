# Počasí Loučka – audit skutečného HTTP provozu Nginx Proxy Manageru

**Datum vyhodnocení:** 31. 10. 2026. **Provoz:** 27. 9. 2026 01:46:05 +0200 až 31. 10. 2026 08:29:23 +0100. **Zdroj:** originální uživatelem poskytnutý archiv `pocasi-loucka-logs.tar.gz` (NPM proxy host č. 9, 1 aktuální + 4 rotované logy). **Repo je veřejné:** zde uvádíme pouze agregovaná zjištění, bez IP adres a surových URL payloadů.

## Ověření a základní souhrn

| Veličina | Hodnota |
|---|---:|
| Zpracované soubory | 5 |
| HTTP záznamy | **54 966** |
| Úspěšně parsované řádky | **54 966/54 966** |
| Unikátní zdrojové IP (pouze kardinalita) | **4 815** |
| Přenesený objem podle pole `[Length]` | **333 674 580 B = 318,22 MiB** |
| Interval pokrytí | cca 35 kalendářních dní; začátek a konec jsou částečné |
| Počet vnitřních (plně pokrytých) kalendářních dní | **33** |
| Medián požadavků za takový den | **1 476** |
| Nejvíc požadavků za den | **3 330**, 22. 10. 2026 |
| Dále vysoké dny | 16. 10.: **2 908**, 29. 10.: **2 900** |

Zachováváme původní časové offsety `+0200` / `+0100`. Při parsování bylo třeba povolit i **21 nestandardních řádků HTTP 400** s metodou `-` a prázdným upstream polem; po opravě parseru se žádný řádek neztratil. Denní celkové počty: [traffic_daily CSV](data/traffic_daily_2026-09-27_2026-10-31.csv).

### Stavové kódy

| HTTP | Počet | Interpretace |
|---|---:|---|
| 200 | **22 100** | Úspěšná HTTP odpověď |
| 404 | **24 255** | Neexistující cesta; mnoho požadavků automatických skenerů |
| 301 | **6 912** | Přesměrování, zčásti vyřízené přímo Nginx proxy |
| 400 | **500** | Vadné požadavky (včetně 21 atypických řádků) |
| 304 | 333 | Podmíněný cache hit/not modified |
| 206 | 267 | Částečný obsah |
| 403 | 256 | Zakázaný přístup |
| 101 | **250** | Přechod spojení na WebSocket |
| 499 | 68 | Klient ukončil spojení |
| 405 | 24 | Nepovolená HTTP metoda |
| 502 | **1** | Chyba komunikace s upstreamem |
| **CELKEM** | **54 966** | |

**44,13 % odpovědí HTTP 404 není měřítko chybovosti běžného UX.** Všudypřítomné skenování hledá například `/.env`, `/.git/config`, `/wp-login.php`, konfigurační soubory a zranitelné endpointy. Je ale nutné dál ověřovat skutečné navigační chyby uživatelů zvlášť.

### Největší špičky

| Lokální čas s příslušným CET/CEST | Požadavky | Povaha |
|---|---:|---|
| 26. 10. 2026 **11:55:33** | **359 za sekundu** | 1 zdrojová IP, všech 359 odpovědí HTTP 301; hlavně práce proxy bez předání původního požadavku na aplikaci |
| 8. 10. 2026 **21:09:03** | **247 za sekundu** | 1 zdrojová IP, z toho 244× 404 a 3× 200; důležitá špička předaná upstream serveru |
| 15. 10. 2026 **21:30:53** | **180 za sekundu** | 149× 404, 11× 403, 20× 400; automatická sonda |
| 29. 10. 2026 **14:50** | **530 za minutu** | Nejvyšší minutová špička |
| 26. 10. 2026 **12:41** | **522 za minutu** | Další výrazná minutová špička |
| 29. 9. 2026 **22:15** | **501 za minutu** | Další výrazná minutová špička |

**Tato maxima nejsou RPS benchmark aplikace.** NPM access log neobsahuje aplikační `request_time` či `upstream_response_time` v podobě potřebné pro p95/p99, neměří procesorové zatížení backendu ani zpomalení WeeWX. Stovky requestů do sekundy jsou krátké automatické bursty, ne pozorovaný běžný průměr.

### Přístupné stránky a endpointy

Níže počty požadavků na **cestu bez query stringu**. Zahrnuje lidi i boty; část odpovědí `/` jsou redirecty/HEAD.

| Cesta | Požadavky |
|---|---:|
| `/` | **7 229** |
| `/robots.txt` | **1 537** |
| `/graphs/` | **1 345** |
| `/js/belchertown.js` | **752** |
| `/json/weewx_data.json` | **663** |
| `/style.css` | **581** |
| `/belchertown-dark.min.css` | **577** |
| `/sitemap.xml` | **568** |
| `/reports/` | **351** |
| `/json/homepage.json` | **274** |
| `/json/forecast.json` | **272** |
| `/mqtt` | **251** |
| `/records/` | **243** |

Příklady URL výše jsou běžné veřejné cesty bez soukromých parametrů. `/json/weewx_data.json` (663× 200), `/json/homepage.json` (274× 200), `/json/forecast.json` (272× 200) a `/mqtt` tvoří důležitý profil datových aktualizací.

### MQTT/WebSocket
- **251 požadavků `/mqtt`**: **250× 101** (úspěšný handshake na WebSocket) a **1× 502** (30. 10. 2026 kolem 15:56:52).
- HTTP log **neobsahuje** spolehlivé počty současně otevřených socketů, přenesených MQTT zpráv nebo reálných obnovovacích intervalů. Pro nový portál vyžadujeme metriky brokeru, reconnectů a případné fronty/backpressure.
- Záznam jedné 502 neprokazuje dlouhodobý výpadek; pro přesnou příčinu korelovat s brokerem a NPM error logem.

### Automatizované zdroje a hranice klasifikace
- Jednoznačně deklarované `WEDOS OnLine monitoring`: **2 591 requestů**, přenesených **63,44 MiB**.
- Jednoznačně deklarované `webcam-atlas`: **1 979 requestů**, přenesených **77,40 MiB**.
- Součet těchto dvou identifikovaných agentů: **4 570 požadavků, 140,85 MiB** (asi 44,3 % logovaného objemu). User-Agent může být podvržen a proto to nejsou ověřené totožnosti klientů.
- Předchozí expertní heuristické rozdělení v konverzaci bylo: skenery **31 638** (57,6 %), deklarovaní boti **8 567** (15,6 %), WEDOS + webcam-atlas **4 570** (8,3 %), nezatříděný zbytek **10 191** (18,5 %). **Tato čtyřcestná kategorizace není reprodukovatelná z publikované metodiky** a je nutno ji označit jako orientační klasifikaci, ne auditovanou pravdu. Pevně reprodukované jsou celkové statusy, časové špičky, počty veřejných cest a deklarovaní dva agenti.
- IP adresa není ekvivalent uživatele; z `4 815` IP nelze odvozovat `4 815` lidí. Matomo naopak roboty a statická aktiva obvykle nezapočítává do návštěv.

## Rizika a praktická doporučení pro Node.js/Go
1. **Nginx/NPM**: levné odmítnutí zjevně neplatných URL, limitování burstů a rate limit s ohledem na legitimní monitoring, crawly a velké NAT; pravidla testovat bez blokování reálných návštěvníků.
2. **Node.js Fastify**: přesně definované routes a allowlist query parametrů, limity velikosti odpovědí, rychlá generická 404 bez dotazu DB, žádná drahá výpočetní práce na neznámé URL.
3. **Cache a data**: statiku obsluhovat přes proxy; pro /current krátká TTL, 24h/30d downsample, roční statistiky z předpočítaných agregátů. Nesměšovat načítání JSON v přítomném Belchertown s budoucím chováním nového API.
4. **Monitoring**: měřit p95/p99, CPU, RSS, event-loop delay, cache hit, DB wait, otevřená MQTT spojení a reálné pětiminutové aktualizace.
5. **Bezpečnost**: z logu není doložen úspěšný exploit, ale je důvod validovat grafové query parametry (Matomo dříve zachytil podezřelý vstup).
6. **Benchmark testovacího prostředí**: lehké a střední reálné scénáře, plus **izolovaný** simulovaný náraz 250 404/s na NPM/staging. Nikdy nepoužívat produkční MariaDB k intenzivnímu zátěžovému testování.

## K čemu log nestačí
Nelze z něj spolehlivě určit počet simultánních návštěvníků, skutečnou latenci dotazů do DB, délku spojení WebSocket, uživatelskou angažovanost, úspěšnost exploitů ani budoucí výkonnost úplně nové aplikace. Soubor vykazuje i významné automatizované chování; průměrné RPS přes celý měsíc podhodnocuje význam krátkých burstů.

**Další zdroje:** [Matomo](MATOMO_AUDIT_2026-10-31.md) · [ADR](ARCHITECTURE_DECISION_2026-10-31.md) · [Metodika a soukromí](SOURCES_AND_REPRODUCIBILITY.md).
