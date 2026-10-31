# Loučka Weather

> **NOVÉ OVĚŘENÉ ARCHITEKTONICKÉ PODKLADY (31. 10. 2026):** [Dokumentace v hlavní větvi main](https://github.com/Boym323/Loucka_weather/blob/main/docs/PROJECT_CONTEXT.md), [ADR Node.js / Go / Rust](https://github.com/Boym323/Loucka_weather/blob/main/docs/ARCHITECTURE_DECISION_2026-10-31.md), [Nginx audit 54 966 requestů](https://github.com/Boym323/Loucka_weather/blob/main/docs/TRAFFIC_AUDIT_2026-10-31.md), [Matomo](https://github.com/Boym323/Loucka_weather/blob/main/docs/MATOMO_AUDIT_2026-10-31.md), [benchmarková syntéza](https://github.com/Boym323/Loucka_weather/blob/main/docs/BENCHMARK_SYNTHESIS_2026-10-31.md). **Předběžně preferován Node.js + Fastify pro API v1**, nikoliv bezpodmínečné Go. Tato benchmarková větev je stále **draft PR #2**. Pro budoucí práci používej `main/docs/` jako zdroj nejnovějšího kontextu.


Nový meteorologický portál pro https://pocasi-loucka.eu/ – **návrhová fáze**.

Tento repozitář se inicializuje dokumentací; zatím **neobsahuje běžící web** ani automatizované změny produkce.

## Směr projektu
- Ecowitt GW3000 a stávající WeeWX zůstávají sběrnou vrstvou.
- Stávající MariaDB s historickými daty zůstává; původní archiv je bez zásahů.
- Web: Astro + TypeScript; grafy ECharts; statický build mimo produkci.
- Oddělené read-only API nad stávající MariaDB: **pro v1 preferováno Go** na základě [skutečného LXC benchmarku](benchmark/REAL_LXC_FULL_2026-10-30.md) a [syntetického CI benchmarku](benchmark/BENCHMARK_RESULTS_2026-10-30.md). Rust a Python zůstávají podložené alternativy; produkční API ještě není implementováno.
- Tři LXC: stávající WeeWX, MariaDB a nový frontend + datová vrstva.
- Nový web nejprve pouze na stagingu. Produkční Belchertown zůstává dostupný.

Rozpracovaná specifikace bude ve větvi `docs/frontend-audit-v1`. Rozhodnutí s otevřenými variantami je třeba odsouhlasit před implementací.

## Zásadní bezpečnostní pravidla
- Žádné zápisy do produkčních databází ani změny WeeWX bez výslovného schválení.
- Nevystavovat přihlašovací údaje, interní adresy ani kamerová URL.
- Nepokládat chybějící měření za 0, nevydávat rekonstruované hodnoty za původní.

## Ověření backendu (30. 10. 2026)

Na testovacím LXC `zl-dev-AuditMeteo` byly spuštěny Go, Rust a Python servery proti **živé produkční MariaDB WeeWX 11.8.6** s účtem pouze `SELECT`. `./run.sh full`: 36/36 scénářů, 0 HTTP chyb, shodné výsledky endpointů. Pool každého serveru omezen na **1 spojení** kvůli účtovému limitu `max_user_connections=4`. U historie 30 dní / 10 klientů: Go 24,32 RPS, Rust 15,84 RPS, Python 6,81 RPS; Python vycházel lépe u malých odpovědí, Rust měl nejnižší RSS. Číselné výsledky pocházejí z terminálového výpisu, nikoliv ze stažených souborů LXC. Nejde o potvrzení nulového vlivu na WeeWX writer ani maximální výkon při 50 klientských spojeních.

[Úplný report z reálného LXC](benchmark/REAL_LXC_FULL_2026-10-30.md) · [Benchmarkové PR #2](https://github.com/Boym323/Loucka_weather/pull/2)


## Rozšířené ověření všech šesti backendů (30. 10. 2026)

Na testovacím LXC proti skutečné produkční MariaDB WeeWX proběhl další read-only `light` benchmark se **šesti** implementacemi: Go, Rust, Python, Node.js, C++ a PHP CLI. **24/24 scénářů PASS, 0 HTTP chyb**. C++ vedlo u krátkých odpovědí (`current` 59,26 RPS); Go mírně vedlo u historie 30 dní s 8 638 měřeními (19,92 RPS oproti 18,78 C++ a 18,08 Rust). Rust měl nejnižší zaznamenanou RSS. Preferovaná volba pro API v1 **zatím zůstává Go**, ale C++ je důležitá změřená alternativa.

[Úplné výsledky a metodická omezení](benchmark/REAL_LXC_SIX_LANGUAGES_LIGHT_2026-10-30.md). Tento konkrétní `light` běh měl jen 1 souběžného klienta a pro 30denní historii pouze 3 requesty na backend. Pro finální kapacitní rozhodnutí je nutné opakování na izolované DB kopii; PHP bylo měřeno vestavěným CLI HTTP serverem, ne PHP-FPM.


## Analýza původního JSON – šestijazyčný full benchmark (2026-10-30)

[Úplný rozbor skutečného exportovaného JSON](benchmark/REAL_LXC_SIX_LANGUAGES_FULL_2026-10-30.md): nahraný ZIP obsahoval **jeden**, nikoliv tři kompletní full běhy (72/72 scénářů bez HTTP chyb, celkem 13 032 požadavků). Ověřená konfigurace: **DB pool=3**; metadata nesprávně tvrdí `isolated_copy=true`, ale uživatel potvrdil, že běžela **produkční MariaDB**. Scénář `30d c=50` provádí jen 24 requestů celkem, takže nešlo o 50 skutečně současných požadavků. Naměřené výkony jsou podnětné, ale nerozhodují definitivně o backendu. Další plné testy pouze na izolovaném staging snapshotu.


## Dvě skutečná šestijazyčná FULL měření – vyhodnocení původních JSON (2026-10-30)

[Úplná analýza dvou běhů](benchmark/REAL_LXC_SIX_LANGUAGES_FULL_TWO_RUNS_2026-10-30.md) ověřila **144/144 scénářů, 26 064 úspěšných HTTP požadavků, 0 chyb**. Oba běhy měly `pool_max=3` a proběhly proti **živé produkční MariaDB**, ač jejich chybně nastavená metadata uvádějí `isolated_copy=true`. Třetí běh v nahraném ZIP nebyl. Go vedlo u historie 30 dní a c=10 v obou měřeních (24,89/31,34 RPS). C++ vedlo u 24h/c=10; Node.js výrazně kolísal při delší historii a vyšší souběžnosti. `30d c=50` odesílá jen **24 požadavků celkem**: nejde o ověřenou souběžnost 50. Další plné zátěžové testy patří na izolovanou kopii MariaDB.


## Tři plné šestijazyčné benchmarky – konečná agregace 2026-10-30

Po doplnění třetího JSON proběhla kontrola **216/216 scénářů**, celkem **39 096 HTTP požadavků bez chyby**. [Agregace všech tří běhů](benchmark/REAL_LXC_SIX_LANGUAGES_FULL_THREE_RUNS_2026-10-30.md) počítá medián RPS/p95 ze tří měření, maximum RAM a variabilitu. Pro `30d c10` Go vedlo ve všech bězích (24,89 / 31,34 / 36,67 RPS; medián 31,34), před C++ (medián 21,80), PHP CLI (19,89), Node.js (17,37), Rust (15,85) a Pythonem (6,05). C++ vedlo u mediánů krátkých odpovědí. **Všechny tři testy běžely proti produkční DB s `pool_max=3`, přestože `isolated_copy=true` v JSON uvádí opak.** Dále `30d c50` není skutečných 50 klientů – jen 24 požadavků celkem. Další full jen na samostatné kopii MariaDB. Go zůstává předběžně doporučené pro API v1.


## Offline benchmark přepočtu vlastních meteorologických statistik (2026-10-31)

K původnímu HTTP/SQL benchmarku přibyl [samostatný výpočetní benchmark šesti backendů](benchmark/compute/README.md): **Go, Rust, Python, Node.js, C++20, PHP**. Na normalizovaném lokálním TSV počítá denní/měsíční/roční/celohistorické souhrny, časově váženou teplotu a vlhkost, srážky, vektorový vítr, extrémy a identifikaci rekonstruovaných měření. Kontroluje úplnou numerickou shodu všech jazyků včetně všech dnů a měsíců. **Neobsahuje spojení k MariaDB; všechny výkonnostní běhy jsou offline.** Reálná data lze importovat pouze z **existujícího lokálního CSV/TSV exportu** pomocí normalizátoru (WeeWX US/METRIC/METRICWX, Europe/Prague, intervalové hranice). Syntetické profily: 288 / 10 000 / 105 120 / 1 680 000 záznamů. GitHub Actions provádí parity smoke/light; výkonové výsledky je třeba změřit na cílovém testovacím LXC. Původní rozhodnutí o Go z HTTP testů tím zatím není potvrzeno ani vyvráceno.


## Offline benchmark vlastních meteorologických statistik (2026-10-31)

[Šestijazyčné měření na reálném testovacím LXC](benchmark/compute/REAL_LXC_OFFLINE_RESULTS_2026-10-31.md): **72/72 výpočetních pokusů PARITY PASS**, offline syntetická data (žádný DB load). U 1 680 000 řádků **Rust medián 4,10 s a 107,23 MiB RAM**, Go **5,26 s a 422,54 MiB**. Zatímco Go vycházelo vhodně pro HTTP API a historické grafy, Rust je v aktuálních implementacích nejrychlejší a nejúspornější pro celohistorický dávkový přepočet. Rozhodnutí o Rust workeru odložit do porovnání optimalizovaného Go a reálného lokálního exportu WeeWX.
