# Počasí Loučka – skutečná návštěvnost podle Matomo

**Čteno 31. 10. 2026**, zdroj: připojený read-only Matomo site ID **1** `pocasi-loucka.eu`; časová zóna **Europe/Prague**. Report za říjen je získán **během 31. října**, tedy není uzavřeným konečným měsíčním reportem.

## Přehled návštěvnosti

| Období roku 2026 | Návštěvy | Unikátní návštěvníci | Akce |
|---|---:|---:|---:|
| Leden | 53 | 19 | 71 |
| Únor | 0 (Matomo nevykazuje data) | 0 | 0 |
| Březen | 119 | 43 | 194 |
| Duben | 132 | 38 | 200 |
| Květen | 187 | 46 | 352 |
| Červen | 196 | 57 | 290 |
| Červenec | 214 | 46 | 347 |
| Srpen | **321** | 67 | **478** |
| Září | 214 | 85 | 323 |
| Říjen (průběžně) | **216** | **73** | **314** |

Únorový nulový výsledek **není důkazem, že web neměl žádné skutečné návštěvníky**; může jít i o chybějící měření/tracking. Údaje Matomo nelze přímo sčítat jako unikátní lidi za více měsíců.

### Říjen 2026 – chování
- **216 návštěv**, **73 unikátních návštěvníků**, **314 akcí**.
- `bounce_rate` cca **71 %**, průměr **1,5 akce na návštěvu**, průměrná délka návštěvy **72 sekund**.
- Matomo uvádí **155 návštěv vracejících se návštěvníků** a **61 prvních návštěv** (podíl vracejících se návštěv **71,8 %**). Nesměšovat unikátní vracející se uživatele s počtem opakovaných návštěv.
- **Nejvyšší denní počet návštěv v říjnu do 30. 10.: 14** (27. a 29. 10.). To není počet současných návštěvníků a není to HTTP RPS.
- Podle `Live.getCounters` bylo v okamžiku dotazu za posledních 30 minut **0** zaznamenaných návštěv – jde o jediný okamžik, nikoliv o měření kapacity.

### Nejnavštěvovanější stránky – říjen
Rozdělení z **314 zaznamenaných zobrazení** `Actions.getPageUrls`:

| Skupina | Zobrazení | Podíl |
|---|---:|---:|
| Úvodní stránka `/` | **186** | 59,2 % |
| Grafy `/graphs/` včetně parametrů | **107** | 34,1 % |
| Reporty `/reports/` | **15** | 4,8 % |
| Rekordy `/records/` | **4** | 1,3 % |
| Ostatní | **2** | 0,6 % |

Z grafů: základní `/graphs/` **58** zobrazení; `?graph=week` **35**; `?graph=month` **7**; `?graph=year` **3**; `?graph=2025` **2**; zbývající dvě návštěvy grafových variant zahrnují jiné hodnoty parametru, z nichž jedna obsahovala podezřelý HTML/JS payload. **Samotný zaznamenaný payload není důkazem úspěšného XSS.**

**Časy načtení podle Matomo (metrika prohlížeče, není to p95 backendu):** úvod `/` průměrně **0,776 s**; základní `/graphs/` **0,504 s**; `?graph=week` **1,362 s**. U jednotlivých URL s malým počtem měření jsou statistiky nevypovídající.

### Zařízení
- Desktop: **102 návštěv** (47,2 %).
- Chytrý telefon: **79 návštěv** (36,6 %).
- Phablet: **35 návštěv** (16,2 %).
- Kombinace telefon + phablet: **114/216 = 52,8 %**. Nový portál musí být **mobile-first** v praxi, zejména grafy a výběr historie.

### Zdroje návštěv
- Přímá návštěva: **191** (88,4 %).
- Vyhledávače: **18** (8,3 %).
- Odkazující weby: **7** (3,2 %).
- Metriky zdrojů návštěv nejsou totéž jako skutečný přenos dat nebo unikátní IP.

## Vztah k proxy logům
Nginx ve stejném širším období zaznamenal **54 966 HTTP událostí** včetně obrázků, CSS/JS, monitoringu, crawlerů a bezpečnostního sondování. Matomo sleduje zejména návštěvy a stránkové akce. Tyto hodnoty **nelze přímo porovnávat jako počty návštěvníků**. Rozpor v řádu velikosti je očekávaný. Do kapacitního návrhu patří obojí.

## Dopady na návrh webu
- Prioritizovat **aktuální počasí a grafy**, protože převažují nad reporty a rekordy.
- Grafy navrhovat na mobil, s omezením vykreslených bodů a přehledným ovládáním období.
- Aktualizace aktuálního stavu a grafů oddělit od nákladných celohistorických výpočtů.
- Matomo samo nezměří počet WebSocket spojení, backend CPU nebo SQL složitost; pro to potřebujeme vlastní telemetry.

[Celý HTTP audit](TRAFFIC_AUDIT_2026-10-31.md) · [Architektonický návrh](ARCHITECTURE_DECISION_2026-10-31.md) · [Původ dat a metodika](SOURCES_AND_REPRODUCIBILITY.md).
