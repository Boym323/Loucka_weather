# FRONTEND_SPEC – Loučka Weather

Status: **NÁVRH K REVIZI**, ne hotová implementace. Vydání 2026-10-30.
Zdroj vizuálního směru: tmavé návrhy v předchozí konverzaci; obrázky dosud nejsou uložené v repozitáři. Bez schválených referenčních souborů nelze tvrdit pixelovou shodu.

## 1. Produktová vize a design
Meteorologický portál pro Loučku: přesnost před efekty, snadná orientace, transparentní zdroj/čas/kvalita měření. Nekopírovat přímo Belchertown. Primární jazyk čeština, lokalizace cs-CZ, čas Europe/Prague, metrické zobrazení.

### Design tokens – návrh v1
- Pozadí dark `#081726`; povrch `#12283C`; vyšší povrch `#19354B`.
- Text hlavní `#F5F9FF`, vedlejší `#A6B8CB`, akcent `#42DFB3`.
- Stavové barvy (warning/error/info/success) musí projít kontrastní kontrolou; barva nesmí být jediným nositelem informace.
- Light režim je plnohodnotná druhá paleta, ne pouhé invertování.
- Kontejnery max. 1600 px, fluidní okraje 16/24/32 px.
- Rozestupy v násobcích 4 px; radius 12–16 px; dobře viditelný focus; robustní dlouhé české popisky.
- Systémové písmo nebo lokálně dodávané open-source písmo, bez závislosti na Google Fonts při vykreslení.
- Konstantní barvy veličin: teplota červenooranžová, srážky modrá, vlhkost tyrkysová, vítr zelená, tlak fialová, záření žlutá. Každá řada i čárový styl a legenda.
- Animace pouze účelné, respektovat `prefers-reduced-motion`.

### Layout
- Desktop >= 1200 px: 12 sloupců, sticky horní navigace, hero a detailní karty.
- Tablet 768–1199 px: 6/8 sloupců podle reálného obsahu; grafy plné šířky.
- Mobil < 768 px: 1 sloupec; horní lišta + přístupná rozbalovací navigace; žádná fixní překážka grafům.
- Všechny akce dostupné klávesnicí, cílový standard WCAG 2.2 AA.
- Nepoužívat realisticky vypadající falešná live čísla. Demo musí mít viditelné označení.

## 2. Informační architektura
| Cesta | Název | Priorita | Smysl |
|---|---|---|---|
| / | Přehled | MVP | Aktuální měření, výstrahy, 24h graf, kamera/radar |
| /aktualne | Aktuálně | MVP | Všechny dostupné veličiny, denní extrémy |
| /grafy | Grafy a historie | MVP+ | Detailní interaktivní graf s filtrací |
| /klimatologie | Klimatologie | Fáze 2 | Roční trendy, rekordy, charakteristické dny |
| /puda | Půda | Fáze 2 | Teplotní profil/hloubky, vlhkost, srážky |
| /ovzdusi | Ovzduší | Fáze 2 | PM2,5 a podmínky interpretace |
| /senzory | Senzory a stav | MVP | RSSI, baterie, časy, výpadky, diagnostika |
| /kamera | Kamera | Fáze 2 | Aktuální snímek, archiv a časosběr |
| /mapy | Radar a mapy | Fáze 3 | Mapové vrstvy a časová animace |
| /vystrahy | Výstrahy | Fáze 3 | CAP ČHMÚ, platnost, zdroje |
| /predpoved | Předpověď | Fáze 3 | Hodinová/denní predikce, modely |
| /o-stanici | O stanici | MVP+ | Hardware, změny měření, licence, metodika |

Neexistující soubory nebo neověřené zdroje nedoplňovat zástupnými platnými hodnotami. Navigace může být postupně rozšiřovaná, ale každá publikovaná položka musí fungovat.

## 3. Společné komponenty a stavy
Komponenty: SiteHeader, SiteNav, SectionHeading, CurrentWeatherHero, MetricCard, DayExtremes, TimeRangeSelector, VariablePicker, WeatherChart, QualityBadge (nikoli univerzální štítek), FreshnessIndicator, SensorHealth, RadarPanel, AlertPanel, ForecastPanel, CameraPanel, StatisticsTable, DataSourceAttribution, ErrorFallback.

Každá datová komponenta podporuje (kde smysluplné): loading / live / stale / missing / suspect / corrected / reconstructed / error. Datum/čas měření se musí odlišovat od času načtení či publikace. Při výpadku ČHMÚ nikdy nepsat „bez výstrah“, nýbrž „stav se nepodařilo ověřit“.

### Výchozí layout homepage – desktop
1. Horní navigace: logo + přehled / grafy / klimatologie / půda / radar / kamera / senzory / více; přepínač motivu.
2. Nad obsahem nenápadný pás: místo, zdroj a stáří měření, dostupnost stanice.
3. Hero (cca 7/12): velká teplota, stav počasí (jen při podkladových datech), denní min/max s časem, sekundární veličiny. Vedle (5/12) předpověď a aktuální výstrahy, včetně stavu zdroje.
4. Mřížka metrik: vítr, srážky, tlak, vlhkost, záření/UV, PM2,5.
5. Široký 24h graf (min. 8/12), vpravo denní souhrn/rekordy.
6. Kamera + radar na samostatných kartách, obě s atributy času a zdroje.
7. Krátká klimatologická zajímavost z validovaných dat + diagnostika senzorů.
8. Patička: zdroje, metodika, licence, kontakt, stav dat.

### Mobil
Pořadí: stav stanice, aktuální teplota, platná výstraha, kritické metriky, 24h graf, předpověď, kamera, radar, více statistik. Rozbalení karet místo nekonečné mřížky; žádné gestem skryté jediné ovládání.

## 4. Detail stránek
### /grafy
Jeden dominantní graf 100 % šířky, ovládací lišta: veličina/veličiny, období (1h/24h/7d/30d/rok/vlastní), agregace, zdroj, zahrnout/nezahrnout rekonstrukce, zobrazení kvality. Tooltip lokální čas včetně offsetu v přechodu DST; nulové vs NULL. Zoom, pan, legenda s jednotkami, export CSV obsahující provenance/quality; pod grafem statistické karty a tabulka přístupná čtečkám.

### /klimatologie
Roční a měsíční srovnání, kalendář „tento den v historii“, heatmapy teplot, charakteristické dny, historické rekordy s datem a kvalitou, výběr let a ukazatele úplnosti. Neúplné období se neřadí jako rekord bez metadat/filtru.

### /puda
Hloubkový profil a více časových řad, jména sond podle časově platné historie hardwaru; nezaměnit soilTemp/extraTemp. Porovnání s deštěm, stanovištěm a sezónou; chybějící sondu explicitně označit.

### /senzory
Karta GW3000 a každého senzoru: typ, poslední doložené měření, diagnostická telemetrie, stav baterie/RSSI pokud dodáváno, latence, historie výpadků. Chybějící RSSI ≠ automaticky offline.

### /kamera
Aktuální snímek (reálný čas pořízení, stale stav), archiv s datepickerem a časovou osou, denní timelapse s rozlišenou retencí. Bez autoplay zvuku. Významná disková zátěž se nesmí přesunout do rootfs bez politiky úložiště.

### /vystrahy a /mapy
ČHMÚ CAP: stav, pravděpodobnost/stupeň dle dostupných polí, vydání/změna/rušení, platnost časová i územní, link na originál. Mapy s legendou, časem produktu, jménem poskytovatele a licencí. Zastarávající radar se vizuálně přizná.

## 5. Grafy – metodika UX
- ECharts modulárně, neimportovat vše pro jedinou linii.
- Časové osy v lokálním čase s možností zobrazení UTC offsetu u přechodů DST.
- Průměry, minima, maxima, sumy a intenzity nesměšovat bez uvedení statistiky.
- Převzorkování musí zachovat min/max a mezery; srážkový součet neudělat průměrem.
- V popisku vždy „Měření“, „Rekonstrukce“, „Model“ nebo „Externí stanice“.
- Vykreslovat podle skutečných datapointů; náhodné hodnoty jsou povolené pouze v testech a v označeném demo režimu.

## 6. Přístupnost, SEO, výkon
- WCAG 2.2 AA, klávesnice, alternativy grafů, pozor na barvoslepost a kontrast.
- Semantické nadpisy, meta title/description po stránkách, OpenGraph, sitemap, canonical.
- Úvodní stránka funkční s vypnutým klientským JS alespoň jako srozumitelná statická obálka a stav dat.
- Cíle pro kontrolní mobilní profil: LCP <=2,5 s, CLS <=0,1, INP <=200 ms (reálná měření a definovaná síť/zařízení); neslibovat bez benchmarku.
- Limit JS po stránkách stanovit až po prvním buildu; rozlišit SVG ikony, foto, mapu a ECharts chunk.
- Testovat 390, 768, 1440 px; light/dark; loading/stale/error/missing; long text; screenshot regrese.

## 7. Hotovo znamená
Vytvořenou stránku lze otevřít bez interních tokenů; reaguje na správné datové kontrakty; ukazuje zdroj, čas i kvalitu; chování na mobilu a při výpadku je otestované; nedochází k přímému SQL z prohlížeče; žádná produkční data nejsou vymyšlena.

## 8. Otevřené volby
- D1: výchozí motiv tmavý vs systémový (doporučení: systémový s tmavým návrhem jako referencí).
- D2: více rozšířených sekcí v hlavní navigaci vs kompaktní „Více“ (doporučení: kompaktní).
- D3: živá data přes WeeWX výstup vs lokální GW3000 API (ověřit z konfigurace, nehádat).
- D4: přesné referenční screenshoty jako schválené designové artefakty – dodat do repozitáře v další fázi.

Odkazy: https://docs.astro.build/en/guides/on-demand-rendering/ ; https://echarts.apache.org/ ; https://www.w3.org/TR/WCAG22/
